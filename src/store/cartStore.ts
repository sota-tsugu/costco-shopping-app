// カート(今回の買い物)の状態管理。
//
// 設計方針(企画書 costco_app_concept_v2.md の「4. 技術構成」より):
// 「カート内の合計金額計算はメモリ上(Zustand)で即時実行し、SQLite側への
// 書き込みは非同期でバックグラウンド実行する(タップ操作を待たせない)」
//
// そのため、addToCart/decrementFromCart は
//   1. まずメモリ上の状態(このストア)を即座に書き換えて画面に反映
//   2. その後、裏側でこっそりSQLite(Web Worker)へ保存
// という2段構えになっている。SQLiteへの保存が終わるのを待ってから
// 画面を更新すると、タップしてから反映されるまでのラグを感じてしまう
// ため、これを避けている。

import { create } from 'zustand'
import { dbClient, rowsToObjects } from '../db/dbClient'

// 商品を連続で素早くタップした場合、SQLiteへの保存処理(裏側の非同期
// 処理)が追い越し合ってしまう(後のタップの保存が先に終わってしまう)
// ことがある。それを防ぐため、商品ごとに保存処理を「必ず順番通りに」
// 実行するためのキュー。UIの反映(メモリ上の状態更新)は即座に行われる
// ため、この仕組みがあってもタップの反応が遅く感じることはない。
const pendingSync = new Map<number, Promise<void>>()

function enqueueSync(productId: number, task: () => Promise<void>) {
  const previous = pendingSync.get(productId) ?? Promise.resolve()
  const next = previous.then(task).catch((error) => {
    console.error('カートの保存処理に失敗しました', error)
  })
  pendingSync.set(productId, next)
}

/** 会計完了前に、まだ終わっていない裏側の保存処理をすべて待つ */
async function flushPendingSync(productIds: number[]) {
  await Promise.all(productIds.map((id) => pendingSync.get(id) ?? Promise.resolve()))
}

export type Product = {
  id: number
  name: string
  category: string | null
  amount: number | null
  unit: string | null
  default_price: number | null
  is_favorite: number
  created_at: string
}

export type CartItem = {
  /** SQLite側にまだ保存されていない(挿入処理が完了していない)間はnull */
  purchaseId: number | null
  productId: number
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
  id: number
  raw_name: string
  product_id: number | null
  created_at: string
}

/**
 * 商品ごとの「直近の購入価格・購入回数」のまとめ。
 * 会計完了済みのトリップだけを対象にする(進行中のカートは含めない)。
 * BudgetSetupScreenの「今回買う予定」リストで前回価格の表示や
 * よく買う順の並び替えに使う。
 */
export type PurchaseSummary = {
  lastPrice: number
  lastAmount: number | null
  lastUnit: string | null
  count: number
}

type Screen = 'loading' | 'budget-setup' | 'shopping'

type CartState = {
  screen: Screen
  tripId: number | null
  budget: number
  favorites: Product[]
  cartItems: Record<number, CartItem> // key: productId
  wishlist: WishlistItem[]
  purchaseSummaryByProduct: Record<number, PurchaseSummary> // key: productId
  errorMessage: string | null

  init: () => Promise<void>
  startTrip: (budget: number) => Promise<void>
  addToCart: (product: Product) => void
  decrementFromCart: (productId: number) => void
  addFavoriteProduct: (
    name: string,
    price: number,
    amount: number | null,
    unit: string | null,
    /** 商品名候補データベースなどから既存商品を選んだ場合、その商品idを渡す */
    matchedProductId?: number | null,
  ) => Promise<void>
  updateProductPrice: (productId: number, price: number) => Promise<void>
  completeCheckout: () => Promise<void>
  addWishlistItem: (rawName: string) => Promise<void>
  removeWishlistItem: (wishlistId: number) => Promise<void>
  /** 事前リストの項目を商品に紐付け、カートに追加してリストから外す */
  resolveWishlistItem: (wishlistId: number, product: Product) => void
}

