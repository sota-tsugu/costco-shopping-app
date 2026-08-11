// 「買い物トリップ」まわりの状態管理。
//
// 【データの持ち方(白紙化後の新設計)】
// - products: 定番商品リスト(毎回繰り返し買う商品の登録リスト)
// - shoppingTrips: 買い物1回分(予算・状態・開始/完了日時・実際の合計金額)
// - tripItems: トリップ内の商品1行。「検討中(considering)→会計待ち(inCart)→
//   購入済(purchased)」という1つのライフサイクルを、状態(status)フィールド
//   ひとつで管理する。計画リスト由来(source: 'planned')でもバーコード
//   スキャン由来(source: 'scan')でも、このコレクション1つに集約する
//   (画面Aが「今回の買い物トリップ全体」を表す唯一の一覧になるようにする
//   ため。詳しい経緯はcostco_app_concept_v3.mdの「2. 画面構成」を参照)。
//
// households/{householdId}/products, .../shoppingTrips, .../tripItems
// という3つのコレクションを使う。
//
// 【計画リスト由来のtripItemsのドキュメントID】パートナーとの同時編集で
// 同じ商品の行が重複して作られないよう、計画リストからのチェック
// (togglePlannedProduct)で作るtripItemsだけは、ランダムなID(addDoc)
// ではなく「トリップID_商品ID」という決まった形式のID(setDoc)を使って
// いる。バーコードスキャン由来(addScannedItem)は、そもそも複数人が
// 同時に同じ商品をスキャンする状況が起きにくいため、これまで通り
// ランダムなIDのままにしている

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
  writeBatch,
  type CollectionReference,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { ensureSignedIn, getSavedHouseholdId } from '../firebase/household'

export type Product = {
  id: string
  name: string
  category: string | null
  defaultPrice: number | null
  defaultAmount: number | null
  defaultUnit: string | null
  createdAt: string
}

export type TripStatus = 'planning' | 'active' | 'completed'

export type ShoppingTrip = {
  id: string
  budget: number
  status: TripStatus
  startedAt: string | null
  completedAt: string | null
  actualTotal: number | null
  createdAt: string
  /** 行く予定の日(YYYY-MM-DD形式、日付のみ)。計画中に任意で設定する */
  plannedDate: string | null
  /** 行く予定/実際に行った店舗名。計画中に任意で設定する */
  storeName: string | null
}

/** 検討中(まだカートに入れていない)→会計待ち(カートに入れた)→購入済(会計完了) */
export type TripItemStatus = 'considering' | 'inCart' | 'purchased'

export type TripItem = {
  id: string
  productId: string | null
  productName: string
  category: string | null
  tripId: string
  status: TripItemStatus
  price: number | null
  amount: number | null
  unit: string | null
  quantity: number
  /** planned=事前の今回買うものリスト由来、scan=バーコードスキャン由来 */
  source: 'planned' | 'scan'
  /** バーコードスキャンで追加した場合の読み取り番号(次回同じ商品を素早く認識するために使う) */
  barcode: string | null
  createdAt: string
  addedToCartAt: string | null
  /** 店頭でのセール価格だったかどうか。単価比較(値上がり/値下がり)の際に、
   * セール価格と通常価格を単純比較して誤解を招かないよう注釈を出すために使う */
  isOnSale: boolean
  /** セール価格だった場合の、本来の通常価格(割引率の算出に使う)。
   * セールでない場合や、通常価格を入力しなかった場合はnull */
  regularPrice: number | null
}

