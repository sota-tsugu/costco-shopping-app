import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

// 「マイ定番棚」に新しい商品を登録するための簡易フォーム。
// フェーズ1-bで、内容量(g/mlなど)と単位を入力できるようにし、
// 入力すると単価(100gあたりいくら、など)を自動計算して表示する。
// 内容量・単位は任意入力(分からなければ空でもよい)。

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
  onClose: () => void
  onSubmit: (name: string, price: number, amount: number | null, unit: string | null) => Promise<void>
  /** 事前リストから登録する場合など、商品名をあらかじめ入力しておきたい時に使う */
  initialName?: string
}

export function AddProductForm({ onClose, onSubmit, initialName }: Props) {
  const [name, setName] = useState(initialName ?? '')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const canSubmit = name.trim().length > 0 && Number(price) > 0

  const amountValue = Number(amount)
  const hasUnitPrice = unit !== '' && amountValue > 0 && Number(price) > 0
  const unitPriceLabel = hasUnitPrice
    ? `¥${(Number(price) / amountValue).toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${unit}`
    : null

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      await onSubmit(
        name.trim(),
        Number(price),
        amountValue > 0 ? amountValue : null,
        unit !== '' ? unit : null,
      )
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">定番棚に商品を追加</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">商品名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例:トイレットペーパー"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-blue-600 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">価格(円)</label>
        <input
          type="number"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="例:1580"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-blue-600 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">
          内容量(任意・単価計算に使います)
        </label>
        <div className="mb-1 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例:900"
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-blue-600 focus:outline-none"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-blue-600 focus:outline-none"
          >
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mb-6 h-4 text-xs text-blue-700">{unitPriceLabel}</p>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-bold text-white shadow disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          追加する
        </button>
      </div>
    </div>
  )
}
