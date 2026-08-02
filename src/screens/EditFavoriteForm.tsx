import { useMemo, useState } from 'react'
import { X, Loader2, Trash2, Check } from 'lucide-react'
import { useCartStore, type Product } from '../store/cartStore'

// マイ定番棚に登録済みの商品を編集する画面。
// 名前・価格・内容量・単位・カテゴリをまとめて修正できる(これまでは
// 「価格の修正」しかできなかった)。
//
// 【削除の扱い】実際にデータを消す(ハードデリート)のではなく、
// isFavoriteをfalseにするだけの「ソフトデリート」にしている。過去の
// 購入履歴(値上がり/値下がり比較などに使う)が参照する商品情報を
// 失わないようにするため。SOTAさんとの相談の上での決定。

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
  onClose: () => void
}

export function EditFavoriteForm({ product, onClose }: Props) {
  const favorites = useCartStore((state) => state.favorites)
  const updateFavoriteProduct = useCartStore((state) => state.updateFavoriteProduct)
  const removeFavoriteProduct = useCartStore((state) => state.removeFavoriteProduct)
  const deleteFavoriteProductPermanently = useCartStore((state) => state.deleteFavoriteProductPermanently)

  const [name, setName] = useState(product.name)
  const [price, setPrice] = useState(String(product.default_price ?? ''))
  const [amount, setAmount] = useState(product.amount !== null ? String(product.amount) : '')
  const [unit, setUnit] = useState(product.unit ?? '')
  const [category, setCategory] = useState(product.category ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // 他の定番棚商品で使われているカテゴリ名を候補として出す
  // (表記ゆれを防ぐため。自由入力も引き続きできる)
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of favorites) {
      if (p.category) set.add(p.category)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [favorites])

  const canSubmit = name.trim().length > 0 && Number(price) > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      const amountValue = Number(amount)
      await updateFavoriteProduct(product.id, {
        name: name.trim(),
        price: Number(price),
        amount: amountValue > 0 ? amountValue : null,
        unit: unit !== '' ? unit : null,
        category: category.trim() !== '' ? category.trim() : null,
      })
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove() {
    const confirmed = window.confirm(
      `「${product.name}」をマイ定番棚から外しますか?\n(過去の購入履歴は残ります。商品名候補として再登録すれば、いつでも定番棚に戻せます)`,
    )
    if (!confirmed) return
    setIsRemoving(true)
    try {
      await removeFavoriteProduct(product.id)
      onClose()
    } finally {
      setIsRemoving(false)
    }
  }

  async function handleDeletePermanently() {
    const confirmed = window.confirm(
      `「${product.name}」を完全に削除します。この商品の購入履歴もすべて削除され、元に戻せません。\n\n` +
        `テストで適当に登録した商品や、誤って会計を完了させてしまった記録を消したい時のための機能です。` +
        `よく使っている商品を消したい場合は、代わりに「マイ定番棚から外す」をお使いください。\n\n` +
        `本当に完全に削除しますか?`,
    )
    if (!confirmed) return
    setIsDeleting(true)
    try {
      await deleteFavoriteProductPermanently(product.id)
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">商品を編集</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">商品名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">価格(円)</label>
        <input
          type="number"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">
          内容量(任意・単価計算に使います)
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

        <label className="mb-1 block text-xs font-medium text-slate-500">
          カテゴリ(任意・買い忘れ防止の分類に使います)
        </label>
        <input
          type="text"
          list="category-options"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="例:飲料"
          className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />
        <datalist id="category-options">
          {categoryOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSaving}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-costco-blue-700 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-blue-800 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          保存する
        </button>

        <button
          onClick={handleRemove}
          disabled={isRemoving}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50"
        >
          {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          マイ定番棚から外す
        </button>

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs text-slate-400">
            テスト登録や入力ミスなど、購入履歴ごと完全に無かったことにしたい場合はこちら(元に戻せません)
          </p>
          <button
            onClick={handleDeletePermanently}
            disabled={isDeleting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            購入履歴ごと完全に削除する
          </button>
        </div>
      </div>
    </div>
  )
}
