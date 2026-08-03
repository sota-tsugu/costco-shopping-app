import { useRef, useState, type CSSProperties } from 'react'
import { Plus, Minus, PlusCircle, CheckCircle2, Check, ClipboardList, Settings, Pencil, ShoppingCart } from 'lucide-react'
import {
  useCartStore,
  calcTotal,
  calcUnitPriceLabel,
  getSuggestedCartDetails,
  type Product,
  type WishlistItem,
} from '../store/cartStore'
import { AddProductForm } from './AddProductForm'
import { ProductHistoryModal } from './ProductHistoryModal'
import { WishlistMatchModal } from './WishlistMatchModal'
import { SettingsModal } from './SettingsModal'
import { QuickAddModal } from './QuickAddModal'
import { CartModal } from './CartModal'
import { TricolorAccent } from '../components/TricolorAccent'
import cartIconImage from '../assets/cart-icon.jpg'

// 買い物中のメイン画面。
// UI/UXの4原則(企画書 6章)を意識したレイアウト:
//   1. 片手操作:主要ボタンは画面下部に集約、タイルは大きめのタップ領域
//   2. 視線移動の最小化:合計金額・予算進捗は画面上部に常時固定表示
//   3. 入力ゼロに近い操作:「追加」ワンタップで前回と同じ内容のままカートへ
//      (今回の価格・内容量が違う時だけ、鉛筆アイコンからQuickAddModalを
//      開いて入力し直す。毎回フォームを挟むと片手操作の速さが失われる
//      ため、「基本は一発タップ、必要な時だけ編集」という使い分けにした)
//   4. 誤操作からの回復:会計完了は確認ダイアログを挟む(フェーズ1-aでは
//      シンプルなconfirm()を使用。将来的にはUndo通知に置き換えてもよい)

