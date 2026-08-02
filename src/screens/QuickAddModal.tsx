import { useState } from 'react'
import { X, Plus, Minus, ShoppingCart } from 'lucide-react'
import { getSuggestedCartDetails, type Product, type PurchaseSummary } from '../store/cartStore'

// 店内でカートに商品を入れる瞬間に、今回の価格・内容量・単位・数量を
// 確認/入力する画面。
//
// 【設計の背景】コストコは価格や内容量(パッケージサイズ)が頻繁に
// 変わるため、「前回買った時の値をそのまま今回も使う」だけでは
// 正確な記録にならない。かといって毎回タップのたびに開くと、企画時から
// 大事にしている「タップ一発でカートに追加」という片手操作の速さが
// 失われてしまう。そのため、この画面は「今回は前回と違う」という時
// だけ開く任意のステップとし、通常のワンタップ追加(ShoppingScreen側)
// と使い分けている。
//
// 各項目は直近の購入履歴(なければ登録時の値)を初期値として表示し、
// 変わっていなければそのまま「カートに追加」を押すだけでよい。

const UNIT_OPTIONS = [
  { value: '', label: '単位なし' },
  { value: 'g', label: 'g(グラム)' },
  { value: 'ml', label: 'ml(ミリリットル)' },
  { value: '個', label: '個' },
  { value: '枚', label: '枚' },
  { value: '本', label: '本' },
  { value: 'パック', label: 'パック' },
]

type Props = {
  product: Product
  summary: PurchaseSummary | undefined
  onClose: () => void
  onConfirm: (details: { price: number; amount: number | null; unit: string | null; quantity: number }) => void
}

export function QuickAddModal({ product, summary, onClose, onConfirm }: Props) {
  const suggested = getSuggestedCartDetails(product, summary)

  const [price, setPrice] = useState(String(suggested.price || ''))
  const [amount, setAmount] = useState(suggested.amount !== null ? String(suggested.amount) : '')
  const [unit, setUnit] = useState(suggested.unit ?? '')
  const [quantity, setQuantity] = useState(1)

  const canSubmit = Number(price) > 0 && quantity > 0

  function handleConfirm() {
    if (!canSubmit) return
    const amountValue = Number(amount)
    onConfirm({
      price: Number(price),
      amount: amountValue > 0 ? amountValue : null,
      unit: unit !== '' ? unit : null,
      quantity,
    })
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">{product.name}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          {summary
            ? `前回: ¥${summary.lastPrice.toLocaleString()}${summary.lastAmount ? ` / ${summary.lastAmount}${summary.lastUnit ?? ''}` : ''}`
            : 'まだ購入履歴がありません(登録時の内容を表示しています)'}
        </p>

        <label className="mb-1 block text-xs font-medium text-slate-500">今回の価格(円)</label>
        <input
          type="number"
          inputMode="numeric"
          autoFocus
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">
          今回の内容量(任意・単価計算に使います)
        </label>
        <div className="mb-4 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例:900"
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">数量</label>
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="rounded-lg bg-slate-100 p-3 active:bg-slate-200"
            aria-label="数量を減らす"
          >
            <Minus className="h-4 w-4 text-slate-700" />
          </button>
          <span className="w-8 text-center text-lg font-bold text-slate-800">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => q + 1)}
            className="rounded-lg bg-slate-100 p-3 active:bg-slate-200"
            aria-label="数量を増やす"
          >
            <Plus className="h-4 w-4 text-slate-700" />
          </button>
        </div>

        <button
          onClick={handleConfirm}
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
        >
          <ShoppingCart className="h-5 w-5" />
          カートに追加
        </button>
      </div>
    </div>
  )
}
