import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Camera, TrendingUp, TrendingDown, Minus, AlertTriangle, X } from 'lucide-react'
import { useTripStore, fetchLastCompletedTripTotal, type TripItem } from '../store/tripStore'
import { TricolorAccent } from '../components/TricolorAccent'
import { BarcodeScanSheet } from '../components/BarcodeScanSheet'
import { CartFillDisplay } from '../components/CartFillDisplay'
import { TripStageIndicator } from '../components/TripStageIndicator'
import { ScreenPageDots } from '../components/ScreenPageDots'

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
//
// 【買い忘れ確認】「購入する」を押した時、今回買うものリストに入れた
// (検討中の)まま、カートに入れていない商品が残っていたら、確認シート
// (MissingItemsSheet)を挟む。あくまで「気づけるようにする」だけの
// 軽い確認で、リストへ戻って修正することは求めない(在庫が無かった等、
// 直しようがない場合もあるため)。「このまま購入する」を選ぶと、
// その検討中の商品はtripStore.completeCheckout()側で削除され、
// 宙に浮いたデータとして残らないようにしている

type Props = {
  /** リスト画面(画面A)へ戻る時に呼ぶ */
  onBack: () => void
}

export function CartScreen({ onBack }: Props) {
  const tripItems = useTripStore((state) => state.tripItems)
  const products = useTripStore((state) => state.products)
  const currentTrip = useTripStore((state) => state.currentTrip)
  const completeCheckout = useTripStore((state) => state.completeCheckout)
  const addScannedItem = useTripStore((state) => state.addScannedItem)
  const backToPlanning = useTripStore((state) => state.backToPlanning)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [isScanOpen, setIsScanOpen] = useState(false)
  const [lastTripTotal, setLastTripTotal] = useState<number | null>(null)
  const [missingItems, setMissingItems] = useState<TripItem[] | null>(null)

  useEffect(() => {
    void fetchLastCompletedTripTotal().then(setLastTripTotal)
  }, [])

  const cartItems = tripItems.filter((item) => item.status === 'inCart')
  const total = cartItems.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0)
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const totalDiff = lastTripTotal !== null ? total - lastTripTotal : null
  const isOverBudget = currentTrip !== null && total > currentTrip.budget

  // 「購入する」タップ時のエントリーポイント。今回買うものリストに
  // 入れたまま(検討中の)カートに入れていない商品が残っていれば、
  // 先に確認シートを挟む。無ければ今まで通りの確認ダイアログのまま
  function handleCheckoutTap() {
    const consideringItems = tripItems.filter((item) => item.status === 'considering')
    if (consideringItems.length > 0) {
      setMissingItems(consideringItems)
      return
    }
    const confirmed = window.confirm(`買い物を終了しますか?\n合計金額: ¥${total.toLocaleString()}`)
    if (!confirmed) return
    void runCheckout()
  }

  async function runCheckout() {
    setIsCheckingOut(true)
    try {
      await completeCheckout()
    } finally {
      setIsCheckingOut(false)
    }
  }

  // 買い物をやめて計画中の画面に戻る。カートに入れた商品・検討中の商品は
  // 削除せずそのまま保持する(画面Aの計画中の画面側で、両方をチェック済み
  // として扱うようにしている)
  async function handleBackToPlanning() {
    const confirmed = window.confirm(
      '買い物をやめて、計画中の画面に戻りますか?カートに入れた商品は、そのまま保持されます。',
    )
    if (!confirmed) return
    await backToPlanning()
    onBack()
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="bg-costco-blue-700 px-4 pb-4 pt-4 text-white shadow-md">
        <TricolorAccent />
        <div className="mt-3 flex items-center justify-between">
          <TripStageIndicator stage="active" />
          <ScreenPageDots active="cart" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
              aria-label="リストへ戻る"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base font-semibold">カート</h1>
          </div>
          <button
            onClick={handleBackToPlanning}
            className="text-xs text-costco-blue-100 underline underline-offset-2 active:text-white"
          >
            買い物をやめる
          </button>
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
          <p
            className={`text-4xl font-semibold tracking-tight ${isOverBudget ? 'text-costco-red-600' : 'text-slate-800'}`}
          >
            ¥{total.toLocaleString()}
          </p>
          {isOverBudget && currentTrip && (
            <p className="mt-1 flex items-center justify-center gap-1 text-sm font-medium text-costco-red-600">
              <AlertTriangle className="h-4 w-4" />
              予算(¥{currentTrip.budget.toLocaleString()})を¥{(total - currentTrip.budget).toLocaleString()}オーバー
            </p>
          )}
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
          onClick={handleCheckoutTap}
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

      {missingItems && (
        <MissingItemsSheet
          items={missingItems}
          isProcessing={isCheckingOut}
          onCancel={() => setMissingItems(null)}
          onConfirm={async () => {
            setMissingItems(null)
            await runCheckout()
          }}
        />
      )}
    </div>
  )
}

type MissingItemsSheetProps = {
  /** 今回買うものリストに入れたまま、カートに入っていない商品(検討中) */
  items: TripItem[]
  isProcessing: boolean
  /** 会計をやめて、そのままカート画面に留まる */
  onCancel: () => void
  /** 買い忘れを承知の上で、そのまま会計を完了する */
  onConfirm: () => void
}

/**
 * 「購入する」を押した時、検討中のまま残っている商品があれば表示する
 * 確認シート。あくまで気づけるようにするための軽い確認で、リストへ
 * 戻って修正することは求めない(在庫が無かった等、直しようがない
 * 場合もあるため)。「このまま購入する」を選んだ場合、この検討中の
 * 商品はtripStore.completeCheckout()側でまとめて削除される
 */
function MissingItemsSheet({ items, isProcessing, onCancel, onConfirm }: MissingItemsSheetProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-base font-bold text-slate-800">買い忘れはありませんか?</h2>
          <button onClick={onCancel} className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          今回買うものリストに入れたまま、カートに入っていない商品があります。
        </p>
        <ul className="mb-5 max-h-48 space-y-1.5 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="truncate rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {item.productName}
            </li>
          ))}
        </ul>

        <button
          onClick={onConfirm}
          disabled={isProcessing}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-green-700 disabled:opacity-50"
        >
          <CheckCircle2 className="h-5 w-5" />
          このまま購入する
        </button>
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-50"
        >
          やめる
        </button>
      </div>
    </div>
  )
}