type TripStoreState = {
  products: Product[]
  currentTrip: ShoppingTrip | null
  tripItems: TripItem[]
  errorMessage: string | null

  init: () => Promise<void>
  addProduct: (
    name: string,
    category: string | null,
    price: number | null,
    amount: number | null,
    unit: string | null,
  ) => Promise<Product>
  updateProduct: (
    productId: string,
    updates: { name: string; category: string | null; price: number | null; amount: number | null; unit: string | null },
  ) => Promise<void>
  removeProduct: (productId: string) => Promise<void>
  /** 定番商品リストを一括で空にする(設定画面から使う、元に戻せない操作) */
  clearAllProducts: () => Promise<void>

  /** 「planning」中のトリップが無ければ新しく作る。あれば何もしない */
  ensurePlanningTrip: (budget: number) => Promise<void>
  updateTripBudget: (budget: number) => Promise<void>
  /** 行く予定の日・店舗を設定する(どちらもnullで未設定に戻せる) */
  updateTripPlan: (plannedDate: string | null, storeName: string | null) => Promise<void>
  /**
   * 計画(planning中のトリップ)をまるごと白紙に戻す。買い物予定が
   * 急遽取りやめになった場合などに使う。選んでいた商品(定番棚からの
   * チェック分・スキャンで追加した分)をすべて削除し、予算・行く予定日・
   * 店舗も未設定の状態に戻す
   */
  resetTripPlan: () => Promise<void>
  /** 定番商品を今回買うものリストに入れる/外す(planning中のみ) */
  togglePlannedProduct: (product: Product, selected: boolean) => Promise<void>
  /** 買い物を開始する(planning→active) */
  startShopping: () => Promise<void>
  /**
   * 買い物中(active)から計画中(planning)に戻る。カートに入れた商品
   * (inCart)・検討中の商品(considering)はそのまま保持する(削除しない)。
   * 計画中の画面側で、considering・inCartの両方をチェック済みとして
   * 扱うことで、戻った時に選択状態が正しく見えるようにしている
   */
  backToPlanning: () => Promise<void>

  /** 検討中の商品をカートに入れる(considering→inCart)。価格等は商品の登録値をそのまま使う */
  addToCart: (tripItemId: string) => Promise<void>
  /** バーコードスキャン等で、計画リストになかった商品を直接カートに追加する */
  addScannedItem: (details: {
    productId: string | null
    name: string
    category: string | null
    price: number
    amount: number | null
    unit: string | null
    quantity: number
    barcode: string | null
  }) => Promise<void>
  updateCartItemQuantity: (tripItemId: string, quantity: number) => Promise<void>
  /**
   * カートに入っている商品(inCart)の価格・内容量・単位・セールフラグを、
   * 店頭で確認した実際の内容に修正する。計画時点の基準価格と実際の
   * 店頭価格がズレていた場合(値上がり・値下がり・セールなど)に使う
   */
  updateCartItemDetails: (
    tripItemId: string,
    updates: { price: number; amount: number | null; unit: string | null; isOnSale: boolean; regularPrice: number | null },
  ) => Promise<void>
  removeTripItem: (tripItemId: string) => Promise<void>
  /** 会計を完了する(inCartの商品をpurchasedにし、トリップをcompletedにする) */
  completeCheckout: () => Promise<void>
  /**
   * 購入済みの記録(1件)を訂正する。「買い物を終了する」の押し間違いなど、
   * 確定後に内容が違っていた場合に使う。訂正後、その記録が属するトリップの
   * 実際の合計金額(actualTotal)も再計算して更新する
   */
  updatePurchaseRecord: (
    tripId: string,
    tripItemId: string,
    updates: {
      price: number
      amount: number | null
      unit: string | null
      quantity: number
      isOnSale: boolean
      regularPrice: number | null
    },
  ) => Promise<void>
  /** 購入済みの記録(1件)を削除する。削除後、トリップの実際の合計金額も再計算する */
  removePurchaseRecord: (tripId: string, tripItemId: string) => Promise<void>
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

export const useTripStore = create<TripStoreState>((set, get) => ({
  products: [],
  currentTrip: null,
  tripItems: [],
  errorMessage: null,

  async init() {
    try {
      const householdId = requireHouseholdId()
      await ensureSignedIn()

      // 定番商品リストをリアルタイム購読する
      onSnapshot(
        householdCollection(householdId, 'products'),
        (snapshot) => {
          const products: Product[] = snapshot.docs
            .map((d) => {
              const data = d.data()
              return {
                id: d.id,
                name: data.name as string,
                category: (data.category ?? null) as string | null,
                defaultPrice: (data.defaultPrice ?? null) as number | null,
                defaultAmount: (data.defaultAmount ?? null) as number | null,
                defaultUnit: (data.defaultUnit ?? null) as string | null,
                createdAt: (data.createdAt ?? '') as string,
              }
            })
            .sort((a, b) => (a.name < b.name ? -1 : 1))
          set({ products })
        },
        (error) => set({ errorMessage: error.message }),
      )

      // 「planning」または「active」の、進行中のトリップをリアルタイム購読する。
      // トリップが切り替わる(会計完了→新しい計画中トリップの作成、など)
      // たびに、下のtripItems購読(unsubscribeTripItems)を必ず一度解除して
      // から新しく購読し直す。解除せずに購読を重ねてしまうと、古い
      // トリップ側の変更(購入済みへの更新など)が後から届いた時に、
      // 今表示すべき新しいトリップのtripItemsを上書きしてしまうバグに
      // なる(会計完了後も買い物中の表示が残ってしまう不具合の原因の1つ
      // だったため修正した)
      let unsubscribeTripItems: (() => void) | null = null

      onSnapshot(
        query(householdCollection(householdId, 'shoppingTrips'), where('status', 'in', ['planning', 'active'])),
        (snapshot) => {
          if (unsubscribeTripItems) {
            unsubscribeTripItems()
            unsubscribeTripItems = null
          }

          if (snapshot.empty) {
            set({ currentTrip: null, tripItems: [] })
            return
          }
          const trips = snapshot.docs
            .map((d) => {
              const data = d.data()
              return {
                id: d.id,
                budget: data.budget as number,
                status: data.status as TripStatus,
                startedAt: (data.startedAt ?? null) as string | null,
                completedAt: (data.completedAt ?? null) as string | null,
                actualTotal: (data.actualTotal ?? null) as number | null,
                createdAt: (data.createdAt ?? '') as string,
                plannedDate: (data.plannedDate ?? null) as string | null,
                storeName: (data.storeName ?? null) as string | null,
              }
            })
            .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
          const trip = trips[0]
          set({ currentTrip: trip })

          // このトリップに属する商品(tripItems)もリアルタイム購読する。
          // 購読の解除(unsubscribeTripItems)はトリップが切り替わる瞬間に
          // 呼んでいるが、直前に発火が予約されていた古い通知が解除の
          // タイミングと競合して後から届いてしまう可能性はゼロにはできない。
          // その防御として、通知が届いた時点で「今のcurrentTripが本当に
          // このtripId宛てか」を必ず確認し、既に別のトリップに切り替わって
          // いれば無視する(会計完了後も計画中リストにチェックが残って
          // しまう不具合の再発防止のため)
          unsubscribeTripItems = onSnapshot(
            query(householdCollection(householdId, 'tripItems'), where('tripId', '==', trip.id)),
            (itemsSnapshot) => {
              if (get().currentTrip?.id !== trip.id) return
              const tripItems: TripItem[] = itemsSnapshot.docs
                .map((d) => {
                  const data = d.data()
                  return {
                    id: d.id,
                    productId: (data.productId ?? null) as string | null,
                    productName: data.productName as string,
                    category: (data.category ?? null) as string | null,
                    tripId: data.tripId as string,
                    status: data.status as TripItemStatus,
                    price: (data.price ?? null) as number | null,
                    amount: (data.amount ?? null) as number | null,
                    unit: (data.unit ?? null) as string | null,
                    quantity: (data.quantity ?? 1) as number,
                    source: data.source as 'planned' | 'scan',
                    barcode: (data.barcode ?? null) as string | null,
                    createdAt: (data.createdAt ?? '') as string,
                    addedToCartAt: (data.addedToCartAt ?? null) as string | null,
                    isOnSale: (data.isOnSale ?? false) as boolean,
                    regularPrice: (data.regularPrice ?? null) as number | null,
                  }
                })
                .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
              set({ tripItems })
            },
            (error) => set({ errorMessage: error.message }),
          )
        },
        (error) => set({ errorMessage: error.message }),
      )
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : String(error) })
    }
  },

  async addProduct(name, category, price, amount, unit) {
    const householdId = requireHouseholdId()
    const now = new Date().toISOString()
    const newDoc = await addDoc(householdCollection(householdId, 'products'), {
      name,
      category,
      defaultPrice: price,
      defaultAmount: amount,
      defaultUnit: unit,
      createdAt: now,
    })
    return { id: newDoc.id, name, category, defaultPrice: price, defaultAmount: amount, defaultUnit: unit, createdAt: now }
  },

  async updateProduct(productId, updates) {
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'products'), productId), {
      name: updates.name,
      category: updates.category,
      defaultPrice: updates.price,
      defaultAmount: updates.amount,
      defaultUnit: updates.unit,
    })
  },

  async removeProduct(productId) {
    const householdId = requireHouseholdId()
    await deleteDoc(doc(householdCollection(householdId, 'products'), productId))
  },

  async clearAllProducts() {
    const { products } = get()
    if (products.length === 0) return
    const householdId = requireHouseholdId()
    const batch = writeBatch(db)
    for (const product of products) {
      batch.delete(doc(householdCollection(householdId, 'products'), product.id))
    }
    await batch.commit()
  },

  async ensurePlanningTrip(budget) {
    const { currentTrip } = get()
    if (currentTrip) return
    const householdId = requireHouseholdId()
    const now = new Date().toISOString()
    await addDoc(householdCollection(householdId, 'shoppingTrips'), {
      budget,
      status: 'planning',
      startedAt: null,
      completedAt: null,
      actualTotal: null,
      createdAt: now,
      plannedDate: null,
      storeName: null,
    })
  },

  async updateTripBudget(budget) {
    const { currentTrip } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'shoppingTrips'), currentTrip.id), { budget })
  },

  async updateTripPlan(plannedDate, storeName) {
    const { currentTrip } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'shoppingTrips'), currentTrip.id), {
      plannedDate,
      storeName,
    })
  },

  async resetTripPlan() {
    const { currentTrip, tripItems } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()
    // tripItemsはこの時点でcurrentTrip宛てのものだけが購読されているため、
    // 絞り込まずそのまま全件を対象にしてよい(購入済み=purchasedの記録は
    // 会計完了済みの別トリップに属するため、そもそもここには含まれない)
    const batch = writeBatch(db)
    for (const item of tripItems) {
      batch.delete(doc(householdCollection(householdId, 'tripItems'), item.id))
    }
    batch.update(doc(householdCollection(householdId, 'shoppingTrips'), currentTrip.id), {
      budget: 0,
      plannedDate: null,
      storeName: null,
    })
    await batch.commit()
  },

  async togglePlannedProduct(product, selected) {
    const { currentTrip, tripItems } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()

    if (selected) {
      const now = new Date().toISOString()
      // ドキュメントID(トリップID+商品ID)を決まった形式にすることで、
      // パートナーと同時に同じ商品をチェックしてしまった場合でも、
      // 別々のドキュメントが2つできてしまう(重複データ)ことを防いでいる。
      // addDoc(ランダムなID)だと、お互いの変更がまだ届いていない一瞬の
      // タイミングで両方が「追加」を実行し、同じ商品の行が裏側で2つ
      // できてしまう可能性があった。setDoc+決まった形式のIDなら、
      // 2人が同時に書き込んでも同じ1つのドキュメントを上書きするだけになる。
      //
      // 【注意】この仕組みはあくまで「今まさに進行中の1回の買い物」の
      // 中だけの話で、商品自体の紐付け(過去の購入履歴との照合)は
      // 引き続き商品名(productName)で行っている。「定番商品リストを
      // 空にする」機能とは無関係(そちらの経緯はfetchLastCompletedTrip
      // ProductNamesのコメントを参照)
      const tripItemId = `${currentTrip.id}_${product.id}`
      await setDoc(doc(householdCollection(householdId, 'tripItems'), tripItemId), {
        productId: product.id,
        productName: product.name,
        category: product.category,
        tripId: currentTrip.id,
        status: 'considering',
        price: null,
        amount: null,
        unit: null,
        quantity: 1,
        source: 'planned',
        createdAt: now,
        addedToCartAt: null,
        isOnSale: false,
        regularPrice: null,
      })
    } else {
      // considering(検討中)だけでなく、inCart(会計待ち。買い物中に戻ってから
      // チェックを外した場合)も対象にする。この変更より前に作られた行は
      // ランダムなIDのままの可能性があるため、決まった形式のIDに決め打ちで
      // 削除するのではなく、実際に読み込んでいるtripItemsから探して削除する
      const existing = tripItems.find(
        (item) => item.productId === product.id && (item.status === 'considering' || item.status === 'inCart'),
      )
      if (existing) {
        await deleteDoc(doc(householdCollection(householdId, 'tripItems'), existing.id))
      }
    }
  },

  async startShopping() {
    const { currentTrip } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'shoppingTrips'), currentTrip.id), {
      status: 'active',
      startedAt: new Date().toISOString(),
    })
  },

  async backToPlanning() {
    const { currentTrip } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'shoppingTrips'), currentTrip.id), {
      status: 'planning',
      startedAt: null,
    })
  },

  async addToCart(tripItemId) {
    const { tripItems, products } = get()
    const item = tripItems.find((t) => t.id === tripItemId)
    if (!item) return
    const product = products.find((p) => p.id === item.productId)
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'tripItems'), tripItemId), {
      status: 'inCart',
      price: product?.defaultPrice ?? 0,
      amount: product?.defaultAmount ?? null,
      unit: product?.defaultUnit ?? null,
      addedToCartAt: new Date().toISOString(),
      isOnSale: false,
      regularPrice: null,
    })
  },

  async addScannedItem(details) {
    const { currentTrip } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()
    const now = new Date().toISOString()
    await addDoc(householdCollection(householdId, 'tripItems'), {
      productId: details.productId,
      productName: details.name,
      category: details.category,
      tripId: currentTrip.id,
      status: 'inCart',
      price: details.price,
      amount: details.amount,
      unit: details.unit,
      quantity: details.quantity,
      source: 'scan',
      barcode: details.barcode,
      createdAt: now,
      addedToCartAt: now,
      isOnSale: false,
      regularPrice: null,
    })
  },

  async updateCartItemQuantity(tripItemId, quantity) {
    if (quantity <= 0) {
      await get().removeTripItem(tripItemId)
      return
    }
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'tripItems'), tripItemId), { quantity })
  },

  async updateCartItemDetails(tripItemId, updates) {
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'tripItems'), tripItemId), {
      price: updates.price,
      amount: updates.amount,
      unit: updates.unit,
      isOnSale: updates.isOnSale,
      regularPrice: updates.regularPrice,
    })
  },

  async removeTripItem(tripItemId) {
    const householdId = requireHouseholdId()
    await deleteDoc(doc(householdCollection(householdId, 'tripItems'), tripItemId))
  },

  async completeCheckout() {
    const { currentTrip } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()
    const now = new Date().toISOString()

    // 会計に使うtripItemsは、ストア上のキャッシュ(get().tripItems)を
    // そのまま信じるのではなく、この時点でFirestoreから直接
    // (tripId==currentTrip.idで絞り込んで)取得し直す。会計は実際の
    // 購入記録・金額に関わる重要な処理のため、リアルタイム購読側に
    // 万が一の取りこぼしや別トリップのデータ混入があっても影響を
    // 受けないようにするための、より確実な取得方法にしている
    const itemsSnapshot = await getDocs(
      query(householdCollection(householdId, 'tripItems'), where('tripId', '==', currentTrip.id)),
    )
    const tripItems: TripItem[] = itemsSnapshot.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        productId: (data.productId ?? null) as string | null,
        productName: data.productName as string,
        category: (data.category ?? null) as string | null,
        tripId: data.tripId as string,
        status: data.status as TripItemStatus,
        price: (data.price ?? null) as number | null,
        amount: (data.amount ?? null) as number | null,
        unit: (data.unit ?? null) as string | null,
        quantity: (data.quantity ?? 1) as number,
        source: data.source as 'planned' | 'scan',
        barcode: (data.barcode ?? null) as string | null,
        createdAt: (data.createdAt ?? '') as string,
        addedToCartAt: (data.addedToCartAt ?? null) as string | null,
        isOnSale: (data.isOnSale ?? false) as boolean,
        regularPrice: (data.regularPrice ?? null) as number | null,
      }
    })

    const inCartItems = tripItems.filter((item) => item.status === 'inCart')
    const actualTotal = inCartItems.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0)
    // カートに入れないまま(検討中のまま)会計を終えた商品は、購入済みにも
    // ならず宙に浮いたデータとして残ってしまうため、この時点でまとめて
    // 削除する。定番商品リスト側の登録(商品そのもの)には触れないため、
    // 次回の買い物では今まで通り選び直せる
    const leftoverConsideringItems = tripItems.filter((item) => item.status === 'considering')

    const batch = writeBatch(db)
    for (const item of inCartItems) {
      batch.update(doc(householdCollection(householdId, 'tripItems'), item.id), { status: 'purchased' })
    }
    for (const item of leftoverConsideringItems) {
      batch.delete(doc(householdCollection(householdId, 'tripItems'), item.id))
    }
    batch.update(doc(householdCollection(householdId, 'shoppingTrips'), currentTrip.id), {
      status: 'completed',
      completedAt: now,
      actualTotal,
    })
    await batch.commit()
  },

  async updatePurchaseRecord(tripId, tripItemId, updates) {
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'tripItems'), tripItemId), {
      price: updates.price,
      amount: updates.amount,
      unit: updates.unit,
      quantity: updates.quantity,
      isOnSale: updates.isOnSale,
      regularPrice: updates.regularPrice,
    })
    await recalculateTripActualTotal(householdId, tripId)
  },

  async removePurchaseRecord(tripId, tripItemId) {
    const householdId = requireHouseholdId()
    await deleteDoc(doc(householdCollection(householdId, 'tripItems'), tripItemId))
    await recalculateTripActualTotal(householdId, tripId)
  },
}))

