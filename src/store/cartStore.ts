// カート(今回の買い物)の状態管理。
//
// 【フェーズ2でFirestoreへ全面移行】以前はsql.js(端末内のみのDB)を
// 使っていたが、パートナーとリアルタイムで共有できるようにするため、
// Firebase Firestore(クラウド上のデータベース)に置き換えた。
// Firestoreは「オフラインでも読み書きでき、オンラインに戻ったら自動で
// 同期する」機能が標準で入っているため、以前のような「メモリ上で
// 即時計算→裏側でSQLiteに保存するキュー」を自前で作る必要がなくなり、
// 構成がシンプルになっている。画面の状態は基本的にFirestoreの
// onSnapshot(リアルタイム購読)で更新される。

import { create } from 'zustand'
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  increment,
  writeBatch,
  type CollectionReference,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { ensureSignedIn, getSavedHouseholdId } from '../firebase/household'
import { toComparableValue, diffComparableValues } from '../utils/priceCompare'
import { PRODUCT_CATALOG } from '../data/productCatalog'

export type Product = {
  id: string
  name: string
  category: string | null
  amount: number | null
  unit: string | null
  default_price: number | null
  is_favorite: boolean
  created_at: string
}

export type CartItem = {
  purchaseId: string
  productId: string
  name: string
  price: number
  quantity: number
}

/**
 * 事前買い物予定リストの項目。自宅で自由入力した「仮の商品名」を保持する。
 * product_idは今のところ常にnull(店内でカートに追加する瞬間に商品を
 * 決める設計のため)。将来ProductAlias(表記ゆれ吸収)を実装したら、
 * 一度紐付けた組み合わせを記憶して自動候補に使う想定。
 */
export type WishlistItem = {
  id: string
  raw_name: string
  product_id: string | null
  created_at: string
}

/**
 * 商品ごとの「直近の購入価格・購入回数」のまとめ。
 * 会計完了済みのトリップだけを対象にする(進行中のカートは含めない)。
 */
export type PurchaseSummary = {
  lastPrice: number
  lastAmount: number | null
  lastUnit: string | null
  count: number
}

export type CatalogSuggestion = {
  /** 定番棚に既にある商品ならそのid、商品名候補データベースのみの場合はnull */
  id: string | null
  name: string
  category: string | null
  default_price: number | null
  amount: number | null
  unit: string | null
}

type Screen = 'loading' | 'budget-setup' | 'shopping'

