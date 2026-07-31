import { useState } from 'react'
import { ShoppingCart, Loader2 } from 'lucide-react'
import { useCartStore } from '../store/cartStore'

// 買い物を始める前に、今回の予算を入力する画面。
// 企画書の方針により「予算は買い物1回ごと」に設定する形にしている。
// (会計完了のたびにリセットされ、次のコストコ来店時にまた入力する)

export function BudgetSetupScreen() {
  const startTrip = useCartStore((state) => state.startTrip)
  const [budgetInput, setBudgetInput] = useState('30000')
  const [isStarting, setIsStarting] = useState(false)

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
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
    </div>
  )
}