/**
 * トリップの実際の合計金額(actualTotal)を、そのトリップに属する
 * purchased状態のtripItemから計算し直して保存する。購入記録の訂正・
 * 削除の後に呼び、合計金額の表示(前回の購入額など)が古いままに
 * ならないようにする
 */
async function recalculateTripActualTotal(householdId: string, tripId: string): Promise<void> {
  const snapshot = await getDocs(
    query(
      householdCollection(householdId, 'tripItems'),
      where('tripId', '==', tripId),
      where('status', '==', 'purchased'),
    ),
  )
  const actualTotal = snapshot.docs.reduce((sum, d) => {
    const price = (d.data().price ?? 0) as number
    const quantity = (d.data().quantity ?? 1) as number
    return sum + price * quantity
  }, 0)
  await updateDoc(doc(householdCollection(householdId, 'shoppingTrips'), tripId), { actualTotal })
}

/**
 * 商品ごとの直近の購入記録をまとめて取得する(価格・内容量・単位の初期値提案に使う)。
 *
 * 商品id(productId)ではなく商品名(productName)で照合している。理由:
 * 「定番商品リストを空にする」機能で商品を削除して登録し直すと、
 * Firestore上のidは新しく採番され直すため、idで照合すると過去の
 * 購入記録との結びつきが切れてしまう。商品名であれば、削除・登録し
 * 直した後も同じ名前である限り過去の記録と正しく結びつく
 */
