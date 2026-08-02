import { useEffect, useState } from 'react'
import { X, Loader2, Search } from 'lucide-react'
import { useCartStore, searchProductCatalog, type CatalogSuggestion } from '../store/cartStore'

// 「マイ定番棚」に新しい商品を登録するための簡易フォーム。
// 内容量(g/mlなど)と単位を入力できるようにし、入力すると単価
// (100gあたりいくら、など)を自動計算して表示する。
// 内容量・単位は任意入力(分からなければ空でもよい)。
//
// 商品名の入力中は、商品名候補データベース(costcotuu.comの商品一覧を
// 元にした参考データ。まだ我が家で買ったことはない)と、現在の
// マイ定番棚の両方から一致するものを候補として表示する。
// 定番棚に既にある商品を選んだ場合はその商品を更新し、商品名候補
// データベースのみの商品を選んだ場合は新規登録の下書きとして使う。

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
    matchedProductId?: string | null,
    matchedCategory?: string | null,
  ) => Promise<void>
  /** 事前リストから登録する場合など、商品名をあらかじめ入力しておきたい時に使う */
  initialName?: string
}

export function AddProductForm({ onClose, onSubmit, initialName }: Props) {
  const favorites = useCartStore((state) => state.favorites)

  const [name, setName] = useState(initialName ?? '')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const [suggestions, setSuggestions] = useState<CatalogSuggestion[]>([])
  const [matchedProductId, setMatchedProductId] = useState<string | null>(null)
  const [matchedCategory, setMatchedCategory] = useState<string | null>(null)
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)

  // 商品名の入力に合わせて候補を検索する(300ms待ってから検索し、
  // 1文字打つたびに検索が走らないようにしている)
  useEffect(() => {
    if (name.trim().length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(() => {
      setSuggestions(searchProductCatalog(name, favorites))
    }, 300)
    return () => clearTimeout(timer)
  }, [name, favorites])

  const canSubmit = name.trim().length > 0 && Number(price) > 0

  const amountValue = Number(amount)
  const hasUnitPrice = unit !== '' && amountValue > 0 && Number(price) > 0
  const unitPriceLabel = hasUnitPrice
    ? `¥${(Number(price) / amountValue).toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${unit}`
    : null

  function handleNameChange(value: string) {
    setName(value)
    setMatchedProductId(null) // 手入力で編集したら候補選択は無効にする
    setMatchedCategory(null)
    setIsSuggestionsOpen(true)
  }

  function handlePickSuggestion(product: CatalogSuggestion) {
    setName(product.name)
    setMatchedProductId(product.id)
    setMatchedCategory(product.category)
    setIsSuggestionsOpen(false)
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
        matchedCategory,
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
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />
          {matchedProductId !== null && (
            <span className="mt-1 block text-xs font-medium text-costco-blue-600">定番棚の登録済み商品を選択中</span>
          )}
          {isSuggestionsOpen && suggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {suggestions.map((product, index) => (
                <li key={product.id ?? `catalog-${index}`}>
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
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
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
        <p className="mb-6 h-4 text-xs font-medium text-costco-blue-600">{unitPriceLabel}</p>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          追加する
        </button>
      </div>
    </div>
  )
}
