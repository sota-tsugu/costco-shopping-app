import { useState } from 'react'
import { X, Search, PlusCircle } from 'lucide-react'
import type { Product, WishlistItem } from '../store/cartStore'

// 事前リストの項目(自宅で入力した仮の商品名)が、マイ定番棚のどの商品を
// 指しているのか完全一致で分からなかった時に開く選択画面。
// 「既にある商品から選ぶ」か「新しい商品として登録する」かを選べる。
//
// 【今後の拡張候補】一度選んだ組み合わせ(例:「トイペ」→トイレットペーパー)
// を覚えておくProductAlias機能はまだ実装していないため、次回もまた
// この画面で選び直す必要がある点に注意(企画書のフェーズ1-b以降の課題)。

type Props = {
  wishlistItem: WishlistItem
  favorites: Product[]
  onPickExisting: (product: Product) => void
  onCreateNew: () => void
  onClose: () => void
}

export function WishlistMatchModal({ wishlistItem, favorites, onPickExisting, onCreateNew, onClose }: Props) {
  const [query, setQuery] = useState('')

  const filtered = favorites.filter((product) =>
    product.name.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">
            「{wishlistItem.raw_name}」はどの商品ですか?
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="定番棚の商品を検索"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-costco-blue-500 focus:outline-none"
          />
        </div>

        <button
          onClick={onCreateNew}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-costco-red-200 py-3 text-sm font-medium text-costco-red-600 transition-colors active:bg-costco-red-50"
        >
          <PlusCircle className="h-4 w-4" />
          新しい商品として登録する
        </button>

        <ul className="space-y-2">
          {filtered.map((product) => (
            <li key={product.id}>
              <button
                onClick={() => onPickExisting(product)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-3 text-left text-sm hover:bg-slate-50"
              >
                <span className="text-slate-800">{product.name}</span>
                <span className="text-slate-400">
                  ¥{(product.default_price ?? 0).toLocaleString()}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="py-4 text-center text-sm text-slate-400">見つかりませんでした</li>
          )}
        </ul>
      </div>
    </div>
  )
}