export async function fetchLatestPurchaseByProduct(
  productName: string,
): Promise<{ price: number; amount: number | null; unit: string | null } | null> {
  const householdId = requireHouseholdId()
  const snapshot = await getDocs(
    query(
      householdCollection(householdId, 'tripItems'),
      where('productName', '==', productName),
      where('status', '==', 'purchased'),
    ),
  )
  const rows = snapshot.docs
    .map((d) => ({
      price: d.data().price as number,
      amount: (d.data().amount ?? null) as number | null,
      unit: (d.data().unit ?? null) as string | null,
      addedToCartAt: (d.data().addedToCartAt ?? '') as string,
    }))
    .sort((a, b) => (a.addedToCartAt > b.addedToCartAt ? -1 : 1))
  return rows[0] ?? null
}

/**
 * 直近に完了した買い物トリップで、実際に購入済みだった商品の名前を
 * まとめて取得する。「前回買ったものを反映」ボタンから使う。
 *
 * 商品id(productId)ではなく商品名(productName)を返している。理由:
 * 「定番商品リストを空にする」機能で商品を削除して登録し直すと、
 * Firestore上のidは新しく採番され直すため、idで照合すると「前回買った
 * もの」が定番商品リスト上で見つからなくなってしまう。商品名であれば、
 * 削除・登録し直した後も同じ名前で登録すれば正しく反映できる
 *
 * Firestoreの複合インデックス(status==completedで絞り込みつつ
 * completedAtで並べ替える、という組み合わせ)を新たに作らずに済むよう、
 * 完了済みトリップは一旦まとめて取得してからJavaScript側で最新のものを
 * 選んでいる(家庭利用の範囲では件数が少ないため、パフォーマンス上の
 * 問題にはならない想定)。
 */
