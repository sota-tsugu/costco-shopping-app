import { useEffect, useMemo, useState } from 'react'
import { Plus, Check, ChevronRight, Settings, ShoppingCart, X, Search, Minus, Trash2, Pencil, History } from 'lucide-react'
import {
  useTripStore,
  fetchLastCompletedTripProductNames,
  fetchLastCompletedTripTotal,
  type Product,
  type TripItem,
} from '../store/tripStore'
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
  const updateProduct = useTripStore((state) => state.updateProduct)
  const removeProduct = useTripStore((state) => state.removeProduct)
  const updateCartItemQuantity = useTripStore((state) => state.updateCartItemQuantity)
  const removeTripItem = useTripStore((state) => state.removeTripItem)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAddProductOpen, setIsAddProductOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [budgetInput, setBudgetInput] = useState('30000')
  const [isApplyingLastTrip, setIsApplyingLastTrip] = useState(false)
  const [lastTripCandidates, setLastTripCandidates] = useState<Product[] | null>(null)
  const [lastTripTotal, setLastTripTotal] = useState<number | null>(null)
  const [isPlanRecapOpen, setIsPlanRecapOpen] = useState(false)

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

  // 商品id→検討中のtripItem。数量の参照・変更に使う
  const consideringItemByProductId = useMemo(() => {
    const map = new Map<string, TripItem>()
    for (const item of tripItems) {
      if (item.status === 'considering' && item.productId) map.set(item.productId, item)
    }
    return map
  }, [tripItems])

  function isChecked(productId: string) {
    return consideringProductIds.has(productId)
  }

  // 計画中(planning)は、直近に完了した買い物の合計額を「前回の購入額」
  // として表示する(予算を決める際の目安になるように)。トリップが
  // 切り替わるたび(新しい買い物を始めるたび)に最新の値を取り直す
  useEffect(() => {
    if (!isPlanning) return
    void fetchLastCompletedTripTotal().then(setLastTripTotal)
  }, [isPlanning, currentTrip?.id])

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
      const item = consideringItemByProductId.get(p.id)
      if (!item) return sum
      return sum + (p.defaultPrice ?? 0) * item.quantity
    }, 0)
  }, [products, consideringItemByProductId])

  const cartTotal = useMemo(() => {
    return tripItems
      .filter((item) => item.status === 'inCart')
      .reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0)
  }, [tripItems])
  // 画面B(カート)の点数表示と揃えるため、行数ではなく数量の合計を数える
  // (以前は行数のみを数えていたため、同じ商品の数量を増やしても点数が
  // 変わらない不具合があった)
  const cartCount = tripItems
    .filter((item) => item.status === 'inCart')
    .reduce((sum, item) => sum + item.quantity, 0)

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

  // 「計画を見る」シートに表示する、計画由来(source: 'planned')の商品一覧。
  // 買い物中に削除した商品はtripItem自体が消えるため、この一覧には
  // 出てこなくなる(計画時点の完全な記録ではなく、簡易的な参考表示)
  const plannedItems = useMemo(() => tripItems.filter((item) => item.source === 'planned'), [tripItems])

  async function handleStartShopping() {
    await startShopping()
  }

  // 「前回買ったものを反映」:直近に完了した買い物トリップで実際に
  // 購入済みだった商品を候補として取得し、確認シートを開く。
  // (取捨選択してから反映する方式。一気に全部反映すると、前回だけの
  // 一回限りの商品まで交じってしまうため、確認のワンクッションを挟む)
  async function handleOpenApplyLastTrip() {
    setIsApplyingLastTrip(true)
    try {
      const productNames = await fetchLastCompletedTripProductNames()
      if (productNames.length === 0) {
        window.alert('前回の買い物履歴がまだありません。')
        return
      }
      // idではなく商品名で照合する(定番商品を削除して登録し直した場合も
      // 同じ名前であれば正しく反映できるようにするため)
      const candidates = products.filter((p) => productNames.includes(p.name))
      if (candidates.length === 0) {
        window.alert('前回購入した商品が、現在の定番商品リストに見つかりませんでした。')
        return
      }
      setLastTripCandidates(candidates)
    } finally {
      setIsApplyingLastTrip(false)
    }
  }

  return (
    <div className={`min-h-screen bg-slate-50 ${isPlanning && products.length > 0 ? 'pb-28' : 'pb-8'}`}>
      <header className="bg-costco-blue-700 px-4 pb-4 pt-4 text-white shadow-md">
        <TricolorAccent />
        <div className="mt-3 flex items-center justify-between">
          <h1 className="text-base font-semibold">今回買うものリスト</h1>
          <div className="flex items-center gap-1">
            {/* 計画中は空っぽ(薄い色・バッジ無し)、買い物中は商品が入り
                始めたことが分かるよう白色+件数バッジで表す。カートの
                イラストそのものは画面Bの役割と重複するため、既存の
                ShoppingCartアイコンの見た目だけを変える軽いタッチにしている */}
            <div className="relative mr-1">
              <ShoppingCart className={`h-5 w-5 ${isActive ? 'text-white' : 'text-costco-blue-300'}`} />
              {isActive && cartCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-costco-red-600 px-1 text-[10px] font-bold leading-none text-white">
                  {cartCount}
                </span>
              )}
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
              aria-label="設定"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isPlanning && (
          <div className="mt-3">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-xs text-costco-blue-100">見込み合計</span>
                <div className="text-2xl font-semibold tracking-tight">¥{estimatedTotal.toLocaleString()}</div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-costco-blue-100">予算</span>
                <label className="flex items-center gap-1 text-xl font-semibold">
                  ¥
                  <input
                    type="number"
                    inputMode="numeric"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    onBlur={handleBudgetBlur}
                    className="w-24 border-b border-costco-blue-300 bg-transparent text-right text-xl font-semibold text-white focus:outline-none"
                  />
                </label>
              </div>
            </div>
            {lastTripTotal !== null && (
              <p className="mt-1 text-right text-xs text-costco-blue-100">
                前回の購入額 ¥{lastTripTotal.toLocaleString()}
              </p>
            )}
          </div>
        )}

        {isActive && (
          <div className="mt-3">
            <button
              onClick={onOpenCart}
              className="flex w-full items-center justify-between rounded-xl bg-costco-blue-600 px-3 py-2 transition-colors active:bg-costco-blue-800"
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
            {currentTrip && (
              <button
                onClick={() => setIsPlanRecapOpen(true)}
                className="mt-1.5 flex w-full items-center justify-between px-1 text-xs text-costco-blue-100 active:text-white"
              >
                <span>予算 ¥{currentTrip.budget.toLocaleString()}</span>
                <span className="underline underline-offset-2">計画を見る</span>
              </button>
            )}
          </div>
        )}
      </header>

      <main key={isActive ? 'active' : 'planning'} className="screen-fade-in mx-auto max-w-md px-4 py-4">
        {isPlanning && products.length > 0 && (
          <button
            onClick={handleOpenApplyLastTrip}
            disabled={isApplyingLastTrip}
            className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-costco-blue-200 bg-white py-2.5 text-sm font-medium text-costco-blue-700 shadow-sm disabled:opacity-50"
          >
            <History className="h-4 w-4" />
            {isApplyingLastTrip ? '確認中…' : '前回買ったものを反映'}
          </button>
        )}

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
                  const consideringItem = consideringItemByProductId.get(product.id)
                  const quantity = consideringItem?.quantity ?? 1
                  return (
                    <li
                      key={product.id}
                      className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm"
                    >
                      <button
                        onClick={() => handleToggle(product)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                          checked ? 'border-costco-red-600 bg-costco-red-600' : 'border-slate-300'
                        }`}
                        aria-label="今回買うものリストに入れる/外す"
                      >
                        {checked && <Check className="h-3.5 w-3.5 text-white" />}
                      </button>
                      <button
                        onClick={() => setEditingProduct(product)}
                        className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm"
                      >
                        <span
                          className={`truncate underline decoration-slate-300 underline-offset-2 ${
                            checked ? 'text-slate-800' : 'text-slate-400 line-through'
                          }`}
                        >
                          {product.name}
                        </span>
                        <Pencil className="h-3 w-3 shrink-0 text-slate-300" />
                      </button>
                      {checked && consideringItem && (
                        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                          <button
                            onClick={() => updateCartItemQuantity(consideringItem.id, quantity - 1)}
                            className="rounded bg-white p-1 shadow-sm active:bg-slate-200"
                            aria-label="数量を減らす"
                          >
                            <Minus className="h-3.5 w-3.5 text-slate-700" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold text-slate-800">{quantity}</span>
                          <button
                            onClick={() => updateCartItemQuantity(consideringItem.id, quantity + 1)}
                            className="rounded bg-white p-1 shadow-sm active:bg-slate-200"
                            aria-label="数量を増やす"
                          >
                            <Plus className="h-3.5 w-3.5 text-slate-700" />
                          </button>
                        </div>
                      )}
                      <span className="shrink-0 text-xs text-slate-400">
                        ¥{((product.defaultPrice ?? 0) * (checked ? quantity : 1)).toLocaleString()}
                      </span>
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
                      <>
                        <button
                          onClick={() => addToCart(item.id)}
                          className="flex shrink-0 items-center gap-1 rounded-lg bg-costco-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors active:bg-costco-red-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          カートに入れる
                        </button>
                        <button
                          onClick={() => removeTripItem(item.id)}
                          className="shrink-0 p-1 text-slate-300 active:text-red-500"
                          aria-label="今回買うものリストから外す"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                          <button
                            onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}
                            className="rounded bg-white p-1 shadow-sm active:bg-slate-200"
                            aria-label="数量を減らす"
                          >
                            <Minus className="h-3.5 w-3.5 text-slate-700" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold text-slate-800">{item.quantity}</span>
                          <button
                            onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}
                            className="rounded bg-white p-1 shadow-sm active:bg-slate-200"
                            aria-label="数量を増やす"
                          >
                            <Plus className="h-3.5 w-3.5 text-slate-700" />
                          </button>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">
                          ¥{((item.price ?? 0) * item.quantity).toLocaleString()}
                        </span>
                        <button
                          onClick={() => removeTripItem(item.id)}
                          className="shrink-0 p-1 text-slate-300 active:text-red-500"
                          aria-label="カートから外す"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
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
            const newProduct = await addProduct(name, category, price, amount, unit)
            // 登録した商品は、その場で今回買うものリストにも含める(チェック済みに
            // する)。登録直後に「除外されている」ような見た目(取り消し線)に
            // なってしまうのを防ぐため
            await togglePlannedProduct(newProduct, true)
            setIsAddProductOpen(false)
          }}
        />
      )}

      {editingProduct && (
        <EditProductSheet
          product={editingProduct}
          existingProducts={products}
          onClose={() => setEditingProduct(null)}
          onSubmit={async (name, category, price, amount, unit) => {
            await updateProduct(editingProduct.id, { name, category, price, amount, unit })
            setEditingProduct(null)
          }}
          onDelete={async () => {
            await removeProduct(editingProduct.id)
            setEditingProduct(null)
          }}
        />
      )}

      {lastTripCandidates && (
        <ApplyLastTripSheet
          candidates={lastTripCandidates}
          onClose={() => setLastTripCandidates(null)}
          onSubmit={async (selected) => {
            // 追加方式:選ばれた商品のうち、まだチェックしていないものだけ
            // チェックする(すでにチェック済みの他の商品には影響しない)
            for (const product of selected) {
              if (!isChecked(product.id)) {
                await togglePlannedProduct(product, true)
              }
            }
            setLastTripCandidates(null)
          }}
        />
      )}

      {isPlanRecapOpen && currentTrip && (
        <PlanRecapSheet budget={currentTrip.budget} items={plannedItems} onClose={() => setIsPlanRecapOpen(false)} />
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

type EditProductSheetProps = {
  product: Product
  existingProducts: Product[]
  onClose: () => void
  onSubmit: (
    name: string,
    category: string | null,
    price: number | null,
    amount: number | null,
    unit: string | null,
  ) => Promise<void>
  onDelete: () => Promise<void>
}

/** 定番商品リストの1件を編集・削除するシート。AddProductSheetと似た作りだが、
 * 値がすでに入っている状態で開き、削除ボタンも持つ */
function EditProductSheet({ product, existingProducts, onClose, onSubmit, onDelete }: EditProductSheetProps) {
  const [name, setName] = useState(product.name)
  const [category, setCategory] = useState(product.category ?? '')
  const [price, setPrice] = useState(product.defaultPrice !== null ? String(product.defaultPrice) : '')
  const [amount, setAmount] = useState(product.defaultAmount !== null ? String(product.defaultAmount) : '')
  const [unit, setUnit] = useState(product.defaultUnit ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of existingProducts) {
      if (p.category) set.add(p.category)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [existingProducts])

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

  async function handleDelete() {
    const confirmed = window.confirm(
      `「${product.name}」を定番商品リストから完全に削除しますか?(元に戻せません)`,
    )
    if (!confirmed) return
    setIsDeleting(true)
    try {
      await onDelete()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
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

        <label className="mb-1 block text-xs font-medium text-slate-500">カテゴリ(任意)</label>
        <input
          type="text"
          list="edit-category-options"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="例:日用品"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />
        <datalist id="edit-category-options">
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
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-costco-blue-700 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-blue-800 disabled:opacity-50"
        >
          保存する
        </button>

        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          定番商品リストから削除する
        </button>
      </div>
    </div>
  )
}

type ApplyLastTripSheetProps = {
  /** 前回の買い物で購入済みだった、定番商品リスト上の商品(候補) */
  candidates: Product[]
  onClose: () => void
  onSubmit: (selected: Product[]) => Promise<void>
}

/** 「前回買ったものを反映」の確認シート。
 * 前回購入した商品を一覧表示し、デフォルトで全てチェック済みにしておく。
 * 今回は不要なものだけチェックを外してから反映できるようにすることで、
 * 一回限りの商品(誕生日ケーキなど)を毎回間違って含めてしまうのを防ぐ */
function ApplyLastTripSheet({ candidates, onClose, onSubmit }: ApplyLastTripSheetProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(candidates.map((p) => p.id)))
  const [isSaving, setIsSaving] = useState(false)

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (selectedIds.size === 0) return
    setIsSaving(true)
    try {
      await onSubmit(candidates.filter((p) => selectedIds.has(p.id)))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">前回買ったものを反映</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-400">今回は不要なものはチェックを外してください。</p>

        <ul className="mb-4 flex-1 space-y-1.5 overflow-y-auto">
          {candidates.map((product) => {
            const checked = selectedIds.has(product.id)
            return (
              <li key={product.id}>
                <button
                  onClick={() => toggle(product.id)}
                  className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-left"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                      checked ? 'border-costco-red-600 bg-costco-red-600' : 'border-slate-300'
                    }`}
                  >
                    {checked && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                  <span className={`flex-1 truncate text-sm ${checked ? 'text-slate-800' : 'text-slate-400'}`}>
                    {product.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">¥{(product.defaultPrice ?? 0).toLocaleString()}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <button
          onClick={handleSubmit}
          disabled={isSaving || selectedIds.size === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
        >
          {selectedIds.size}件を反映する
        </button>
      </div>
    </div>
  )
}

type PlanRecapSheetProps = {
  budget: number
  /** 計画由来(source: 'planned')のtripItem。買い物中に削除した商品は
   * データごと消えているため出てこない(簡易的な参考表示) */
  items: TripItem[]
  onClose: () => void
}

/** 買い物中に、計画時点の内容(予算・選んでいた商品)を振り返るための
 * 読み取り専用シート。買い物中の画面のヘッダーにある「計画を見る」から開く。
 * リストを常時長くしないよう、必要な時だけタップして確認する形にしている */
function PlanRecapSheet({ budget, items, onClose }: PlanRecapSheetProps) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">計画を見る</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-400">買い物前に決めた予算と、選んでいた商品です。</p>

        <div className="mb-4 rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="text-xs text-slate-500">予算</span>
          <div className="text-xl font-semibold text-slate-800">¥{budget.toLocaleString()}</div>
        </div>

        {items.length === 0 ? (
          <p className="mb-2 text-sm text-slate-400">計画時に選んでいた商品はありません。</p>
        ) : (
          <ul className="mb-2 flex-1 space-y-1.5 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-slate-700">{item.productName}</span>
                <span className="shrink-0 text-xs text-slate-400">数量 {item.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