type CartState = {
  screen: Screen
  tripId: string | null
  budget: number
  /**
   * 「今回買う予定」でチェックした商品idの一覧。買い物開始時にトリップへ
   * 記録し、買い物中の画面で「予定だがまだカートに入れていない」商品を
   * 目立たせるために使う(カートの中身そのものではない点に注意)。
   */
  plannedProductIds: string[]
  favorites: Product[]
  cartItems: Record<string, CartItem> // key: productId
  wishlist: WishlistItem[]
  purchaseSummaryByProduct: Record<string, PurchaseSummary> // key: productId
  errorMessage: string | null

  init: () => Promise<void>
  /**
   * 買い物を開始する。plannedProductIdsは「今回買う予定」でチェックして
   * いた商品のid一覧(買い物中の画面での目印表示にのみ使う)。
   * 以前はここで定番棚の商品を自動でカートに一括投入していたが、
   * 「価格・内容量は店内でカートに入れる瞬間に確認・入力したい」という
   * 方針に変更したため、開始時点ではカートは空にする。
   */
  startTrip: (budget: number, plannedProductIds: string[]) => Promise<void>
  /**
   * 買い物中に予算を直接書き換える。買い物前の画面で1回設定したら
   * 固定、ではなく、現地で見積もりが変わった時にその場で直せるように
   * している(予算という値そのものに対する直接操作)。
   */
  updateBudget: (budget: number) => Promise<void>
  /**
   * 今回の価格・内容量・単位・数量を指定してカートに追加する(新規追加)。
   * 前回購入時の値をそのまま使う「ワンタップ追加」も、値を編集してから
   * 追加する場合も、どちらもこの関数を通る。
   */
  addToCartWithDetails: (
    product: Product,
    details: { price: number; amount: number | null; unit: string | null; quantity: number },
  ) => void
  /**
   * 既にカートに入っている商品の数量だけを+1する(価格・内容量には
   * 触れない)。同じ商品をもう1個追加する時に、価格入力をもう一度
   * 挟まずに済ませるためのワンタップ操作。
   */
  incrementCartQuantity: (productId: string) => void
  decrementFromCart: (productId: string) => void
  /** カートからその商品を(数量に関わらず)まるごと取り除く */
  removeCartItem: (productId: string) => void
  addFavoriteProduct: (
    name: string,
    price: number,
    amount: number | null,
    unit: string | null,
    /** 商品名候補データベースなどから既存の定番棚商品を選んだ場合、その商品idを渡す */
    matchedProductId?: string | null,
    /** 商品名候補データベースから選んだ場合のカテゴリ(新規作成時のみ使う) */
    matchedCategory?: string | null,
  ) => Promise<Product>
  updateProductPrice: (productId: string, price: number) => Promise<void>
  /**
   * 過去の購入記録(Purchase)を1件だけ訂正する。入力ミスに気づいた時に、
   * その商品を丸ごと削除するのではなく、該当の1件だけを直せるように
   * するための機能。前回価格・購入回数の集計に影響するため、成功後に
   * refreshPurchaseSummaryも呼ぶ。
   */
  updatePurchaseRecord: (
    purchaseId: string,
    updates: { price: number; quantity: number; amount: number | null; unit: string | null },
  ) => Promise<void>
  /** 過去の購入記録を1件だけ削除する(商品自体や他の履歴には影響しない) */
  deletePurchaseRecord: (purchaseId: string) => Promise<void>
  /** マイ定番棚管理画面からの編集。名前・価格・内容量・単位・カテゴリをまとめて更新する */
  updateFavoriteProduct: (
    productId: string,
    updates: { name: string; price: number; amount: number | null; unit: string | null; category: string | null },
  ) => Promise<void>
  /**
   * マイ定番棚から外す(ソフトデリート)。商品ドキュメント自体や過去の
   * 購入履歴(Purchase)は消さず、isFavoriteをfalseにするだけにとどめる。
   * 実際に削除してしまうと、値上がり/値下がり比較などで使っている
   * 過去の購入履歴が参照する商品情報を失ってしまうため。
   */
  removeFavoriteProduct: (productId: string) => Promise<void>
  /**
   * 商品を完全に削除する(ハードデリート)。removeFavoriteProductとは
   * 違い、商品ドキュメント自体と、その商品にひもづく購入履歴
   * (Purchase)もまとめて消す。テストで適当に登録してしまった商品や、
   * 誤って会計を完了させてしまった記録など、「本当に無かったことに
   * したい」場合向け。元に戻せないため、呼び出し側で確認ダイアログを
   * 挟むこと。
   */
  deleteFavoriteProductPermanently: (productId: string) => Promise<void>
  completeCheckout: () => Promise<void>
  addWishlistItem: (rawName: string) => Promise<void>
  /** 事前リストのメモの表記を直接書き換える(打ち間違えた時に削除→再登録せずに直せる) */
  updateWishlistItem: (wishlistId: string, rawName: string) => Promise<void>
  removeWishlistItem: (wishlistId: string) => Promise<void>
  /** 会計完了後などに、前回価格・購入回数の集計をFirestoreから取り直す */
  refreshPurchaseSummary: () => Promise<void>
}

/** 現在のカート内合計金額を計算する(メモリ上の状態だけで完結、高速) */
export function calcTotal(cartItems: Record<string, CartItem>): number {
  return Object.values(cartItems).reduce((sum, item) => sum + item.price * item.quantity, 0)
}

