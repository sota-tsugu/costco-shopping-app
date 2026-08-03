import { useEffect, useState } from 'react'
import { X, Loader2, History, Pencil, Check, Trash2 } from 'lucide-react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { getSavedHouseholdId } from '../firebase/household'
import { useCartStore, type Product } from '../store/cartStore'
import { toComparableValue, diffComparableValues, formatComparable } from '../utils/priceCompare'
import { PriceDiffBadge } from '../components/PriceDiffBadge'

// 商品名をタップすると開く、過去の購入履歴・購入頻度・価格比較の確認画面。
// 「今回の買い物(進行中のカート)」は含めず、会計が完了したトリップの
// 記録だけを対象にする(まだ買ってもいないものを履歴に含めないため)。
//
// 価格比較のロジック(単位あたり単価での比較)は src/utils/priceCompare.ts
// に共通化している(BudgetSetupScreenの「今回買う予定」リストでも使用)。
//
// 【購入記録1件ずつの訂正】各行の鉛筆アイコンから、その場でその1件の
// 価格・数量・内容量・単位を訂正したり、削除したりできる。以前は
// 「商品ごと丸ごと削除する」という荒い手段しかなかったが、入力ミスに
// 気づいた時にその1件だけを直せるようにした(オブジェクト指向UI的な
// 改善: 購入記録という個々のオブジェクトに対して、直接操作できるように
// している)。

type PurchaseHistoryRow = {
  id: string
  created_at: string
  price: number
  quantity: number
  amount: number | null
  unit: string | null
}

type Props = {
  product: Product
  onClose: () => void
}