export function ShoppingScreen() {
  const budget = useCartStore((state) => state.budget)
  const favorites = useCartStore((state) => state.favorites)
  const cartItems = useCartStore((state) => state.cartItems)
  const wishlist = useCartStore((state) => state.wishlist)
  const plannedProductIds = useCartStore((state) => state.plannedProductIds)
  const purchaseSummaryByProduct = useCartStore((state) => state.purchaseSummaryByProduct)
  const addToCartWithDetails = useCartStore((state) => state.addToCartWithDetails)
  const incrementCartQuantity = useCartStore((state) => state.incrementCartQuantity)
  const decrementFromCart = useCartStore((state) => state.decrementFromCart)
  const addFavoriteProduct = useCartStore((state) => state.addFavoriteProduct)
  const completeCheckout = useCartStore((state) => state.completeCheckout)
  const removeWishlistItem = useCartStore((state) => state.removeWishlistItem)
  const updateBudget = useCartStore((state) => state.updateBudget)

  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [matchingWishlistItem, setMatchingWishlistItem] = useState<WishlistItem | null>(null)
  const [prefillNameForNewProduct, setPrefillNameForNewProduct] = useState<string | null>(null)
  const [wishlistIdToResolve, setWishlistIdToResolve] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [quickAddProduct, setQuickAddProduct] = useState<Product | null>(null)

  // 予算を買い物中にその場で直せるようにする(現地で見積もりが変わった
  // 時に、買い物前の画面まで戻らなくても直接書き換えられるようにする)
  const [isEditingBudget, setIsEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')

  function startEditingBudget() {
    setBudgetInput(String(budget))
    setIsEditingBudget(true)
  }

  async function handleSaveBudget() {
    const newBudget = Number(budgetInput)
    if (!Number.isFinite(newBudget) || newBudget <= 0) return
    await updateBudget(newBudget)
    setIsEditingBudget(false)
  }

  // 「カートに入った」感を出す軽い演出。新しく商品をカートに追加した
  // 瞬間(タップ一発の追加、事前リストからの追加)だけ、タップした位置から
  // 合計金額に向かって小さいアイコンが飛んでいき、金額がポンと弾む。
  // 既にカートにある商品の数量を+1する操作(何十回もタップし得る)では
  // 出さないようにし、演出がしつこく感じられないようにしている。
  // CSSアニメーションの中身はsrc/index.cssを参照。
  const totalRef = useRef<HTMLSpanElement>(null)
  const [flyItems, setFlyItems] = useState<
    { id: number; startX: number; startY: number; dx: number; dy: number }[]
  >([])
  const [totalPopKey, setTotalPopKey] = useState(0)

  function triggerCartFlyAnimation(startEl: HTMLElement) {
    const totalEl = totalRef.current
    if (!totalEl) return
    const startRect = startEl.getBoundingClientRect()
    const endRect = totalEl.getBoundingClientRect()
    const startX = startRect.left + startRect.width / 2
    const startY = startRect.top + startRect.height / 2
    const dx = endRect.left + endRect.width / 2 - startX
    const dy = endRect.top + endRect.height / 2 - startY
    const id = Date.now() + Math.random()
    setFlyItems((prev) => [...prev, { id, startX, startY, dx, dy }])
    setTotalPopKey((k) => k + 1)
  }

  function removeFlyItem(id: number) {
    setFlyItems((prev) => prev.filter((item) => item.id !== id))
  }

  const total = calcTotal(cartItems)
  const progressRatio = budget > 0 ? Math.min(total / budget, 1) : 0
  const isOverBudget = total > budget
  const cartItemCount = Object.values(cartItems).reduce((sum, item) => sum + item.quantity, 0)

  /** 前回(なければ登録時)の価格・内容量・単位のまま、ワンタップでカートに追加する */
  function handleFastAdd(product: Product, startEl?: HTMLElement) {
    const suggested = getSuggestedCartDetails(product, purchaseSummaryByProduct[product.id])
    addToCartWithDetails(product, { ...suggested, quantity: 1 })
    if (startEl) triggerCartFlyAnimation(startEl)
  }

  function handleWishlistTap(item: WishlistItem, startEl: HTMLElement) {
    // 「トイペ」のような自由入力の名前と、定番棚の商品名が完全一致すれば
    // 自動で紐付けてカートに追加する。一致しなければ選択画面を開く。
    const normalizedRawName = item.raw_name.trim().toLowerCase()
    const matched = favorites.find((p) => p.name.trim().toLowerCase() === normalizedRawName)

    if (matched) {
      handleFastAdd(matched, startEl)
      void removeWishlistItem(item.id)
    } else {
      setMatchingWishlistItem(item)
    }
  }

  async function handleCheckout() {
    const confirmed = window.confirm(
      `会計を完了しますか?\n合計金額: ¥${total.toLocaleString()}`,
    )
    if (!confirmed) return

    setIsCheckingOut(true)
    try {
      await completeCheckout()
    } finally {
      setIsCheckingOut(false)
    }
  }

  function handleCloseAddForm() {
    setIsAddFormOpen(false)
    setPrefillNameForNewProduct(null)
    setWishlistIdToResolve(null)
  }

  async function handleAddProductSubmit(
    name: string,
    price: number,
    amount: number | null,
    unit: string | null,
    matchedProductId?: string | null,
    matchedCategory?: string | null,
  ) {
    const savedProduct = await addFavoriteProduct(name, price, amount, unit, matchedProductId, matchedCategory)
    // 事前リストの「新しい商品として登録する」経由の場合は、
    // 今入力したばかりの価格・内容量でそのままカートへ追加する
    if (wishlistIdToResolve !== null) {
      addToCartWithDetails(savedProduct, { price, amount, unit, quantity: 1 })
      void removeWishlistItem(wishlistIdToResolve)
      setWishlistIdToResolve(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* 上部固定:合計金額・予算進捗(視線移動の最小化) */}
      <header className="sticky top-0 z-10 bg-costco-blue-700 px-4 pb-4 pt-4 text-white shadow-md">
        <TricolorAccent />
        <div className="mb-1 mt-3 flex items-center justify-end gap-1">
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
            aria-label="カートの中身を見る"
          >
            <ShoppingCart className="h-5 w-5" />
            {cartItemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-costco-red-600 px-1 text-[10px] font-bold text-white">
                {cartItemCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
            aria-label="設定"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-sm text-costco-blue-100">合計金額</span>
          <span key={totalPopKey} ref={totalRef} className="total-pop text-3xl font-semibold tracking-tight">
            ¥{total.toLocaleString()}
          </span>
        </div>

        <div className="mt-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/20">
            <div
              className={`h-full rounded-full transition-all ${
                isOverBudget ? 'bg-costco-red-400' : 'bg-white'
              }`}
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-costco-blue-100">
            {isEditingBudget ? (
              <span className="flex items-center gap-1">
                予算 ¥
                <input
                  type="number"
                  inputMode="numeric"
                  autoFocus
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveBudget()
                    if (e.key === 'Escape') setIsEditingBudget(false)
                  }}
                  className="w-16 border-b border-white bg-transparent text-white focus:outline-none"
                />
                <button onClick={handleSaveBudget} className="ml-1 rounded bg-white/20 px-1.5 py-0.5">
                  <Check className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <button onClick={startEditingBudget} className="flex items-center gap-1">
                予算 ¥{budget.toLocaleString()}
                <Pencil className="h-3 w-3 text-costco-blue-200" />
              </button>
            )}
            {isOverBudget && <span className="font-semibold text-costco-red-200">予算オーバー</span>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md p-4">
        {/* 事前買い物予定リスト(自宅で入力したものを、ここでタップして紐付ける) */}
        {wishlist.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-slate-800">
              <ClipboardList className="h-4 w-4 text-costco-blue-600" />
              事前リストから追加
            </h2>
            <ul className="space-y-2">
              {wishlist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm"
                >
                  <button
                    onClick={(e) => handleWishlistTap(item, e.currentTarget)}
                    className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-slate-800"
                  >
                    <Plus className="h-4 w-4 shrink-0 text-costco-red-600" />
                    {item.raw_name}
                  </button>
                  <button
                    onClick={() => removeWishlistItem(item.id)}
                    className="shrink-0 px-1 text-xs text-slate-300"
                    aria-label="リストから削除"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* マイ定番棚 */}
        <h2 className="mb-3 font-semibold text-slate-800">マイ定番棚</h2>

        {favorites.length === 0 && (
          <p className="mb-4 rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm">
            まだ商品が登録されていません。下の「商品を追加」から登録してください。
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {favorites.map((product) => {
            const cartItem = cartItems[product.id]
            const quantity = cartItem?.quantity ?? 0
            const summary = purchaseSummaryByProduct[product.id]
            // マイ定番棚に表示する価格・単価は、直近の購入実績があれば
            // それを優先する(=「マイ定番棚の価格は直近の購入価格」という
            // 方針)。まだ一度も買っていない商品は登録時の値を使う。
            const suggested = getSuggestedCartDetails(product, summary)
            const suggestedUnitPriceLabel = calcUnitPriceLabel({
              ...product,
              default_price: suggested.price,
              amount: suggested.amount,
              unit: suggested.unit,
            })
            const isPlannedButNotInCart = quantity === 0 && plannedProductIds.includes(product.id)

            return (
              <div
                key={product.id}
                className={`relative flex flex-col rounded-xl bg-white p-3 shadow-sm ${
                  isPlannedButNotInCart ? 'ring-2 ring-costco-red-200' : ''
                }`}
              >
                {isPlannedButNotInCart && (
                  <span className="absolute -top-2 right-2 rounded-full bg-costco-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    未購入
                  </span>
                )}
                <button
                  onClick={() => setHistoryProduct(product)}
                  className="mb-1 line-clamp-2 text-left text-sm font-medium text-slate-800 underline decoration-slate-300 underline-offset-2"
                >
                  {product.name}
                </button>
                <div className="mb-3 flex items-center gap-1">
                  <span className="text-sm font-semibold text-slate-800">
                    ¥{suggested.price.toLocaleString()}
                  </span>
                  {summary && <span className="text-[10px] text-slate-400">(前回)</span>}
                  {suggestedUnitPriceLabel && (
                    <span className="ml-auto text-xs font-medium text-costco-blue-600">
                      {suggestedUnitPriceLabel}
                    </span>
                  )}
                </div>

                {quantity === 0 ? (
                  <div className="mt-auto flex gap-1.5">
                    <button
                      onClick={(e) => handleFastAdd(product, e.currentTarget)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-costco-red-600 py-2 text-sm font-semibold text-white transition-colors active:bg-costco-red-700"
                    >
                      <Plus className="h-4 w-4" />
                      追加
                    </button>
                    <button
                      onClick={() => setQuickAddProduct(product)}
                      className="flex items-center justify-center rounded-lg border border-slate-200 px-2.5 text-slate-500 active:bg-slate-100"
                      aria-label="価格・内容量を入力してから追加"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-auto flex items-center justify-between rounded-lg bg-slate-100 p-1">
                    <button
                      onClick={() => decrementFromCart(product.id)}
                      className="rounded-md bg-white p-2 shadow-sm active:bg-slate-200"
                    >
                      <Minus className="h-4 w-4 text-slate-700" />
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-bold text-slate-800">
                      {quantity}
                    </span>
                    <button
                      onClick={() => incrementCartQuantity(product.id)}
                      className="rounded-md bg-white p-2 shadow-sm active:bg-slate-200"
                    >
                      <Plus className="h-4 w-4 text-slate-700" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          <button
            onClick={() => setIsAddFormOpen(true)}
            className="flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition-colors active:border-costco-blue-300 active:text-costco-blue-500"
          >
            <PlusCircle className="h-6 w-6" />
            <span className="text-sm">商品を追加</span>
          </button>
        </div>
      </main>

      {/* 下部固定:主要ボタン(片手操作しやすい位置) */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4">
        <button
          onClick={handleCheckout}
          disabled={cartItemCount === 0 || isCheckingOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-4 text-lg font-semibold text-white shadow transition-colors active:bg-green-700 disabled:opacity-40"
        >
          <CheckCircle2 className="h-5 w-5" />
          会計を完了する
        </button>
      </div>

      {isAddFormOpen && (
        <AddProductForm
          onClose={handleCloseAddForm}
          onSubmit={handleAddProductSubmit}
          initialName={prefillNameForNewProduct ?? undefined}
        />
      )}

      {historyProduct && (
        <ProductHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />
      )}

      {isCartOpen && <CartModal onClose={() => setIsCartOpen(false)} />}

      {quickAddProduct && (
        <QuickAddModal
          product={quickAddProduct}
          summary={purchaseSummaryByProduct[quickAddProduct.id]}
          onClose={() => setQuickAddProduct(null)}
          onConfirm={(details) => {
            addToCartWithDetails(quickAddProduct, details)
            setQuickAddProduct(null)
          }}
        />
      )}

      {matchingWishlistItem && (
        <WishlistMatchModal
          wishlistItem={matchingWishlistItem}
          favorites={favorites}
          onClose={() => setMatchingWishlistItem(null)}
          onPickExisting={(product) => {
            handleFastAdd(product)
            void removeWishlistItem(matchingWishlistItem.id)
            setMatchingWishlistItem(null)
          }}
          onCreateNew={() => {
            setPrefillNameForNewProduct(matchingWishlistItem.raw_name)
            setWishlistIdToResolve(matchingWishlistItem.id)
            setMatchingWishlistItem(null)
            setIsAddFormOpen(true)
          }}
        />
      )}

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}

      {/* カート追加の演出用アイコン(見た目のみ・操作には反応しない) */}
      {flyItems.map((item) => (
        <div
          key={item.id}
          className="fly-to-cart"
          style={
            {
              '--start-x': `${item.startX}px`,
              '--start-y': `${item.startY}px`,
              '--dx': `${item.dx}px`,
              '--dy': `${item.dy}px`,
            } as CSSProperties
          }
          onAnimationEnd={() => removeFlyItem(item.id)}
        >
          {/* カートイメージ画像(SOTAさん提供)を丸い白バッジに乗せて表示。
              画像自体は白背景のjpgなので、どんな背景色の上でも浮いて
              見えないよう、あえて白い円で囲んでいる */}
          <div className="rounded-full bg-white p-1 shadow-md">
            <img src={cartIconImage} alt="" className="h-6 w-6 object-contain" />
          </div>
        </div>
      ))}
    </div>
  )
}