/**
 * 内容量(g/mlなど)が登録されている商品の単価を計算して表示用の文字列にする。
 * 内容量・単位が未入力の商品ではnullを返す(単価表示自体を省略する)。
 */
export function calcUnitPriceLabel(product: Product): string | null {
  if (!product.unit || !product.amount || product.amount <= 0 || !product.default_price) {
    return null
  }
  const unitPrice = product.default_price / product.amount
  return `¥${unitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${product.unit}`
}

/**
 * カートに追加する時の「今回の価格・内容量・単位」の初期値(提案値)を
 * 決める。直近の購入履歴があればそれを優先し(=直近で購入した価格を
 * 採用する、という方針)、購入履歴がない(まだ一度も買ったことがない)
 * 商品の場合は登録時の価格・内容量・単位を使う。
 */
export function getSuggestedCartDetails(
  product: Product,
  summary: PurchaseSummary | undefined,
): { price: number; amount: number | null; unit: string | null } {
  return {
    price: summary?.lastPrice ?? product.default_price ?? 0,
    amount: summary?.lastAmount ?? product.amount,
    unit: summary?.lastUnit ?? product.unit,
  }
}

/**
 * 商品名の入力補助のため、商品名候補データベース(costcotuu.comの一覧。
 * まだ我が家で買ったことがない参考データ)と、現在の定番棚の両方から
 * 名前で検索する。定番棚に既にある商品は(価格などの実データがあるので)
 * 優先して表示する。
 */
export function searchProductCatalog(
  query: string,
  favorites: Product[],
  limit = 15,
): CatalogSuggestion[] {
  const trimmed = query.trim().toLowerCase()
  if (trimmed.length === 0) return []

  const favoriteMatches: CatalogSuggestion[] = favorites
    .filter((p) => p.name.toLowerCase().includes(trimmed))
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      default_price: p.default_price,
      amount: p.amount,
      unit: p.unit,
    }))

  const favoriteNames = new Set(favoriteMatches.map((p) => p.name))
  const catalogMatches: CatalogSuggestion[] = PRODUCT_CATALOG.filter(
    (entry) => entry.name.toLowerCase().includes(trimmed) && !favoriteNames.has(entry.name),
  ).map((entry) => ({
    id: null,
    name: entry.name,
    category: entry.category,
    default_price: null,
    amount: null,
    unit: null,
  }))

  return [...favoriteMatches, ...catalogMatches].slice(0, limit)
}

function householdCollection(householdId: string, name: string): CollectionReference {
  return collection(db, 'households', householdId, name)
}

function requireHouseholdId(): string {
  const id = getSavedHouseholdId()
  if (!id) {
    throw new Error('家族コードが設定されていません。最初の画面からやり直してください。')
  }
  return id
}

/**
 * 商品ごとの「直近の購入価格・購入回数」をまとめて取得する。
 * 会計完了済みの購入だけを対象にする。件数が家庭利用の範囲では
 * 少ない(多くても数千件程度)ため、まとめて取得してからJavaScript側で
 * 集計している(Firestoreは複雑な集計クエリが苦手なため)。
 */
async function fetchPurchaseSummary(householdId: string): Promise<Record<string, PurchaseSummary>> {
  const snapshot = await getDocs(
    query(householdCollection(householdId, 'purchases'), where('tripStatus', '==', 'completed')),
  )
  const rows = snapshot.docs
    .map((d) => ({
      productId: d.data().productId as string,
      price: d.data().price as number,
      amount: (d.data().amount ?? null) as number | null,
      unit: (d.data().unit ?? null) as string | null,
      createdAt: d.data().createdAt as string,
    }))
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))

  const summary: Record<string, PurchaseSummary> = {}
  for (const row of rows) {
    const existing = summary[row.productId]
    if (existing) {
      existing.count += 1
    } else {
      summary[row.productId] = {
        lastPrice: row.price,
        lastAmount: row.amount,
        lastUnit: row.unit,
        count: 1,
      }
    }
  }
  return summary
}

