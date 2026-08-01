import { useEffect, useState } from 'react'
import { X, Loader2, History, Pencil, ArrowUp, ArrowDown, Check } from 'lucide-react'
import { dbClient, rowsToObjects } from '../db/dbClient'
import { useCartStore, type Product } from '../store/cartStore'

// 商品名をタップすると開く、過去の購入履歴・購入頻度・価格比較の確認画面。
// 「今回の買い物(進行中のカート)」は含めず、会計が完了したトリップの
// 記録だけを対象にする(まだ買ってもいないものを履歴に含めないため)。

type PurchaseHistoryRow = {
  created_at: string
  price: number
  quantity: number
}

type Props = {
  product: Product
  onClose: () => void
}

/** 値上がり/値下がりのバッジ(価格差がなければ何も表示しない) */
function PriceDiffBadge({ diff }: { diff: number }) {
  if (diff === 0) return null
  const isUp = diff > 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-bold ${
        isUp ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
      }`}
    >
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}¥
      {Math.abs(diff).toLocaleString()}
    </span>
  )
}

export function ProductHistoryModal({ product, onClose }: Props) {
  const updateProductPrice = useCartStore((state) => state.updateProductPrice)

  const [rows, setRows] = useState<PurchaseHistoryRow[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isEditingPrice, setIsEditingPrice] = useState(false)
  const [priceInput, setPriceInput] = useState(String(product.default_price ?? ''))
  const [isSavingPrice, setIsSavingPrice] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const result = await dbClient.exec(
          `SELECT purchase.created_at AS created_at, purchase.price AS price, purchase.quantity AS quantity
           FROM purchase
           JOIN shopping_trip ON purchase.trip_id = shopping_trip.id
           WHERE purchase.product_id = ? AND shopping_trip.status = 'completed'
           ORDER BY purchase.created_at DESC`,
          [product.id],
        )
        if (!cancelled) {
          setRows(rowsToObjects<PurchaseHistoryRow>(result))
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error))
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [product.id])

  // 購入間隔(日数)の平均を計算する。買い物のたびに1件記録されている前提。
  const averageIntervalDays = (() => {
    if (!rows || rows.length < 2) return null
    const sortedAsc = [...rows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    const intervals: number[] = []
    for (let i = 1; i < sortedAsc.length; i++) {
      const days =
        (new Date(sortedAsc[i].created_at).getTime() -
          new Date(sortedAsc[i - 1].created_at).getTime()) /
        (1000 * 60 * 60 * 24)
      intervals.push(days)
    }
    const avg = intervals.reduce((sum, d) => sum + d, 0) / intervals.length
    return Math.round(avg)
  })()

  // 「今の価格」と直近の購入価格を比較する
  const latestHistoricalPrice = rows && rows.length > 0 ? rows[0].price : null
  const currentPrice = product.default_price ?? 0
  const currentVsLatestDiff =
    latestHistoricalPrice !== null ? currentPrice - latestHistoricalPrice : null

  async function handleSavePrice() {
    const newPrice = Number(priceInput)
    if (!Number.isFinite(newPrice) || newPrice <= 0) return
    setIsSavingPrice(true)
    try {
      await updateProductPrice(product.id, newPrice)
      setIsEditingPrice(false)
    } finally {
      setIsSavingPrice(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-700" />
            <h2 className="text-base font-bold text-slate-800">{product.name}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 現在の価格(編集可能) */}
        <div className="mb-4 rounded-lg bg-slate-50 p-3">
          <div className="mb-1 text-xs text-slate-500">現在の価格(次回カートに追加する時の価格)</div>
          {isEditingPrice ? (
            <div className="flex items-center gap-2">
              <span className="text-lg text-slate-400">¥</span>
              <input
                type="number"
                inputMode="numeric"
                autoFocus
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-24 rounded border border-slate-300 px-2 py-1 text-lg font-bold focus:border-blue-600 focus:outline-none"
              />
              <button
                onClick={handleSavePrice}
                disabled={isSavingPrice}
                className="ml-auto flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {isSavingPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                保存
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-slate-800">
                ¥{currentPrice.toLocaleString()}
              </span>
              {currentVsLatestDiff !== null && <PriceDiffBadge diff={currentVsLatestDiff} />}
              <button
                onClick={() => {
                  setPriceInput(String(product.default_price ?? ''))
                  setIsEditingPrice(true)
                }}
                className="ml-auto flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600"
              >
                <Pencil className="h-3 w-3" />
                価格を修正
              </button>
            </div>
          )}
        </div>

        {rows === null && !errorMessage && (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            読み込んでいます…
          </div>
        )}

        {errorMessage && <p className="py-4 text-sm text-red-600">エラー: {errorMessage}</p>}

        {rows !== null && rows.length === 0 && (
          <p className="py-4 text-sm text-slate-400">
            まだ購入履歴がありません。会計を完了すると、ここに記録されていきます。
          </p>
        )}

        {rows !== null && rows.length > 0 && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-100 p-3 text-center">
                <div className="text-xl font-bold text-slate-800">{rows.length}</div>
                <div className="text-xs text-slate-500">購入回数</div>
              </div>
              <div className="rounded-lg bg-slate-100 p-3 text-center">
                <div className="text-xl font-bold text-slate-800">
                  {averageIntervalDays !== null ? `${averageIntervalDays}日` : '-'}
                </div>
                <div className="text-xs text-slate-500">平均購入間隔</div>
              </div>
            </div>

            <ul className="space-y-2">
              {rows.map((row, index) => {
                const olderRow = rows[index + 1] // 1つ前(時系列で古い方)の購入
                const diff = olderRow ? row.price - olderRow.price : 0

                return (
                  <li
                    key={index}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-600">
                      {new Date(row.created_at).toLocaleDateString('ja-JP')}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-800">
                        ¥{row.price.toLocaleString()} × {row.quantity}
                      </span>
                      {olderRow && <PriceDiffBadge diff={diff} />}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