/** 現在のカート内合計金額を計算する(メモリ上の状態だけで完結、高速) */
export function calcTotal(cartItems: Record<number, CartItem>): number {
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
 * 商品名の入力補助のため、商品マスター全体(定番棚に入っていない
 * 商品名候補データベースも含む)から名前で検索する。
 * 商品追加フォームや事前リストの入力時に使う。
 */
export async function searchProductCatalog(query: string, limit = 15): Promise<Product[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []
  const result = await dbClient.exec(
    'SELECT id, name, category, amount, unit, default_price, is_favorite, created_at FROM product WHERE name LIKE ? ORDER BY is_favorite DESC, name LIMIT ?',
    [`%${trimmed}%`, limit],
  )
  return rowsToObjects<Product>(result)
}

/**
 * 商品ごとの「直近の購入価格・購入回数」をまとめて取得する。
 * 会計完了済みのトリップだけを対象にし、日付の新しい順に並べて
 * 取得することで、商品ごとに最初に出てきた行=最新の購入とわかる。
 * init()と会計完了後の両方で使うため、関数として切り出している。
 */
async function loadPurchaseSummaryByProduct(): Promise<Record<number, PurchaseSummary>> {
  const purchaseHistoryResult = await dbClient.exec(
    `SELECT purchase.product_id AS product_id, purchase.price AS price,
            purchase.amount AS amount, purchase.unit AS unit
     FROM purchase
     JOIN shopping_trip ON purchase.trip_id = shopping_trip.id
     WHERE shopping_trip.status = 'completed'
     ORDER BY purchase.created_at DESC`,
  )
  const purchaseHistoryRows = rowsToObjects<{
    product_id: number
    price: number
    amount: number | null
    unit: string | null
  }>(purchaseHistoryResult)

  const purchaseSummaryByProduct: Record<number, PurchaseSummary> = {}
  for (const row of purchaseHistoryRows) {
    const existing = purchaseSummaryByProduct[row.product_id]
    if (existing) {
      existing.count += 1
    } else {
      purchaseSummaryByProduct[row.product_id] = {
        lastPrice: row.price,
        lastAmount: row.amount,
        lastUnit: row.unit,
        count: 1,
      }
    }
  }
  return purchaseSummaryByProduct
}

export const useCartStore = create<CartState>((set, get) => ({
  screen: 'loading',
  tripId: null,
  budget: 0,
  favorites: [],
  cartItems: {},
  wishlist: [],
  purchaseSummaryByProduct: {},
  errorMessage: null,

  async init() {
    try {
      await dbClient.init()

      const favoritesResult = await dbClient.exec(
        'SELECT id, name, category, amount, unit, default_price, is_favorite, created_at FROM product WHERE is_favorite = 1 ORDER BY id DESC',
      )
      const favorites = rowsToObjects<Product>(favoritesResult)

      const wishlistResult = await dbClient.exec(
        'SELECT id, raw_name, product_id, created_at FROM wishlist ORDER BY id ASC',
      )
      const wishlist = rowsToObjects<WishlistItem>(wishlistResult)

      const purchaseSummaryByProduct = await loadPurchaseSummaryByProduct()

      const tripResult = await dbClient.exec(
        "SELECT id, budget FROM shopping_trip WHERE status = 'active' ORDER BY id DESC LIMIT 1",
      )
      const trips = rowsToObjects<{ id: number; budget: number }>(tripResult)

      if (trips.length === 0) {
        set({
          screen: 'budget-setup',
          favorites,
          wishlist,
          purchaseSummaryByProduct,
          tripId: null,
          cartItems: {},
        })
        return
      }

      const trip = trips[0]
      const cartResult = await dbClient.exec(
        `SELECT purchase.id AS purchase_id, purchase.product_id AS product_id,
                purchase.price AS price, purchase.quantity AS quantity,
                product.name AS name
         FROM purchase
         JOIN product ON purchase.product_id = product.id
         WHERE purchase.trip_id = ?`,
        [trip.id],
      )
      const cartRows = rowsToObjects<{
        purchase_id: number
        product_id: number
        price: number
        quantity: number
        name: string
      }>(cartResult)

      const cartItems: Record<number, CartItem> = {}
      for (const row of cartRows) {
        cartItems[row.product_id] = {
          purchaseId: row.purchase_id,
          productId: row.product_id,
          name: row.name,
          price: row.price,
          quantity: row.quantity,
        }
      }

      set({
        screen: 'shopping',
        tripId: trip.id,
        budget: trip.budget,
        favorites,
        wishlist,
        purchaseSummaryByProduct,
        cartItems,
      })
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : String(error) })
    }
  },

  async startTrip(budget: number) {
    const now = new Date().toISOString()
    await dbClient.run(
      "INSERT INTO shopping_trip (budget, status, started_at) VALUES (?, 'active', ?)",
      [budget, now],
    )
    const idResult = await dbClient.exec('SELECT last_insert_rowid() AS id')
    const [{ id: tripId }] = rowsToObjects<{ id: number }>(idResult)

    await dbClient.persist()
    set({ screen: 'shopping', tripId, budget, cartItems: {} })
  },

  addToCart(product) {
    const { tripId, cartItems } = get()
    if (tripId === null) return

    const price = product.default_price ?? 0
    const existing = cartItems[product.id]

    // 1. メモリ上の状態を即座に更新(画面はここで反映される)
    const nextCartItems = { ...cartItems }
    if (existing) {
      nextCartItems[product.id] = { ...existing, quantity: existing.quantity + 1 }
    } else {
      // purchaseIdはまだ確定していない(SQLiteへの保存がこれから)ので null
      nextCartItems[product.id] = {
        purchaseId: null,
        productId: product.id,
        name: product.name,
        price,
        quantity: 1,
      }
    }
    set({ cartItems: nextCartItems })

    // 2. 裏側でSQLiteへ反映(画面の反映は待たない)。
    // 同じ商品への操作は必ず順番通りに実行されるよう、キューに積む。
    // 実行時点の最新状態(get())を見て判断することで、連続タップで
    // 保存処理の順番が入れ替わってもデータがずれないようにしている。
    enqueueSync(product.id, async () => {
      const currentItem = get().cartItems[product.id]
      if (!currentItem) return // その間にカートから消えていたら何もしない

      if (currentItem.purchaseId === null) {
        const now = new Date().toISOString()
        // 購入時点の内容量・単位もあわせて記録しておく。
        // 後からパッケージサイズが変わっても、単位あたり単価の比較を
        // 正しく行えるようにするため(商品マスター側の現在値ではなく
        // 購入時点のスナップショットを使う)。
        await dbClient.run(
          'INSERT INTO purchase (product_id, trip_id, price, quantity, amount, unit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [product.id, tripId, price, currentItem.quantity, product.amount, product.unit, now],
        )
        const idResult = await dbClient.exec('SELECT last_insert_rowid() AS id')
        const [{ id: purchaseId }] = rowsToObjects<{ id: number }>(idResult)
        set((state) => {
          const item = state.cartItems[product.id]
          if (!item) return state
          return { cartItems: { ...state.cartItems, [product.id]: { ...item, purchaseId } } }
        })
      } else {
        await dbClient.run('UPDATE purchase SET quantity = ? WHERE id = ?', [
          currentItem.quantity,
          currentItem.purchaseId,
        ])
      }
      await dbClient.persist()
    })
  },

  decrementFromCart(productId) {
    const { cartItems } = get()
    const existing = cartItems[productId]
    if (!existing) return

    // 1. メモリ上の状態を即座に更新
    const nextCartItems = { ...cartItems }
    if (existing.quantity <= 1) {
      delete nextCartItems[productId]
    } else {
      nextCartItems[productId] = { ...existing, quantity: existing.quantity - 1 }
    }
    set({ cartItems: nextCartItems })

    // 2. 裏側でSQLiteへ反映。addToCartと同じキューを使うことで、
    // 同じ商品への追加・削除の保存処理が必ず正しい順番で実行されるようにする。
    enqueueSync(productId, async () => {
      const currentItem = get().cartItems[productId]

      if (currentItem) {
        // まだカートに残っている → 最新の数量をDBに反映
        if (currentItem.purchaseId !== null) {
          await dbClient.run('UPDATE purchase SET quantity = ? WHERE id = ?', [
            currentItem.quantity,
            currentItem.purchaseId,
          ])
          await dbClient.persist()
        }
        // purchaseIdがまだnullなら、後続の挿入処理が最新の数量で登録してくれる
      } else if (existing.purchaseId !== null) {
        // カートから消え、かつすでにDBへ保存済みだった → 削除する
        await dbClient.run('DELETE FROM purchase WHERE id = ?', [existing.purchaseId])
        await dbClient.persist()
      }
    })
  },

  /**
   * 定番棚に商品を追加する。
   * - 商品名候補データベース(is_favorite=0で登録済みの商品)から選んだ場合は
   *   matchedProductIdを渡す。その商品を新規作成せず「定番棚に昇格」させる
   *   (同じ名前の商品が重複して登録されるのを防ぐため)
   * - matchedProductIdがなくても、たまたま同じ名前の商品が既にあれば
   *   それを使い回す(念のための保険)
   * - どちらにも当てはまらなければ、新しい商品として登録する
   */
  async addFavoriteProduct(
    name: string,
    price: number,
    amount: number | null,
    unit: string | null,
    matchedProductId: number | null = null,
  ) {
    const now = new Date().toISOString()
    let targetId = matchedProductId

    if (targetId === null) {
      const existingResult = await dbClient.exec('SELECT id FROM product WHERE name = ? LIMIT 1', [
        name,
      ])
      const existingRows = rowsToObjects<{ id: number }>(existingResult)
      if (existingRows.length > 0) {
        targetId = existingRows[0].id
      }
    }

    let resultProduct: Product

    if (targetId !== null) {
      await dbClient.run(
        'UPDATE product SET default_price = ?, amount = ?, unit = ?, is_favorite = 1 WHERE id = ?',
        [price, amount, unit, targetId],
      )
      const rowResult = await dbClient.exec(
        'SELECT id, name, category, amount, unit, default_price, is_favorite, created_at FROM product WHERE id = ?',
        [targetId],
      )
      resultProduct = rowsToObjects<Product>(rowResult)[0]
    } else {
      await dbClient.run(
        'INSERT INTO product (name, default_price, amount, unit, is_favorite, created_at) VALUES (?, ?, ?, ?, 1, ?)',
        [name, price, amount, unit, now],
      )
      const idResult = await dbClient.exec('SELECT last_insert_rowid() AS id')
      const [{ id }] = rowsToObjects<{ id: number }>(idResult)
      resultProduct = {
        id,
        name,
        category: null,
        amount,
        unit,
        default_price: price,
        is_favorite: 1,
        created_at: now,
      }
    }

    await dbClient.persist()
    set((state) => {
      const alreadyListed = state.favorites.some((p) => p.id === resultProduct.id)
      if (alreadyListed) {
        return {
          favorites: state.favorites.map((p) => (p.id === resultProduct.id ? resultProduct : p)),
        }
      }
      return { favorites: [resultProduct, ...state.favorites] }
    })
  },

  /**
   * 店頭で価格が変わっていた場合に、定番棚の「現在の価格」を更新する。
   * 過去の購入履歴(Purchaseテーブルの行)は書き換えない
   * (「履歴を編集できない設計にしない」という企画書の絶対ルールとは別で、
   * これは新しい価格情報の登録であり、過去の記録の改変ではないため)。
   */
  async updateProductPrice(productId: number, price: number) {
    await dbClient.run('UPDATE product SET default_price = ? WHERE id = ?', [price, productId])
    await dbClient.persist()
    set((state) => ({
      favorites: state.favorites.map((p) =>
        p.id === productId ? { ...p, default_price: price } : p,
      ),
    }))
  },

  async completeCheckout() {
    const { tripId, cartItems } = get()
    if (tripId === null) return

    // カートに入っている商品の裏側の保存処理がすべて終わるのを待ってから
    // 会計を確定する(処理中に確定すると、直前に追加した商品が
    // 購入履歴に反映されないまま終わってしまうことがあるため)
    await flushPendingSync(Object.keys(cartItems).map(Number))

    const total = calcTotal(cartItems)
    const now = new Date().toISOString()
    await dbClient.run(
      "UPDATE shopping_trip SET status = 'completed', completed_at = ?, actual_total = ? WHERE id = ?",
      [now, total, tripId],
    )
    await dbClient.persist()

    // 今会計を終えたばかりの購入も「前回価格・購入回数」に反映されるよう
    // 再集計しておく(次に予算設定画面を開いた時にすぐ最新の状態で見える)
    const purchaseSummaryByProduct = await loadPurchaseSummaryByProduct()

    set({
      screen: 'budget-setup',
      tripId: null,
      budget: 0,
      cartItems: {},
      purchaseSummaryByProduct,
    })
  },

  /** 事前買い物予定リストに項目を追加する(自宅での自由入力を想定) */
  async addWishlistItem(rawName: string) {
    const trimmed = rawName.trim()
    if (trimmed.length === 0) return

    const now = new Date().toISOString()
    await dbClient.run('INSERT INTO wishlist (raw_name, created_at) VALUES (?, ?)', [
      trimmed,
      now,
    ])
    const idResult = await dbClient.exec('SELECT last_insert_rowid() AS id')
    const [{ id }] = rowsToObjects<{ id: number }>(idResult)

    await dbClient.persist()
    set((state) => ({
      wishlist: [...state.wishlist, { id, raw_name: trimmed, product_id: null, created_at: now }],
    }))
  },

  /** 事前買い物予定リストから項目を削除する(入力ミスの取り消しなど) */
  async removeWishlistItem(wishlistId: number) {
    await dbClient.run('DELETE FROM wishlist WHERE id = ?', [wishlistId])
    await dbClient.persist()
    set((state) => ({ wishlist: state.wishlist.filter((w) => w.id !== wishlistId) }))
  },

  /**
   * 事前リストの項目(自宅で入力した仮の商品名)を、商品マスターの
   * 実際の商品に紐付けてカートに追加し、リストから取り除く。
   * 「商品名が完全一致していれば自動で紐付ける」方針のため、
   * 一致しない場合はSOTAさんに商品を選んでもらう画面を別途表示する
   * (ShoppingScreen側で制御)。
   */
  resolveWishlistItem(wishlistId, product) {
    get().addToCart(product)
    // 裏側の削除は待たず、画面上のリストからは即座に消す
    void get().removeWishlistItem(wishlistId)
  },
}))
