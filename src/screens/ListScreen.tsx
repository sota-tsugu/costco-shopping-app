import { useEffect, useMemo, useState } from 'react'
import { Plus, Check, ChevronRight, Settings, ShoppingCart, X, Search } from 'lucide-react'
import { useTripStore, type Product, type TripItem } from '../store/tripStore'
import { SettingsModal } from './SettingsModal'
import { TricolorAccent } from '../components/TricolorAccent'
import { PRODUCT_CATALOG } from '../data/productCatalog'

// 画面A:今回買うものリスト画面。
// 買い物前の計画(定番商品リストから選ぶ・予算設定)から、店内での進行管理
// (検討中→会計待ち→購入済の状態表示)まで、一貫して担う中心画面。
//
// 【フェーズ1(最小実装)の割り切り】
// - 「カートに入れる」時の演出(飛んでいくアニメーション等)はフェーズ3で
//   追加する。今回は状態がその場で切り替わるだけのシンプルな実装
// - 商品名タップでの購入履歴・単価比較の詳細画面は、購入データが
//   貯まってから作る画面Cとあわせて後日追加する

const OTHER_CATEGORY = 'その他'

type Props = {
  /** カート画面(画面B)へ移動する時に呼ぶ */
  onOpenCart: () => void
}

export function ListScreen({ onOpenCart }: Props) {
  const products = useTripStore((state) => state.products)
  const currentTrip = useTripStore((state) => state.currentTrip)
  const tripItems = useTripStore((state) => state.tripItems)
  const addProduct = useTripStore((state) => state.addProduct)
  const ensurePlanningTrip = useTripStore((state) => state.ensurePlanningTrip)
  const updateTripBudget = useTripStore((state) => state.updateTripBudget)
  const togglePlannedProduct = useTripStore((state) => state.togglePlannedProduct)
  const startShopping = useTripStore((state) => state.startShopping)
  const addToCart = useTripStore((state) => state.addToCart)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAddProductOpen, setIsAddProductOpen] = useState(false)
  const [budgetInput, setBudgetInput] = useState('30000')

  // トリップが無ければ、初期予算3万円でplanningトリップを自動的に作る
  // (以前のアプリと同様、毎回同じようなものを買う前提で「まず一覧が
  // すぐ出る」体験を優先している)
  useEffect(() => {
    if (currentTrip === null) {
      void ensurePlanningTrip(Number(budgetInput) || 30000)
    } else {
      setBudgetInput(String(currentTrip.budget))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrip])

  const isPlanning = currentTrip?.status === 'planning'
  const isActive = currentTrip?.status === 'active'

  const consideringProductIds = useMemo(
    () => new Set(tripItems.filter((item) => item.status === 'considering').map((item) => item.productId)),
    [tripItems],
  )

  function isChecked(productId: string) {
    return consideringProductIds.has(productId)
  }

  async function handleToggle(product: Product) {
    await togglePlannedProduct(product, !isChecked(product.id))
  }

  function handleBudgetBlur() {
    const value = Number(budgetInput)
    if (Number.isFinite(value) && value > 0) {
      void updateTripBudget(value)
    }
  }

  const estimatedTotal = useMemo(() => {
    return products.reduce((sum, p) => {
      if (!isChecked(p.id)) return sum
      return sum + (p.defaultPrice ?? 0)
    }, 0)
  }, [products, consideringProductIds])

  const cartTotal = useMemo(() => {
    return tripItems
      .filter((item) => item.status === 'inCart')
      .reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0)
  }, [tripItems])
  const cartCount = tripItems.filter((item) => item.status === 'inCart').length

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, Product[]>()
    for (const product of products) {
      const category = product.category ?? OTHER_CATEGORY
      const list = groups.get(category)
      if (list) list.push(product)
      else groups.set(category, [product])
    }
    const names = [...groups.keys()].filter((n) => n !== OTHER_CATEGORY).sort((a, b) => a.localeCompare(b, 'ja'))
    if (groups.has(OTHER_CATEGORY)) names.push(OTHER_CATEGORY)
    return names.map((category) => ({ category, items: groups.get(category)! }))
  }, [products])

  const groupedTripItems = useMemo(() => {
    const groups = new Map<string, TripItem[]>()
    for (const item of tripItems) {
      const category = item.category ?? OTHER_CATEGORY
      const list = groups.get(category)
      if (list) list.push(item)
      else groups.set(category, [item])
    }
    const names = [...groups.keys()].filter((n) => n !== OTHER_CATEGORY).sort((a, b) => a.localeCompare(b, 'ja'))
    if (groups.has(OTHER_CATEGORY)) names.push(OTHER_CATEGORY)
    return names.map((category) => ({ category, items: groups.get(category)! }))
  }, [tripItems])

  async function handleStartShopping() {
    await startShopping()
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <header className="bg-costco-blue-700 px-4 pb-4 pt-4 text-white shadow-md">
        <TricolorAccent />
        <div className="mt-3 flex items-center justify-between">
          <h1 className="text-base font-semibold">
            {isActive ? '今回買うものリスト' : '今回買う予定を決める'}
          </h1>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
            aria-label="設定"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {isPlanning && (
          <div className="mt-3 flex items-end justify-between">
            <div>
              <span className="text-xs text-costco-blue-100">見込み合計</span>
              <div className="text-2xl font-semibold tracking-tight">¥{estimatedTotal.toLocaleString()}</div>
            </div>
            <label className="flex items-center gap-1 text-xs text-costco-blue-100">
              予算 ¥
              <input
                type="number"
                inputMode="numeric"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                onBlur={handleBudgetBlur}
                className="w-20 border-b border-costco-blue-300 bg-transparent text-right text-white focus:outline-none"
              />
            </label>
          </div>
        )}

        {isActive && (
          <button
            onClick={onOpenCart}
            className="mt-3 flex w-full items-center justify-between rounded-xl bg-costco-blue-600 px-3 py-2"
          >
            <span className="flex items-center gap-1.5 text-sm">
              <ShoppingCart className="h-4 w-4" />
              カート {cartCount}点
            </span>
            <span className="flex items-center gap-1 text-base font-semibold">
              ¥{cartTotal.toLocaleString()}
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        )}
      </header>

      <main className="mx-auto max-w-md px-4 py-4">
        {products.length === 0 && (
          <p className="mb-4 rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm">
            まだ定番商品が登録されていません。下の「商品を登録」から追加してください。
          </p>
        )}

        {isPlanning &&
          groupedProducts.map(({ category, items }) => (
            <section key={category} className="mb-4">
              <h2 className="mb-1.5 text-xs font-semibold text-slate-500">{category}</h2>
              <ul className="space-y-1.5">
                {items.map((product) => {
                  const checked = isChecked(product.id)
                  return (
                    <li key={product.id}>
                      <button
                        onClick={() => handleToggle(product)}
                        className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                            checked ? 'border-costco-red-600 bg-costco-red-600' : 'border-slate-300'
                          }`}
                        >
                          {checked && <Check className="h-3.5 w-3.5 text-white" />}
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate text-sm ${
                            checked ? 'text-slate-800' : 'text-slate-400 line-through'
                          }`}
                        >
                          {product.name}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          ¥{(product.defaultPrice ?? 0).toLocaleString()}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

        {isActive &&
          groupedTripItems.map(({ category, items }) => (
            <section key={category} className="mb-4">
              <h2 className="mb-1.5 text-xs font-semibold text-slate-500">{category}</h2>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-800">{item.productName}</div>
                      <span
                        className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          item.status === 'considering'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-costco-blue-50 text-costco-blue-700'
                        }`}
                      >
                        {item.status === 'considering' ? '検討中' : '会計待ち'}
                      </span>
                    </div>
                    {item.status === 'considering' ? (
                      <button
                        onClick={() => addToCart(item.id)}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-costco-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors active:bg-costco-red-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        カートに入れる
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-400">
                        ¥{((item.price ?? 0) * item.quantity).toLocaleString()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}

        <button
          onClick={() => setIsAddProductOpen(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-400 transition-colors active:border-costco-blue-300 active:text-costco-blue-500"
        >
          <Plus className="h-4 w-4" />
          商品を登録
        </button>
      </main>

      {isPlanning && products.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4">
          <button
            onClick={handleStartShopping}
            className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-4 text-lg font-semibold text-white shadow transition-colors active:bg-costco-red-700"
          >
            買い物を始める
          </button>
        </div>
      )}

      {isAddProductOpen && (
        <AddProductSheet
          existingProducts={products}
          onClose={() => setIsAddProductOpen(false)}
          onSubmit={async (name, category, price, amount, unit) => {
            await addProduct(name, category, price, amount, unit)
            setIsAddProductOpen(false)
          }}
        />
      )}

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </div>
  )
}

type AddProductSheetProps = {
  existingProducts: Product[]
  onClose: () => void
  onSubmit: (
    name: string,
    category: string | null,
    price: number | null,
    amount: number | null,
    unit: string | null,
  ) => Promise<void>
}

function AddProductSheet({ existingProducts, onClose, onSubmit }: AddProductSheetProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)

  // 商品名候補データベース(costcotuu.com由来・約3200件)から、商品名の
  // 入力補助を行う。名前を選ぶとカテゴリも一緒に入る。2文字以上で検索する
  const nameSuggestions = useMemo(() => {
    const trimmed = name.trim().toLowerCase()
    if (trimmed.length < 2) return []
    return PRODUCT_CATALOG.filter((entry) => entry.name.toLowerCase().includes(trimmed)).slice(0, 12)
  }, [name])

  // カテゴリの選択補助:候補データベースと、すでに登録済みの定番商品の
  // カテゴリをあわせて、入力候補(datalist)として出す(表記ゆれを防ぐため)
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const entry of PRODUCT_CATALOG) set.add(entry.category)
    for (const product of existingProducts) {
      if (product.category) set.add(product.category)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [existingProducts])

  function handlePickSuggestion(entry: { name: string; category: string }) {
    setName(entry.name)
    setCategory(entry.category)
    setIsSuggestionsOpen(false)
  }

  const canSubmit = name.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      await onSubmit(
        name.trim(),
        category.trim() !== '' ? category.trim() : null,
        Number(price) > 0 ? Number(price) : null,
        Number(amount) > 0 ? Number(amount) : null,
        unit.trim() !== '' ? unit.trim() : null,
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">定番商品を登録</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">商品名</label>
        <div className="relative mb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setIsSuggestionsOpen(true)
            }}
            onFocus={() => setIsSuggestionsOpen(true)}
            placeholder="例:トイレットペーパー"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />
          {isSuggestionsOpen && nameSuggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {nameSuggestions.map((entry, index) => (
                <li key={`${entry.name}-${index}`}>
                  <button
                    type="button"
                    onClick={() => handlePickSuggestion(entry)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    <span className="flex-1 truncate">{entry.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{entry.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">カテゴリ(任意)</label>
        <input
          type="text"
          list="category-options"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="例:日用品"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />
        <datalist id="category-options">
          {categoryOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <label className="mb-1 block text-xs font-medium text-slate-500">価格(円・任意)</label>
        <input
          type="number"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="例:1580"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">内容量(任意)</label>
        <div className="mb-6 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例:900"
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="g等"
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
        >
          登録する
        </button>
      </div>
    </div>
  )
}
