import { useState } from 'react'
import { Plus, Minus, PlusCircle, CheckCircle2, ClipboardList, Settings } from 'lucide-react'
import { useCartStore, calcTotal, calcUnitPriceLabel, type Product, type WishlistItem } from '../store/cartStore'
import { AddProductForm } from './AddProductForm'
import { ProductHistoryModal } from './ProductHistoryModal'
import { WishlistMatchModal } from './WishlistMatchModal'
import { SettingsModal } from './SettingsModal'

// 買い物中のメイン画面。
// UI/UXの4原則(企画書 6章)を意識したレイアウト:
//   1. 片手操作:主要ボタンは画面下部に集約、タイルは大きめのタップ領域
//   2. 視線移動の最小化:合計金額・予算進捗は画面上部に常時固定表示
//   3. 入力ゼロに近い操作:定番棚をタップするだけでカートに追加
//   4. 誤操作からの回復:会計完了は確認ダイアログを挟む(フェーズ1-aでは
//      シンプルなconfirm()を使用。将来的にはUndo通知に置き換えてもよい)

export function ShoppingScreen() {
  const budget = useCartStore((state) => state.budget)
  const favorites = useCartStore((state) => state.favorites)
  const cartItems = useCartStore((state) => state.cartItems)
  const wishlist = useCartStore((state) => state.wishlist)
  const addToCart = useCartStore((state) => state.addToCart)
  const decrementFromCart = useCartStore((state) => state.decrementFromCart)
  const addFavoriteProduct = useCartStore((state) => state.addFavoriteProduct)
  const completeCheckout = useCartStore((state) => state.completeCheckout)
  const resolveWishlistItem = useCartStore((state) => state.resolveWishlistItem)
  const removeWishlistItem = useCartStore((state) => state.removeWishlistItem)

  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [matchingWishlistItem, setMatchingWishlistItem] = useState<WishlistItem | null>(null)
  const [prefillNameForNewProduct, setPrefillNameForNewProduct] = useState<string | null>(null)
  const [wishlistIdToResolve, setWishlistIdToResolve] = useState<number | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const total = calcTotal(cartItems)
  const progressRatio = budget > 0 ? Math.min(total / budget, 1) : 0
  const isOverBudget = total > budget
  const cartItemCount = Object.values(cartItems).reduce((sum, item) => sum + item.quantity, 0)

  function handleWishlistTap(item: WishlistItem) {
    // 「トイペ」のような自由入力の名前と、定番棚の商品名が完全一致すれば
    // 自動で紐付けてカートに追加する。一致しなければ選択画面を開く。
    const normalizedRawName = item.raw_name.trim().toLowerCase()
    const matched = favorites.find((p) => p.name.trim().toLowerCase() === normalizedRawName)

    if (matched) {
      resolveWishlistItem(item.id, matched)
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
    matchedProductId?: number | null,
  ) {
    await addFavoriteProduct(name, price, amount, unit, matchedProductId)
    // 事前リストの「新しい商品として登録する」経由の場合は、
    // 今できたばかりの商品(favoritesの先頭に追加される)をそのままカートへ
    if (wishlistIdToResolve !== null) {
      const newest = useCartStore.getState().favorites[0]
      if (newest) {
        resolveWishlistItem(wishlistIdToResolve, newest)
      }
      setWishlistIdToResolve(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* 上部固定:合計金額・予算進捗(視線移動の最小化) */}
      <header className="sticky top-0 z-10 bg-blue-800 px-4 pb-4 pt-5 text-white shadow">
        <div className="mb-1 flex items-center justify-end">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-full p-1 text-blue-200 hover:bg-blue-700"
            aria-label="設定"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-sm text-blue-100">合計金額</span>
          <span className="text-3xl font-bold">¥{total.toLocaleString()}</span>
        </div>

        <div className="mt-3">
          <div className="h-3 w-full overflow-hidden rounded-full bg-blue-900/50">
            <div
              className={`h-full rounded-full transition-all ${
                isOverBudget ? 'bg-red-400' : 'bg-white'
              }`}
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-blue-100">
            <span>予算 ¥{budget.toLocaleString()}</span>
            {isOverBudget && <span className="font-bold text-red-200">予算オーバー</span>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md p-4">
        {/* 事前買い物予定リスト(自宅で入力したものを、ここでタップして紐付ける) */}
        {wishlist.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-slate-800">
              <ClipboardList className="h-4 w-4 text-blue-700" />
              事前リストから追加
            </h2>
            <ul className="space-y-2">
              {wishlist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm"
                >
                  <button
                    onClick={() => handleWishlistTap(item)}
                    className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-slate-800"
                  >
                    <Plus className="h-4 w-4 shrink-0 text-blue-700" />
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

            return (
              <div
                key={product.id}
                className="flex flex-col rounded-xl bg-white p-3 shadow-sm"
              >
                <button
                  onClick={() => setHistoryProduct(product)}
                  className="mb-1 line-clamp-2 text-left text-sm font-medium text-slate-800 underline decoration-slate-300 underline-offset-2"
                >
                  {product.name}
                </button>
                <span className="text-xs text-slate-400">
                  ¥{(product.default_price ?? 0).toLocaleString()}
                </span>
                <span className="mb-3 text-xs text-blue-700">
                  {calcUnitPriceLabel(product) ?? ' '}
                </span>

                {quantity === 0 ? (
                  <button
                    onClick={() => addToCart(product)}
                    className="mt-auto flex items-center justify-center gap-1 rounded-lg bg-blue-700 py-2 text-sm font-bold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    追加
                  </button>
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
                      onClick={() => addToCart(product)}
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
            className="flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400"
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
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-4 text-lg font-bold text-white shadow disabled:opacity-40"
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

      {matchingWishlistItem && (
        <WishlistMatchModal
          wishlistItem={matchingWishlistItem}
          favorites={favorites}
          onClose={() => setMatchingWishlistItem(null)}
          onPickExisting={(product) => {
            resolveWishlistItem(matchingWishlistItem.id, product)
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
    </div>
  )
}
