import { useEffect, useState } from 'react'
import { X, Loader2, Search } from 'lucide-react'
import { searchProductCatalog, type Product } from '../store/cartStore'

// 「マイ定番棚」に新しい商品を登録するための簡易フォーム。
// フェーズ1-bで、内容量(g/mlなど)と単位を入力できるようにし、
// 入力すると単価(100gあたりいくら、など)を自動計算して表示する。
// 内容量・単位は任意入力(分からなければ空でもよい)。
//
// 商品名の入力中は、商品名候補データベース(costcotuu.comの商品一覧を
// 元に登録した参考データ。まだ我が家で買ったことはない)から一致する
// ものを候補として表示する。候補をタップすると、既にDBにある商品を
// 定番棚に「昇格」させる形になり、同じ名前の商品が重複登録されるのを防ぐ。

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
  onSubmit: (
    name: string,
    price: number,
    amount: number | null,
    unit: string | null,
    matchedProductId?: number | null,
  ) => Promise<void>
  /** 事前リストから登録する場合など、商品名をあらかじめ入力しておきたい時に使う */
  initialName?: string
}

export function AddProductForm({ onClose, onSubmit, initialName }: Props) {
  const [name, setName] = useState(initialName ?? '')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const [suggestions, setSuggestions] = useState<Product[]>([])
  const [matchedProductId, setMatchedProductId] = useState<number | null>(null)
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)

  // 商品名の入力に合わせて候補を検索する(300ms待ってから検索し、
  // 1文字打つたびに検索が走らないようにしている)
  useEffect(() => {
    if (name.trim().length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      const results = await searchProductCatalog(name)
      setSuggestions(results)
    }, 300)
    return () => clearTimeout(timer)
  }, [name])

  const canSubmit = name.trim().length > 0 && Number(price) > 0

  const amountValue = Number(amount)
  const hasUnitPrice = unit !== '' && amountValue > 0 && Number(price) > 0
  const unitPriceLabel = hasUnitPrice
    ? `¥${(Number(price) / amountValue).toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${unit}`
    : null

  function handleNameChange(value: string) {
    setName(value)
    setMatchedProductId(null) // 手入力で編集したら候補選択は無効にする
    setIsSuggestionsOpen(true)
  }

  function handlePickSuggestion(product: Product) {
    setName(product.name)
    setMatchedProductId(product.id)
    setIsSuggestionsOpen(false)
    // 候補データベースの商品は価格が未登録なので、価格欄はそのまま
    // (すでに定番棚にある商品を選んだ場合は現在価格を引き継ぐ)
    if (product.default_price !== null) {
      setPrice(String(product.default_price))
    }
    if (product.amount !== null) {
      setAmount(String(product.amount))
    }
    if (product.unit !== null) {
      setUnit(product.unit)
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      await onSubmit(
        name.trim(),
        Number(price),
        amountValue > 0 ? amountValue : null,
        unit !== '' ? unit : null,
        matchedProductId,
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
        <div className="relative mb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={() => setIsSuggestionsOpen(true)}
            placeholder="例:トイレットペーパー"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-blue-600 focus:outline-none"
          />
          {matchedProductId !== null && (
            <span className="mt-1 block text-xs text-blue-700">候補から選択済み</span>
          )}
          {isSuggestionsOpen && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {suggestions.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => handlePickSuggestion(product)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    <span className="flex-1 truncate">{product.name}</span>
                    {product.category && (
                      <span className="shrink-0 text-xs text-slate-400">{product.category}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