export function ProductHistoryModal({ product, onClose }: Props) {
  const updateProductPrice = useCartStore((state) => state.updateProductPrice)
  const updatePurchaseRecord = useCartStore((state) => state.updatePurchaseRecord)
  const deletePurchaseRecord = useCartStore((state) => state.deletePurchaseRecord)

  const [rows, setRows] = useState<PurchaseHistoryRow[] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isEditingPrice, setIsEditingPrice] = useState(false)
  const [priceInput, setPriceInput] = useState(String(product.default_price ?? ''))
  const [isSavingPrice, setIsSavingPrice] = useState(false)

  // 購入履歴の1件を訂正中の状態。editingRowIdがnullなら誰も編集していない
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editPriceInput, setEditPriceInput] = useState('')
  const [editQuantityInput, setEditQuantityInput] = useState('')
  const [editAmountInput, setEditAmountInput] = useState('')
  const [editUnitInput, setEditUnitInput] = useState('')
  const [isSavingRow, setIsSavingRow] = useState(false)
  const [isDeletingRow, setIsDeletingRow] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const householdId = getSavedHouseholdId()
        if (!householdId) throw new Error('家族コードが見つかりません')

        const snapshot = await getDocs(
          query(
            collection(db, 'households', householdId, 'purchases'),
            where('productId', '==', product.id),
            where('tripStatus', '==', 'completed'),
          ),
        )
        const fetched = snapshot.docs
          .map((d) => ({
            id: d.id,
            created_at: d.data().createdAt as string,
            price: d.data().price as number,
            quantity: d.data().quantity as number,
            amount: (d.data().amount ?? null) as number | null,
            unit: (d.data().unit ?? null) as string | null,
          }))
          .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))

        if (!cancelled) {
          setRows(fetched)
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

  // 「今の価格」と直近の購入(単位あたり単価)を比較する。
  // 今の内容量・単位を使うのは、これから追加する場合の見込みだから。
  const currentComparable = toComparableValue({
    price: product.default_price ?? 0,
    amount: product.amount,
    unit: product.unit,
  })
  const latestRow = rows && rows.length > 0 ? rows[0] : null
  const currentVsLatestDiff = latestRow
    ? diffComparableValues(currentComparable, toComparableValue(latestRow))
    : null

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

  function startEditingRow(row: PurchaseHistoryRow) {
    setEditingRowId(row.id)
    setEditPriceInput(String(row.price))
    setEditQuantityInput(String(row.quantity))
    setEditAmountInput(row.amount !== null ? String(row.amount) : '')
    setEditUnitInput(row.unit ?? '')
  }

  async function handleSaveRow(rowId: string) {
    const price = Number(editPriceInput)
    const quantity = Number(editQuantityInput)
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0) return
    setIsSavingRow(true)
    try {
      const amountValue = Number(editAmountInput)
      const updates = {
        price,
        quantity,
        amount: amountValue > 0 ? amountValue : null,
        unit: editUnitInput.trim() !== '' ? editUnitInput.trim() : null,
      }
      await updatePurchaseRecord(rowId, updates)
      setRows((prev) => (prev ? prev.map((r) => (r.id === rowId ? { ...r, ...updates } : r)) : prev))
      setEditingRowId(null)
    } finally {
      setIsSavingRow(false)
    }
  }

  async function handleDeleteRow(rowId: string) {
    const confirmed = window.confirm('この購入記録を削除しますか?(この1件だけが消え、他の履歴には影響しません)')
    if (!confirmed) return
    setIsDeletingRow(true)
    try {
      await deletePurchaseRecord(rowId)
      setRows((prev) => (prev ? prev.filter((r) => r.id !== rowId) : prev))
      setEditingRowId(null)
    } finally {
      setIsDeletingRow(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-costco-blue-600" />
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
                className="w-24 rounded border border-slate-300 px-2 py-1 text-lg font-bold focus:border-costco-blue-500 focus:outline-none"
              />
              <button
                onClick={handleSavePrice}
                disabled={isSavingPrice}
                className="ml-auto flex items-center gap-1 rounded-lg bg-costco-blue-700 px-3 py-1.5 text-sm font-semibold text-white transition-colors active:bg-costco-blue-800 disabled:opacity-50"
              >
                {isSavingPrice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                保存
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-800">
                  ¥{(product.default_price ?? 0).toLocaleString()}
                </span>
                {currentComparable.unitLabel && (
                  <span className="text-xs font-medium text-costco-blue-600">{formatComparable(currentComparable)}</span>
                )}
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
              {currentVsLatestDiff && (
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  前回の購入と比べて
                  <PriceDiffBadge diff={currentVsLatestDiff.diff} unitLabel={currentVsLatestDiff.unitLabel} />
                </div>
              )}
            </>
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
                const rowComparable = toComparableValue(row)
                const diffResult = olderRow
                  ? diffComparableValues(rowComparable, toComparableValue(olderRow))
                  : null
                const isEditingRow = editingRowId === row.id

                return (
                  <li
                    key={row.id}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {isEditingRow ? (
                      <div>
                        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                          <span>{new Date(row.created_at).toLocaleDateString('ja-JP')}の記録を訂正</span>
                          <button onClick={() => setEditingRowId(null)} className="text-slate-400">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mb-2 flex gap-2">
                          <div className="flex-1">
                            <label className="mb-0.5 block text-[10px] text-slate-400">価格(円)</label>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={editPriceInput}
                              onChange={(e) => setEditPriceInput(e.target.value)}
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-costco-blue-500 focus:outline-none"
                            />
                          </div>
                          <div className="w-16">
                            <label className="mb-0.5 block text-[10px] text-slate-400">数量</label>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={editQuantityInput}
                              onChange={(e) => setEditQuantityInput(e.target.value)}
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-costco-blue-500 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="mb-3 flex gap-2">
                          <div className="flex-1">
                            <label className="mb-0.5 block text-[10px] text-slate-400">内容量</label>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={editAmountInput}
                              onChange={(e) => setEditAmountInput(e.target.value)}
                              placeholder="任意"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-costco-blue-500 focus:outline-none"
                            />
                          </div>
                          <div className="w-20">
                            <label className="mb-0.5 block text-[10px] text-slate-400">単位</label>
                            <input
                              type="text"
                              value={editUnitInput}
                              onChange={(e) => setEditUnitInput(e.target.value)}
                              placeholder="g等"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-costco-blue-500 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveRow(row.id)}
                            disabled={isSavingRow || isDeletingRow}
                            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-costco-blue-700 py-1.5 text-xs font-semibold text-white transition-colors active:bg-costco-blue-800 disabled:opacity-50"
                          >
                            {isSavingRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            保存
                          </button>
                          <button
                            onClick={() => handleDeleteRow(row.id)}
                            disabled={isSavingRow || isDeletingRow}
                            className="flex items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50"
                          >
                            {isDeletingRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            削除
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => startEditingRow(row)} className="block w-full text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">
                            {new Date(row.created_at).toLocaleDateString('ja-JP')}
                          </span>
                          <span className="flex items-center gap-1.5 text-slate-800">
                            ¥{row.price.toLocaleString()} × {row.quantity}
                            <Pencil className="h-3 w-3 text-slate-300" />
                          </span>
                        </div>
                        {(rowComparable.unitLabel || diffResult) && (
                          <div className="mt-1 flex items-center justify-end gap-2 text-xs">
                            {rowComparable.unitLabel && (
                              <span className="text-costco-blue-600">{formatComparable(rowComparable)}</span>
                            )}
                            {diffResult && (
                              <PriceDiffBadge diff={diffResult.diff} unitLabel={diffResult.unitLabel} />
                            )}
                          </div>
                        )}
                      </button>
                    )}
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