export const useCartStore = create<CartState>((set, get) => ({
  screen: 'loading',
  tripId: null,
  budget: 0,
  plannedProductIds: [],
  favorites: [],
  cartItems: {},
  wishlist: [],
  purchaseSummaryByProduct: {},
  errorMessage: null,

  async init() {
    try {
      const householdId = requireHouseholdId()
      await ensureSignedIn()

      // マイ定番棚(is_favorite=trueの商品)をリアルタイム購読する
      onSnapshot(
        query(householdCollection(householdId, 'products'), where('isFavorite', '==', true)),
        (snapshot) => {
          const favorites: Product[] = snapshot.docs
            .map((d) => {
              const data = d.data()
              return {
                id: d.id,
                name: data.name as string,
                category: (data.category ?? null) as string | null,
                amount: (data.amount ?? null) as number | null,
                unit: (data.unit ?? null) as string | null,
                default_price: (data.defaultPrice ?? null) as number | null,
                is_favorite: true,
                created_at: (data.createdAt ?? '') as string,
              }
            })
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          set({ favorites })
        },
        (error) => set({ errorMessage: error.message }),
      )

      // 事前買い物予定リストをリアルタイム購読する
      onSnapshot(
        householdCollection(householdId, 'wishlist'),
        (snapshot) => {
          const wishlist: WishlistItem[] = snapshot.docs
            .map((d) => {
              const data = d.data()
              return {
                id: d.id,
                raw_name: data.rawName as string,
                product_id: (data.productId ?? null) as string | null,
                created_at: (data.createdAt ?? '') as string,
              }
            })
            .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
          set({ wishlist })
        },
        (error) => set({ errorMessage: error.message }),
      )

      // 進行中のトリップ(status=active)をリアルタイム購読する。
      // これがあることで、パートナーが先にトリップを開始した場合も
      // こちらの画面が自動的に「買い物中」に切り替わる。
      onSnapshot(
        query(householdCollection(householdId, 'shoppingTrips'), where('status', '==', 'active')),
        (snapshot) => {
          if (snapshot.empty) {
            set({ screen: 'budget-setup', tripId: null, budget: 0, plannedProductIds: [], cartItems: {} })
            return
          }
          // 万一複数あった場合は一番新しいものを採用する
          const trips = snapshot.docs
            .map((d) => ({
              id: d.id,
              budget: d.data().budget as number,
              startedAt: d.data().startedAt as string,
              plannedProductIds: (d.data().plannedProductIds ?? []) as string[],
            }))
            .sort((a, b) => (a.startedAt > b.startedAt ? -1 : 1))
          const trip = trips[0]
          set({
            screen: 'shopping',
            tripId: trip.id,
            budget: trip.budget,
            plannedProductIds: trip.plannedProductIds,
          })

          // このトリップのカート中身(purchases)もリアルタイム購読する
          onSnapshot(
            query(householdCollection(householdId, 'purchases'), where('tripId', '==', trip.id)),
            (purchaseSnapshot) => {
              const cartItems: Record<string, CartItem> = {}
              for (const d of purchaseSnapshot.docs) {
                const data = d.data()
                const quantity = data.quantity as number
                if (quantity <= 0) continue
                cartItems[data.productId as string] = {
                  purchaseId: d.id,
                  productId: data.productId as string,
                  name: data.productName as string,
                  price: data.price as number,
                  quantity,
                }
              }
              set({ cartItems })
            },
            (error) => set({ errorMessage: error.message }),
          )
        },
        (error) => set({ errorMessage: error.message }),
      )

      await get().refreshPurchaseSummary()
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : String(error) })
    }
  },

  async startTrip(budget, plannedProductIds) {
    const householdId = requireHouseholdId()
    const now = new Date().toISOString()
    await addDoc(householdCollection(householdId, 'shoppingTrips'), {
      budget,
      status: 'active',
      startedAt: now,
      completedAt: null,
      actualTotal: null,
      plannedProductIds,
    })
    // 実際の画面切り替えはshoppingTripsのonSnapshotで自動的に行われる
  },

  async updateBudget(budget) {
    const { tripId } = get()
    if (tripId === null) return
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'shoppingTrips'), tripId), { budget })
    // 画面表示への反映はshoppingTripsのonSnapshotで自動的に行われる
  },

  addToCartWithDetails(product, details) {
    const { tripId } = get()
    if (tripId === null || details.quantity <= 0) return

    const householdId = requireHouseholdId()
    const purchaseId = `${tripId}_${product.id}`
    const now = new Date().toISOString()

    // 数量も含めてこの1回のsetDocで確定させる(incrementではなく実数を
    // 書き込む)。価格・内容量・単位を「今回の実際の値」として明示的に
    // 保存することが目的のため、ここでは前の値とマージせず丸ごと上書きする。
    void setDoc(doc(householdCollection(householdId, 'purchases'), purchaseId), {
      productId: product.id,
      productName: product.name,
      tripId,
      price: details.price,
      amount: details.amount,
      unit: details.unit,
      quantity: details.quantity,
      createdAt: now,
      tripStatus: 'active',
    })
  },

  incrementCartQuantity(productId) {
    const { cartItems } = get()
    const existing = cartItems[productId]
    if (!existing) return

    const householdId = requireHouseholdId()
    const purchaseRef = doc(householdCollection(householdId, 'purchases'), existing.purchaseId)
    // 価格・内容量には触れず、数量だけを+1する(同じ商品を追加で
    // 1個カートに入れる操作。今回の価格を毎回聞き直さないための工夫)
    void updateDoc(purchaseRef, { quantity: increment(1) })
  },

  decrementFromCart(productId) {
    const { cartItems } = get()
    const existing = cartItems[productId]
    if (!existing) return

    const householdId = requireHouseholdId()
    const purchaseRef = doc(householdCollection(householdId, 'purchases'), existing.purchaseId)

    if (existing.quantity <= 1) {
      void deleteDoc(purchaseRef)
    } else {
      void updateDoc(purchaseRef, { quantity: increment(-1) })
    }
  },

  removeCartItem(productId) {
    const { cartItems } = get()
    const existing = cartItems[productId]
    if (!existing) return

    const householdId = requireHouseholdId()
    void deleteDoc(doc(householdCollection(householdId, 'purchases'), existing.purchaseId))
  },

  async addFavoriteProduct(name, price, amount, unit, matchedProductId = null, matchedCategory = null) {
    const householdId = requireHouseholdId()
    const now = new Date().toISOString()

    let targetId = matchedProductId
    let category = matchedCategory
    if (!targetId) {
      const existing = get().favorites.find((p) => p.name === name)
      if (existing) {
        targetId = existing.id
        category = existing.category
      }
    }

    if (targetId) {
      await updateDoc(doc(householdCollection(householdId, 'products'), targetId), {
        defaultPrice: price,
        amount,
        unit,
        isFavorite: true,
      })
      return { id: targetId, name, category, amount, unit, default_price: price, is_favorite: true, created_at: now }
    }

    const newDoc = await addDoc(householdCollection(householdId, 'products'), {
      name,
      category: matchedCategory,
      amount,
      unit,
      defaultPrice: price,
      isFavorite: true,
      createdAt: now,
    })
    // 一覧への反映はproductsのonSnapshotで自動的に行われるが、呼び出し元が
    // すぐに商品情報を必要とする場合(事前リストの紐付けなど)に備えて
    // ここでも作成した商品情報を返しておく
    return {
      id: newDoc.id,
      name,
      category: matchedCategory,
      amount,
      unit,
      default_price: price,
      is_favorite: true,
      created_at: now,
    }
  },

  async updateProductPrice(productId, price) {
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'products'), productId), {
      defaultPrice: price,
    })
  },

  async updatePurchaseRecord(purchaseId, updates) {
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'purchases'), purchaseId), {
      price: updates.price,
      quantity: updates.quantity,
      amount: updates.amount,
      unit: updates.unit,
    })
    await get().refreshPurchaseSummary()
  },

  async deletePurchaseRecord(purchaseId) {
    const householdId = requireHouseholdId()
    await deleteDoc(doc(householdCollection(householdId, 'purchases'), purchaseId))
    await get().refreshPurchaseSummary()
  },

  async updateFavoriteProduct(productId, updates) {
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'products'), productId), {
      name: updates.name,
      defaultPrice: updates.price,
      amount: updates.amount,
      unit: updates.unit,
      category: updates.category,
    })
  },

  async removeFavoriteProduct(productId) {
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'products'), productId), {
      isFavorite: false,
    })
  },

  async deleteFavoriteProductPermanently(productId) {
    const householdId = requireHouseholdId()

    // この商品にひもづく購入履歴(進行中のカート分も含む)をまとめて
    // 削除する。件数は家庭利用の範囲では少ない(多くても数百件程度)
    // ため、writeBatch(1回の書き込み上限500件)で十分間に合う想定。
    const purchasesSnapshot = await getDocs(
      query(householdCollection(householdId, 'purchases'), where('productId', '==', productId)),
    )
    const batch = writeBatch(db)
    for (const purchaseDoc of purchasesSnapshot.docs) {
      batch.delete(purchaseDoc.ref)
    }
    batch.delete(doc(householdCollection(householdId, 'products'), productId))
    await batch.commit()

    // 削除した購入履歴を前回価格・購入回数の集計から除くため、取り直す
    await get().refreshPurchaseSummary()
  },

  async completeCheckout() {
    const { tripId, cartItems } = get()
    if (tripId === null) return

    const householdId = requireHouseholdId()
    const total = calcTotal(cartItems)
    const now = new Date().toISOString()

    const batch = writeBatch(db)
    batch.update(doc(householdCollection(householdId, 'shoppingTrips'), tripId), {
      status: 'completed',
      completedAt: now,
      actualTotal: total,
    })
    for (const item of Object.values(cartItems)) {
      batch.update(doc(householdCollection(householdId, 'purchases'), item.purchaseId), {
        tripStatus: 'completed',
      })
    }
    await batch.commit()

    await get().refreshPurchaseSummary()
  },

  async addWishlistItem(rawName) {
    const trimmed = rawName.trim()
    if (trimmed.length === 0) return
    const householdId = requireHouseholdId()
    await addDoc(householdCollection(householdId, 'wishlist'), {
      rawName: trimmed,
      productId: null,
      createdAt: new Date().toISOString(),
    })
  },

  async updateWishlistItem(wishlistId, rawName) {
    const trimmed = rawName.trim()
    if (trimmed.length === 0) return
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'wishlist'), wishlistId), {
      rawName: trimmed,
    })
  },

  async removeWishlistItem(wishlistId) {
    const householdId = requireHouseholdId()
    await deleteDoc(doc(householdCollection(householdId, 'wishlist'), wishlistId))
  },

  async refreshPurchaseSummary() {
    const householdId = getSavedHouseholdId()
    if (!householdId) return
    const purchaseSummaryByProduct = await fetchPurchaseSummary(householdId)
    set({ purchaseSummaryByProduct })
  },
}))

/** 現在価格と前回購入価格を比較する共通ヘルパー(画面側から使う) */
export function getLastPriceDiff(product: Product, summary: PurchaseSummary | undefined) {
  if (!summary) return null
  const current = toComparableValue({
    price: product.default_price ?? 0,
    amount: product.amount,
    unit: product.unit,
  })
  const last = toComparableValue({
    price: summary.lastPrice,
    amount: summary.lastAmount,
    unit: summary.lastUnit,
  })
  return { last, diff: diffComparableValues(current, last) }
}