export async function fetchLastCompletedTripProductNames(): Promise<string[]> {
  const householdId = requireHouseholdId()
  const tripsSnapshot = await getDocs(
    query(householdCollection(householdId, 'shoppingTrips'), where('status', '==', 'completed')),
  )
  const trips = tripsSnapshot.docs
    .map((d) => ({ id: d.id, completedAt: (d.data().completedAt ?? '') as string }))
    .sort((a, b) => (a.completedAt > b.completedAt ? -1 : 1))
  const lastTrip = trips[0]
  if (!lastTrip) return []

  const itemsSnapshot = await getDocs(
    query(
      householdCollection(householdId, 'tripItems'),
      where('tripId', '==', lastTrip.id),
      where('status', '==', 'purchased'),
    ),
  )
  const productNames = itemsSnapshot.docs.map((d) => d.data().productName as string)
  return [...new Set(productNames)]
}

/**
 * 直近に完了した買い物トリップの、実際の合計金額(actualTotal)を取得する。
 * 画面Aの計画中(planning)の見込み合計の隣に「前回の購入額」として
 * 表示するために使う。まだ買い物を1回も完了していない場合はnullを返す
 */
export async function fetchLastCompletedTripTotal(): Promise<number | null> {
  const householdId = requireHouseholdId()
  const tripsSnapshot = await getDocs(
    query(householdCollection(householdId, 'shoppingTrips'), where('status', '==', 'completed')),
  )
  const trips = tripsSnapshot.docs
    .map((d) => ({ completedAt: (d.data().completedAt ?? '') as string, actualTotal: (d.data().actualTotal ?? null) as number | null }))
    .sort((a, b) => (a.completedAt > b.completedAt ? -1 : 1))
  return trips[0]?.actualTotal ?? null
}

