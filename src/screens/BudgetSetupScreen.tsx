import { useEffect, useState } from 'react'
import { ShoppingCart, Loader2, ClipboardList, Plus, X, Check } from 'lucide-react'
import { useCartStore } from '../store/cartStore'

// 買い物を始める前に、今回の予算と「今回買う予定のもの」を確認する画面。
// 企画書の方針により「予算は買い物1回ごと」に設定する形にしている。
//
// 【予定リストの設計】ほぼ毎回同じものを買う、という実際の使い方に
// 合わせて、マイ定番棚の商品を全部「買う予定」としてチェック済みで
// 表示し、不要なものだけチェックを外す方式にした(SOTAさんとの相談の
// 上で決定)。「前回の買い物をそのまま複製する」方式も検討したが、
// たまたま前回買わなかった定番品が次回以降も出てこなくなってしまう
//弱点があるため、常に「マイ定番棚」という確定した基準を使うこの方式
// を採用した。
//
// 定番棚にないイレギュラーな商品は、引き続き自由入力のメモ(事前リスト)
// で対応する。

export function BudgetSetupScreen() {
  const startTrip = useCartStore((state) => state.startTrip)
  const addToCart = useCartStore((state) => state.addToCart)
  const favorites = useCartStore((state) => state.favorites)
  const wishlist = useCartStore((state) => state.wishlist)
  const addWishlistItem = useCartStore((state) => state.addWishlistItem)
  const removeWishlistItem = useCartStore((state) => state.removeWishlistItem)

  const [budgetInput, setBudgetInput] = useState('30000')
  const [isStarting, setIsStarting] = useState(false)
  const [wishlistInput, setWishlistInput] = useState('')
  const [isAddingWishlistItem, setIsAddingWishlistItem] = useState(false)

  // 「今回買う予定」のチェック状態。初回に定番棚が読み込まれたタイミングで
  // 全部チェック済みにする(以降はユーザーの操作を優先し、上書きしない)。
  const [checkedIds, setCheckedIds] = useState<Set<number> | null>(null)
  useEffect(() => {
    if (checkedIds === null && favorites.length > 0) {
      setCheckedIds(new Set(favorites.map((p) => p.id)))
    }
  }, [favorites, checkedIds])

  function toggleChecked(productId: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev ?? favorites.map((p) => p.id))
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  async function handleStart() {
    const budget = Number(budgetInput)
    if (!Number.isFinite(budget) || budget <= 0) return

    setIsStarting(true)
    try {
      await startTrip(budget)
      // チェックの入っている定番棚の商品を、そのままカートに入れる
      const plannedProducts = favorites.filter((p) => checkedIds?.has(p.id) ?? true)
      for (const product of plannedProducts) {
        addToCart(product)
      }
    } finally {
      setIsStarting(false)
    }
  }

  async function handleAddWishlistItem() {
    if (wishlistInput.trim().length === 0) return
    setIsAddingWishlistItem(true)
    try {
      await addWishlistItem(wishlistInput)
      setWishlistInput('')
    } finally {
      setIsAddingWishlistItem(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <div className="mx-auto max-w-sm px-6 py-10">
        {/* 予算入力 */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-blue-100 p-4">
              <ShoppingCart className="h-8 w-8 text-blue-700" />
            </div>
          </div>

          <h1 className="mb-1 text-center text-lg font-bold text-slate-800">
            今回の予算を入力してください
          </h1>
          <p className="mb-6 text-center text-sm text-slate-500">
            レジでの会計完了までの目安予算です
          </p>

          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl font-bold text-slate-400">¥</span>
            <input
              type="number"
              inputMode="numeric"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              className="w-40 border-b-2 border-slate-300 text-center text-3xl font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {/* 今回買う予定(マイ定番棚のチェックリスト) */}
        {favorites.length > 0 && (
          <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-1 font-semibold text-slate-800">今回買う予定</h2>
            <p className="mb-4 text-xs text-slate-500">
              マイ定番棚は最初から全部チェック済みです。今回いらないものだけ外してください。
            </p>
            <ul className="space-y-2">
              {favorites.map((product) => {
                const checked = checkedIds?.has(product.id) ?? true
                return (
                  <li key={product.id}>
                    <button
                      onClick={() => toggleChecked(product.id)}
                      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                          checked ? 'border-blue-700 bg-blue-700' : 'border-slate-300'
                        }`}
                      >
                        {checked && <Check className="h-3.5 w-3.5 text-white" />}
                      </span>
                      <span className={`text-sm ${checked ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                        {product.name}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* 事前買い物予定リスト(定番棚にない、今回だけ欲しいもの) */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 flex items-center gap-1.5 font-semibold text-slate-800">
            <ClipboardList className="h-4 w-4 text-blue-700" />
            今回だけ買いたいもの(メモ)
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            定番棚にない特別なものを自由にメモできます。店内でタップしてカートに追加できます。
          </p>

          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={wishlistInput}
              onChange={(e) => setWishlistInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddWishlistItem()
              }}
              placeholder="例:トイペ"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
            />
            <button
              onClick={handleAddWishlistItem}
              disabled={isAddingWishlistItem || wishlistInput.trim().length === 0}
              className="flex items-center justify-center rounded-lg bg-blue-700 px-3 text-white disabled:opacity-40"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {wishlist.length === 0 ? (
            <p className="text-xs text-slate-400">まだメモがありません</p>
          ) : (
            <ul className="space-y-2">
              {wishlist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">{item.raw_name}</span>
                  <button
                    onClick={() => removeWishlistItem(item.id)}
                    className="text-slate-300"
                    aria-label="削除"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 下部固定:買い物を始めるボタン(ShoppingScreenと同じ配置に揃えている) */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4">
        <button
          onClick={handleStart}
          disabled={isStarting}
          className="mx-auto flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-4 text-lg font-bold text-white shadow disabled:opacity-50"
        >
          {isStarting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          買い物を始める
        </button>
      </div>
    </div>
  )
}
