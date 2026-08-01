import { useState } from 'react'
import { ShoppingCart, Loader2, ClipboardList, Plus, X } from 'lucide-react'
import { useCartStore } from '../store/cartStore'

// 買い物を始める前に、今回の予算を入力する画面。
// 企画書の方針により「予算は買い物1回ごと」に設定する形にしている。
// (会計完了のたびにリセットされ、次のコストコ来店時にまた入力する)
//
// あわせて、自宅で気づいた「買うもの」を自由入力でメモできる
// 事前買い物予定リストもここに置いている。正式な商品登録(価格入力など)
// は不要で、「トイペ」のような仮の名前でOK。店内でカートに追加する
// タイミングで、マイ定番棚の商品と紐付ける(ShoppingScreen側で行う)。

export function BudgetSetupScreen() {
  const startTrip = useCartStore((state) => state.startTrip)
  const wishlist = useCartStore((state) => state.wishlist)
  const addWishlistItem = useCartStore((state) => state.addWishlistItem)
  const removeWishlistItem = useCartStore((state) => state.removeWishlistItem)

  const [budgetInput, setBudgetInput] = useState('30000')
  const [isStarting, setIsStarting] = useState(false)
  const [wishlistInput, setWishlistInput] = useState('')
  const [isAddingWishlistItem, setIsAddingWishlistItem] = useState(false)

  async function handleStart() {
    const budget = Number(budgetInput)
    if (!Number.isFinite(budget) || budget <= 0) return

    setIsStarting(true)
    try {
      await startTrip(budget)
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
    <div className="flex min-h-screen flex-col items-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
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

        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="text-2xl font-bold text-slate-400">¥</span>
          <input
            type="number"
            inputMode="numeric"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            className="w-40 border-b-2 border-slate-300 text-center text-3xl font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <button
          onClick={handleStart}
          disabled={isStarting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-4 text-lg font-bold text-white shadow disabled:opacity-50"
        >
          {isStarting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          買い物を始める
        </button>
      </div>

      {/* 事前買い物予定リスト */}
      <div className="mt-6 w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 flex items-center gap-1.5 font-semibold text-slate-800">
          <ClipboardList className="h-4 w-4 text-blue-700" />
          次回の買い物リスト(メモ)
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          思いついたものを気軽にメモ。店内でタップしてカートに追加できます。
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
  )
}
