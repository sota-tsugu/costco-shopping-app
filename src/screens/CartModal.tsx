import { X, Plus, Minus, Trash2, ShoppingCart } from 'lucide-react'
import { useCartStore, calcTotal } from '../store/cartStore'

// 「今カートに何が入っているか」をまとめて確認できる画面。
//
// 【設計の背景】マイ定番棚のタイル一覧(ShoppingScreen)だけでも数量が
// 入っていればカート内と分かるが、定番棚の登録数が多いと、カートに
// 何が入っているかをタイルの海の中から探すのが大変になる。「カート」
// という単位そのものを1つのオブジェクトとして、その中身だけを見る・
// 直接操作できる画面を用意した(OOUI的な考え方: カートという対象に
// 対して、確認・数量調整・削除がここに集まっている)。

type Props = {
  onClose: () => void
}

export function CartModal({ onClose }: Props) {
  const cartItems = useCartStore((state) => state.cartItems)
  const incrementCartQuantity = useCartStore((state) => state.incrementCartQuantity)
  const decrementFromCart = useCartStore((state) => state.decrementFromCart)
  const removeCartItem = useCartStore((state) => state.removeCartItem)

  const items = Object.values(cartItems).sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  const total = calcTotal(cartItems)

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-costco-blue-600" />
            <h2 className="text-base font-bold text-slate-800">カートの中身</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            まだカートに何も入っていません。マイ定番棚の「追加」からカートに入れてください。
          </p>
        ) : (
          <>
            <ul className="mb-4 space-y-2">
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{item.name}</div>
                    <div className="text-xs text-slate-400">
                      ¥{item.price.toLocaleString()} × {item.quantity} = ¥
                      {(item.price * item.quantity).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1">
                    <button
                      onClick={() => decrementFromCart(item.productId)}
                      className="rounded-md bg-white p-1.5 shadow-sm active:bg-slate-200"
                      aria-label="数量を減らす"
                    >
                      <Minus className="h-3.5 w-3.5 text-slate-700" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold text-slate-800">{item.quantity}</span>
                    <button
                      onClick={() => incrementCartQuantity(item.productId)}
                      className="rounded-md bg-white p-1.5 shadow-sm active:bg-slate-200"
                      aria-label="数量を増やす"
                    >
                      <Plus className="h-3.5 w-3.5 text-slate-700" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeCartItem(item.productId)}
                    className="shrink-0 p-1.5 text-slate-300 active:text-red-500"
                    aria-label="カートから取り除く"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm font-medium text-slate-500">合計</span>
              <span className="text-xl font-bold text-slate-800">¥{total.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
