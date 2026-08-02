// 【一時的な移行ツール】以前のsql.js(端末内DB)にあったデータを、
// 新しく作った家族(Firestore)に一度だけコピーする。
// 新しい家族コードを作った直後にHouseholdSetupScreenから呼ばれる。
//
// 以前のデータが無い(または読み込めない)場合は何もせず終了する
// (真新しい端末で家族に「参加」する場合はそもそも実行しない)。
//
// このファイルとsrc/db以下は、移行の役目を終えたら削除してよい
// (CLAUDE.mdに記載)。

import { collection, addDoc } from 'firebase/firestore'
import { db } from './config'
import { dbClient, rowsToObjects } from '../db/dbClient'

type OldProduct = {
  id: number
  name: string
  category: string | null
  amount: number | null
  unit: string | null
  default_price: number | null
  is_favorite: number
  created_at: string
}

type OldTrip = {
  id: number
  budget: number
  status: string
  started_at: string
  completed_at: string | null
  actual_total: number | null
}

type OldPurchase = {
  id: number
  product_id: number
  trip_id: number
  price: number
  quantity: number
  amount: number | null
  unit: string | null
  created_at: string
}

type OldWishlist = {
  id: number
  raw_name: string
  created_at: string
}

export async function migrateLocalDataToHousehold(householdId: string): Promise<void> {
  await dbClient.init()

  const productsResult = await dbClient.exec(
    'SELECT id, name, category, amount, unit, default_price, is_favorite, created_at FROM product WHERE is_favorite = 1',
  )
  const oldProducts = rowsToObjects<OldProduct>(productsResult)
  if (oldProducts.length === 0) return // 引き継ぐデータが無ければ何もしない

  const productIdMap = new Map<number, string>()
  for (const p of oldProducts) {
    const newDoc = await addDoc(collection(db, 'households', householdId, 'products'), {
      name: p.name,
      category: p.category,
      amount: p.amount,
      unit: p.unit,
      defaultPrice: p.default_price,
      isFavorite: true,
      createdAt: p.created_at,
    })
    productIdMap.set(p.id, newDoc.id)
  }

  const tripsResult = await dbClient.exec(
    "SELECT id, budget, status, started_at, completed_at, actual_total FROM shopping_trip WHERE status = 'completed'",
  )
  const oldTrips = rowsToObjects<OldTrip>(tripsResult)
  const tripIdMap = new Map<number, string>()
  for (const t of oldTrips) {
    const newDoc = await addDoc(collection(db, 'households', householdId, 'shoppingTrips'), {
      budget: t.budget,
      status: 'completed',
      startedAt: t.started_at,
      completedAt: t.completed_at,
      actualTotal: t.actual_total,
    })
    tripIdMap.set(t.id, newDoc.id)
  }

  const purchasesResult = await dbClient.exec(
    'SELECT id, product_id, trip_id, price, quantity, amount, unit, created_at FROM purchase',
  )
  const oldPurchases = rowsToObjects<OldPurchase>(purchasesResult)
  for (const purchase of oldPurchases) {
    const newProductId = productIdMap.get(purchase.product_id)
    const newTripId = tripIdMap.get(purchase.trip_id)
    // 完了済みトリップに属さない(=進行中だった)購入は、テスト中のカート
    // データである可能性が高いため引き継がない
    if (!newProductId || !newTripId) continue

    const product = oldProducts.find((p) => p.id === purchase.product_id)
    await addDoc(collection(db, 'households', householdId, 'purchases'), {
      productId: newProductId,
      productName: product?.name ?? '',
      tripId: newTripId,
      price: purchase.price,
      quantity: purchase.quantity,
      amount: purchase.amount,
      unit: purchase.unit,
      createdAt: purchase.created_at,
      tripStatus: 'completed',
    })
  }

  const wishlistResult = await dbClient.exec('SELECT id, raw_name, created_at FROM wishlist')
  const oldWishlist = rowsToObjects<OldWishlist>(wishlistResult)
  for (const item of oldWishlist) {
    await addDoc(collection(db, 'households', householdId, 'wishlist'), {
      rawName: item.raw_name,
      productId: null,
      createdAt: item.created_at,
    })
  }
}