/**
 * 過去にバーコードスキャンで記録した商品を、同じバーコード番号から探す。
 * 「定番商品リスト」ではなく「過去のスキャン履歴」から探す設計にしている
 * (バーコードスキャンは主に、定番商品リストに無い・その場限りの商品を
 * 追加するための機能のため。定番商品リストと紐付けても、ほとんど
 * ヒットしないと考えられる)。
 * 同じバーコードが複数回記録されていれば、直近の内容(価格など)を優先する
 */
export async function fetchTripItemByBarcode(barcode: string): Promise<{
  name: string
  category: string | null
  price: number | null
  amount: number | null
  unit: string | null
} | null> {
  const householdId = requireHouseholdId()
  const snapshot = await getDocs(
    query(householdCollection(householdId, 'tripItems'), where('barcode', '==', barcode)),
  )
  const rows = snapshot.docs
    .map((d) => ({
      name: d.data().productName as string,
      category: (d.data().category ?? null) as string | null,
      price: (d.data().price ?? null) as number | null,
      amount: (d.data().amount ?? null) as number | null,
      unit: (d.data().unit ?? null) as string | null,
      createdAt: (d.data().createdAt ?? '') as string,
    }))
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
  return rows[0] ?? null
}

export type ProductPurchaseRecord = {
  /** このtripItemのFirestore文書id(訂正・削除する時に使う) */
  id: string
  /** この記録が属するトリップのid(訂正・削除後、トリップの合計金額を再計算する時に使う) */
  tripId: string
  price: number
  amount: number | null
  unit: string | null
  quantity: number
  /** 購入日時(会計完了時にセットされるaddedToCartAtを使う) */
  purchasedAt: string
  /** 店頭でのセール価格だったかどうか */
  isOnSale: boolean
  /** セール価格だった場合の、本来の通常価格(割引率の算出に使う) */
  regularPrice: number | null
}

