import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Camera, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useTripStore, fetchLastCompletedTripTotal } from '../store/tripStore'
import { TricolorAccent } from '../components/TricolorAccent'
import { BarcodeScanSheet } from '../components/BarcodeScanSheet'
import { CartFillDisplay } from '../components/CartFillDisplay'

// 画面B:カートのビジュアル確認画面(ホーム/メイン画面・会計の入り口)。
// 「カートそのものに集中する」画面。一覧・編集は画面Aに集約したので、
// この画面はカートの視覚的な確認・バーコードスキャン・会計に専念する。
//
// 【フェーズ2】バーコードスキャン(カメラアイコン)を実装。計画リストに
// 無かった商品を、その場でスキャンしてカートに追加できる。追加された
// 商品はtripItemとして記録されるため、画面Aのリストにも自動的に表示される
// (BarcodeScanSheet・tripStore.addScannedItemを参照)
//
// 【フェーズ3】カートに商品が入っていくたびに、カート写真の中に絵文字が
// 増えていくアニメーションを実装(CartFillDisplayを参照)
//
// 【フェーズ4】今回の合計金額を、前回完了した買い物の合計金額と比較して
// 表示する(costco_app_concept_v3.mdの「買い物1回ごとの合計金額の比較」)

type Props = {
  /** リスト画面(画面A)へ戻る時に呼ぶ */
  onBack: () => void
}

export function CartScreen({ onBack }: Props) {
  const tripItems = useTripStore((state) => state.tripItems)
  const products = useTripStore((state) => state.products)
  const completeCheckout = useTripStore((state) => state.completeCheckout)
  const addScannedItem = useTripStore((state) => state.addScannedItem)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [isScanOpen, setIsScanOpen] = useState(false)
  const [lastTripTotal, setLastTripTotal] = useState<number | null>(null)

  useEffect(() => {
    void fetchLastCompletedTripTotal().then(setLastTripTotal)
  }, [])

  const cartItems = tripItems.filter((item) => item.status === 'inCart')
  const total = cartItems.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0)
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const totalDiff = lastTripTotal !== null ? total - lastTripTotal : null

  async function handleCheckout() {
    const confirmed = window.confirm(`買い物を終了しますか?\n合計金額: ¥${total.toLocaleString()}`)
    if (!confirmed) return
    setIsCheckingOut(true)
    try {
      await completeCheckout()
    } finally {
      setIsCheckingOut(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="bg-costco-blue-700 px-4 pb-4 pt-4 text-white shadow-md">
        <TricolorAccent />
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
            aria-label="リストへ戻る"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold">カート</h1>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <button
          onClick={() => setIsScanOpen(true)}
          className="mb-4 flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-500"
        >
          <Camera className="h-4 w-4" />
          バーコードで追加
        </button>

        <CartFillDisplay itemCount={itemCount} />

        <div className="mt-4 text-center">
          <p className="text-sm text-slate-500">カート内 {itemCount}点</p>
          <p className="text-4xl font-semibold tracking-tight text-slate-800">¥{total.toLocaleString()}</p>
          {totalDiff !== null && (
            <p
              className={`mt-1 flex items-center justify-center gap-1 text-sm font-medium ${
                totalDiff > 0 ? 'text-costco-red-600' : totalDiff < 0 ? 'text-green-600' : 'text-slate-400'
              }`}
            >
              {totalDiff > 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : totalDiff < 0 ? (
                <TrendingDown className="h-4 w-4" />
              ) : (
                <Minus className="h-4 w-4" />
              )}
              {totalDiff === 0 ? '前回と同じ' : `前回より${totalDiff > 0 ? '+' : ''}¥${totalDiff.toLocaleString()}`}
            </p>
          )}
        </div>
      </main>

      <div className="border-t border-slate-200 bg-white p-4">
        <button
          onClick={handleCheckout}
          disabled={cartItems.length === 0 || isCheckingOut}
          className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-4 text-lg font-semibold text-white shadow transition-colors active:bg-green-700 disabled:opacity-40"
        >
          <CheckCircle2 className="h-5 w-5" />
          購入する
        </button>
      </div>

      {isScanOpen && (
        <BarcodeScanSheet
          existingProducts={products}
          onClose={() => setIsScanOpen(false)}
          onSubmit={async (details) => {
            await addScannedItem({
              productId: null,
              name: details.name,
              category: details.category,
              price: details.price,
              amount: details.amount,
              unit: details.unit,
              quantity: details.quantity,
              barcode: details.barcode,
            })
            setIsScanOpen(false)
          }}
        />
      )}
    </div>
  )
}
