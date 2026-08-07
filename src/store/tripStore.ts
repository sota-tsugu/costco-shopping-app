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

import { create } from 'zustand'
import {
  collection,
  doc,
  addDoc,
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
  createdAt: string
  addedToCartAt: string | null
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

  /** 「planning」中のトリップが無ければ新しく作る。あれば何もしない */
  ensurePlanningTrip: (budget: number) => Promise<void>
  updateTripBudget: (budget: number) => Promise<void>
  /** 定番商品を今回買うものリストに入れる/外す(planning中のみ) */
  togglePlannedProduct: (product: Product, selected: boolean) => Promise<void>
  /** 買い物を開始する(planning→active) */
  startShopping: () => Promise<void>

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
  }) => Promise<void>
  updateCartItemQuantity: (tripItemId: string, quantity: number) => Promise<void>
  removeTripItem: (tripItemId: string) => Promise<void>
  /** 会計を完了する(inCartの商品をpurchasedにし、トリップをcompletedにする) */
  completeCheckout: () => Promise<void>
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

      // 「planning」または「active」の、進行中のトリップをリアルタイム購読する
      onSnapshot(
        query(householdCollection(householdId, 'shoppingTrips'), where('status', 'in', ['planning', 'active'])),
        (snapshot) => {
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
              }
            })
            .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
          const trip = trips[0]
          set({ currentTrip: trip })

          // このトリップに属する商品(tripItems)もリアルタイム購読する
          onSnapshot(
            query(householdCollection(householdId, 'tripItems'), where('tripId', '==', trip.id)),
            (itemsSnapshot) => {
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
                    createdAt: (data.createdAt ?? '') as string,
                    addedToCartAt: (data.addedToCartAt ?? null) as string | null,
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
    })
  },

  async updateTripBudget(budget) {
    const { currentTrip } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()
    await updateDoc(doc(householdCollection(householdId, 'shoppingTrips'), currentTrip.id), { budget })
  },

  async togglePlannedProduct(product, selected) {
    const { currentTrip, tripItems } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()

    if (selected) {
      const now = new Date().toISOString()
      await addDoc(householdCollection(householdId, 'tripItems'), {
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
      })
    } else {
      const existing = tripItems.find((item) => item.productId === product.id && item.status === 'considering')
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
      createdAt: now,
      addedToCartAt: now,
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

  async removeTripItem(tripItemId) {
    const householdId = requireHouseholdId()
    await deleteDoc(doc(householdCollection(householdId, 'tripItems'), tripItemId))
  },

  async completeCheckout() {
    const { currentTrip, tripItems } = get()
    if (!currentTrip) return
    const householdId = requireHouseholdId()
    const now = new Date().toISOString()

    const inCartItems = tripItems.filter((item) => item.status === 'inCart')
    const actualTotal = inCartItems.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0)

    const batch = writeBatch(db)
    for (const item of inCartItems) {
      batch.update(doc(householdCollection(householdId, 'tripItems'), item.id), { status: 'purchased' })
    }
    batch.update(doc(householdCollection(householdId, 'shoppingTrips'), currentTrip.id), {
      status: 'completed',
      completedAt: now,
      actualTotal,
    })
    await batch.commit()
  },
}))

/** 商品ごとの直近の購入記録をまとめて取得する(価格・内容量・単位の初期値提案に使う) */
export async function fetchLatestPurchaseByProduct(
  productId: string,
): Promise<{ price: number; amount: number | null; unit: string | null } | null> {
  const householdId = requireHouseholdId()
  const snapshot = await getDocs(
    query(
      householdCollection(householdId, 'tripItems'),
      where('productId', '==', productId),
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