/**
 * ある商品(商品名で指定)の、過去の購入記録をすべて取得する。
 * 商品詳細シート(単価比較・購入履歴・購入頻度)で使う。
 * idではなく商品名で照合している理由は、fetchLastCompletedTripProductNamesの
 * コメントを参照(定番商品リストを空にして登録し直しても結びつくようにするため)
 */
export async function fetchPurchaseHistoryByProductName(productName: string): Promise<ProductPurchaseRecord[]> {
  const householdId = requireHouseholdId()
  const snapshot = await getDocs(
    query(
      householdCollection(householdId, 'tripItems'),
      where('productName', '==', productName),
      where('status', '==', 'purchased'),
    ),
  )
  return snapshot.docs
    .map((d) => ({
      id: d.id,
      tripId: d.data().tripId as string,
      price: d.data().price as number,
      amount: (d.data().amount ?? null) as number | null,
      unit: (d.data().unit ?? null) as string | null,
      quantity: (d.data().quantity ?? 1) as number,
      purchasedAt: (d.data().addedToCartAt ?? d.data().createdAt ?? '') as string,
      isOnSale: (d.data().isOnSale ?? false) as boolean,
      regularPrice: (d.data().regularPrice ?? null) as number | null,
    }))
    .sort((a, b) => (a.purchasedAt > b.purchasedAt ? -1 : 1))
}

