import { useMemo, useState } from 'react'
import { X, Search, PlusCircle, Pencil } from 'lucide-react'
import { useCartStore, calcUnitPriceLabel, type Product } from '../store/cartStore'
import { AddProductForm } from './AddProductForm'
import { EditFavoriteForm } from './EditFavoriteForm'

// マイ定番棚を管理する画面(一覧・追加・編集・削除)。
//
// 【設計の背景】これまで新しい商品の登録は買い物中(ShoppingScreen)
// でしかできず、買い物前の画面(BudgetSetupScreen)では登録済みの
// 商品しか確認できなかった。「事前に確認・登録できないのは問題」という
// 指摘を受けて追加。買い物を始める前でも定番棚を作成・整理できるように
// している(addFavoriteProduct/updateFavoriteProduct/removeFavoriteProduct
// はいずれも進行中のトリップに依存しないため、買い物前でも問題なく使える)。
//
// 追加はAddProductForm(商品名候補データベースからの入力補助つき)を
// そのまま流用し、編集・削除はEditFavoriteForm(このファイルとセットで
// 追加)に任せている。

const OTHER_CATEGORY = 'その他'

type Props = {
  onClose: () => void
}

export function ManageFavoritesModal({ onClose }: Props) {
  const favorites = useCartStore((state) => state.favorites)
  const addFavoriteProduct = useCartStore((state) => state.addFavoriteProduct)

  const [query, setQuery] = useState('')
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const filtered = useMemo(() => {
    if (query.trim().length === 0) return favorites
    const q = query.trim().toLowerCase()
    return favorites.filter((p) => p.name.toLowerCase().includes(q))
  }, [favorites, query])

  const grouped = useMemo(() => {
    const groups = new Map<string, Product[]>()
    for (const product of filtered) {
      const category = product.category ?? OTHER_CATEGORY
      const list = groups.get(category)
      if (list) {
        list.push(product)
      } else {
        groups.set(category, [product])
      }
    }
    const categoryNames = [...groups.keys()]
      .filter((name) => name !== OTHER_CATEGORY)
      .sort((a, b) => a.localeCompare(b, 'ja'))
    if (groups.has(OTHER_CATEGORY)) categoryNames.push(OTHER_CATEGORY)

    return categoryNames.map((category) => ({ category, items: groups.get(category)! }))
  }, [filtered])

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">マイ定番棚を管理</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <button
          onClick={() => setIsAddFormOpen(true)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-costco-red-200 py-3 text-sm font-medium text-costco-red-600 transition-colors active:bg-costco-red-50"
        >
          <PlusCircle className="h-4 w-4" />
          新しい商品を登録する
        </button>

        {favorites.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            まだ商品が登録されていません。上のボタンから登録してください。
          </p>
        ) : (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="商品名で絞り込み"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-costco-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-4">
              {grouped.map(({ category, items }) => (
                <div key={category}>
                  <div className="mb-1 text-xs font-semibold text-slate-500">{category}</div>
                  <ul className="space-y-1">
                    {items.map((product) => (
                      <li key={product.id}>
                        <button
                          onClick={() => setEditingProduct(product)}
                          className="flex w-full items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-slate-800">{product.name}</div>
                            <div className="text-xs text-slate-400">
                              ¥{(product.default_price ?? 0).toLocaleString()}
                              {calcUnitPriceLabel(product) && (
                                <span className="ml-1">({calcUnitPriceLabel(product)})</span>
                              )}
                            </div>
                          </div>
                          <Pencil className="h-4 w-4 shrink-0 text-slate-300" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {grouped.length === 0 && (
                <p className="py-4 text-center text-xs text-slate-400">見つかりませんでした</p>
              )}
            </div>
          </>
        )}
      </div>

      {isAddFormOpen && (
        <AddProductForm
          onClose={() => setIsAddFormOpen(false)}
          onSubmit={async (name, price, amount, unit, matchedProductId, matchedCategory) => {
            await addFavoriteProduct(name, price, amount, unit, matchedProductId, matchedCategory)
          }}
        />
      )}

      {editingProduct && (
        <EditFavoriteForm product={editingProduct} onClose={() => setEditingProduct(null)} />
      )}
    </div>
  )
}