export type PurchaseHistoryEntry = ProductPurchaseRecord & {
  productName: string
  category: string | null
}

/**
 * 商品を問わず、購入済みの記録をすべて取得する。画面C(購入履歴・
 * レポート画面)の「全体の購入履歴一覧」で使う。
 * 家庭利用の範囲では件数が多くならない想定のため、一旦まとめて
 * 取得してからJavaScript側で日付順に並べている(他の履歴系の関数と
 * 同じ考え方。fetchLastCompletedTripProductNamesのコメントを参照)
 */
export async function fetchAllPurchaseHistory(): Promise<PurchaseHistoryEntry[]> {
  const householdId = requireHouseholdId()
  const snapshot = await getDocs(
    query(householdCollection(householdId, 'tripItems'), where('status', '==', 'purchased')),
  )
  return snapshot.docs
    .map((d) => ({
      id: d.id,
      tripId: d.data().tripId as string,
      productName: d.data().productName as string,
      category: (d.data().category ?? null) as string | null,
      price: d.data().price as number,
      amount: (d.data().amount ?? null) as number | null,
      unit: (d.data().unit ?? null) as string | null,
      quantity: (d.data().quantity ?? 1) as number,
      purchasedAt: (d.data().addedToCartAt ?? d.data().createdAt ?? '') as string,
      isOnSale: (d.data().isOnSale ?? false) as boolean,
      regularPrice: (d.data().regularPrice ?? null) as number | null,
    }))
    .sort((a, b) => (a.purchasedAt > b.purchasedAt ? -1 : 1))
}

export type CompletedTripSummary = {
  id: string
  completedAt: string
  actualTotal: number
  /** 行った店舗名(計画中に設定していれば)。画面Cの購入履歴で表示するために使う */
  storeName: string | null
}

/**
 * 完了した買い物トリップをすべて取得する(古い順)。画面Cの
 * 「買い物1回ごとの合計金額の推移グラフ」「年間利用額」「店舗名の表示」で使う
 */
export async function fetchAllCompletedTrips(): Promise<CompletedTripSummary[]> {
  const householdId = requireHouseholdId()
  const snapshot = await getDocs(
    query(householdCollection(householdId, 'shoppingTrips'), where('status', '==', 'completed')),
  )
  return snapshot.docs
    .map((d) => ({
      id: d.id,
      completedAt: (d.data().completedAt ?? '') as string,
      actualTotal: (d.data().actualTotal ?? 0) as number,
      storeName: (d.data().storeName ?? null) as string | null,
    }))
    .sort((a, b) => (a.completedAt < b.completedAt ? -1 : 1))
}
