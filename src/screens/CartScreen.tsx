import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Camera, TrendingUp, TrendingDown, Minus, AlertTriangle, X, ShoppingCart } from 'lucide-react'
import { useTripStore, fetchLastCompletedTripTotal, type TripItem } from '../store/tripStore'
import { TricolorAccent } from '../components/TricolorAccent'
import { BarcodeScanSheet } from '../components/BarcodeScanSheet'
import { CartFillDisplay } from '../components/CartFillDisplay'
import { TripStageIndicator } from '../components/TripStageIndicator'
import type { ReceiptData } from '../components/ReceiptScreen'

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
//
// 【擬似レシート画面】会計完了後、淡々とリスト画面へ戻るだけでは
// 味気ないため、擬似レシート画面(ReceiptScreen)を一度挟むようにした。
// このデータはApp.tsx側の状態として持たせているため、会計完了の
// 直前にスナップショットを作ってonCheckoutCompleteで渡している
// (詳しい経緯はReceiptScreen.tsxのコメントを参照)

type Props = {
  /** リスト画面(画面A)へ戻る時に呼ぶ */
  onBack: () => void
  /** 会計処理を始める直前に呼ぶ。App.tsx側で画面の自動遷移を一時的に
   * 止め、空になったカート画面を留まらせるために使う */
  onCheckoutSettling: () => void
  /** 会計処理が失敗した時に呼ぶ。onCheckoutSettlingで止めた画面遷移を解除する */
  onCheckoutSettlingCanceled: () => void
  /** 会計完了時に、擬似レシート画面(ReceiptScreen)へ渡すデータとともに呼ぶ */
  onCheckoutComplete: (data: ReceiptData) => void
}

export function CartScreen({
  onBack,
  onCheckoutSettling,
  onCheckoutSettlingCanceled,
  onCheckoutComplete,
}: Props) {
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
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false)

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
  // 先に確認シートを挟む。無ければ通常の確認シート(CheckoutConfirmSheet)
  // を挟む。
  //
  // 【OS標準のconfirm()をやめた理由】以前はここでブラウザ標準の
  // window.confirm()を使っていたが、レシート画面が一度も表示されない
  // という報告があり、ネイティブダイアログを閉じた直後に別のボタンが
  // 同じ画面位置に現れることで、その指のタップがそのまま新しいボタン
  // (レシート画面の「リストへ戻る」など)に伝わってしまう(スマホの
  // ブラウザでよく知られる挙動)可能性を疑い、確認そのものをアプリ内の
  // 自作シートに置き換えた。これで会計確認から結果表示まで、OS標準の
  // ダイアログを一切経由しなくなる
  function handleCheckoutTap() {
    const consideringItems = tripItems.filter((item) => item.status === 'considering')
    if (consideringItems.length > 0) {
      setMissingItems(consideringItems)
      return
    }
    setShowCheckoutConfirm(true)
  }

  async function runCheckout() {
    setIsCheckingOut(true)
    // 【呼ぶ順番が重要】completeCheckout()を呼ぶ「前」に、必ず先に
    // onCheckoutSettling()でApp.tsx側の画面遷移を止めておく。
    // 以前はcompleteCheckout()の後に呼んでいたが、Firestoreへの書き込みは
    // ローカルに即座に反映される(サーバーの応答を待たない)仕組みのため、
    // completeCheckout()のawaitが返ってくるより先に、リアルタイム購読側が
    // 反応してisActiveがfalseになり、計画中の画面へ切り替わってしまう
    // (画面の遷移を止める合図が間に合わない)ケースがあった
    onCheckoutSettling()
    try {
      // 会計完了後はtripStore側の状態(currentTrip・tripItems)がすぐに
      // 次の計画中トリップへ切り替わってしまうため、擬似レシートに使う
      // データは完了「前」の時点でスナップショットとして先に作っておく
      const receiptData: ReceiptData = {
        storeName: currentTrip?.storeName ?? null,
        completedAt: new Date().toISOString(),
        startedAt: currentTrip?.startedAt ?? null,
        budget: currentTrip?.budget ?? 0,
        items: cartItems.map((item) => ({
          name: item.productName,
          price: item.price ?? 0,
          amount: item.amount,
          unit: item.unit,
          quantity: item.quantity,
          isOnSale: item.isOnSale,
          regularPrice: item.regularPrice,
        })),
        total,
        lastTripTotal,
      }
      await completeCheckout()
      // カートが空になった画面(¥0・0点)を一瞬見せてから、レシートを
      // ポップさせる。1.5秒にしていたが、0.5秒に戻した
      await new Promise((resolve) => setTimeout(resolve, 500))
      onCheckoutComplete(receiptData)
    } catch (error) {
      // 会計の完了に失敗した場合、これまでは何も表示されず「買い物中」の
      // 表示が残り続けたまま気づけなかったため、エラーを明示的に伝える
      // ようにした(電波が悪い場所で通信が失敗した場合など)。
      // 失敗した場合は、先に止めておいた画面遷移も解除する必要がある
      onCheckoutSettlingCanceled()
      window.alert(
        `買い物の終了に失敗しました。電波の良い場所で、もう一度「購入する」をお試しください。\n(${
          error instanceof Error ? error.message : String(error)
        })`,
      )
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
      <header className="relative overflow-hidden bg-costco-blue-900 px-4 pb-4 pt-4 text-white shadow-md">
        <ShoppingCart aria-hidden="true" className="pointer-events-none absolute -bottom-3 -right-3 h-24 w-24 text-white/[0.08]" />
        <TricolorAccent />
        <div className="mt-3 flex items-center justify-between">
          <TripStageIndicator stage="active" startedAt={currentTrip?.startedAt} />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* アイコンだけでは「別の画面に戻る」ことが伝わりにくいという
                指摘があったため、行き先を言葉でも明言している */}
            <button
              onClick={onBack}
              className="-ml-1.5 flex items-center gap-1 rounded-full py-1 pl-1.5 pr-2 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs font-medium">リストに戻る</span>
            </button>
          </div>
          <button
            onClick={handleBackToPlanning}
            className="text-xs text-costco-blue-100 underline underline-offset-2 active:text-white"
          >
            買い物をやめる
          </button>
        </div>
      </header>
      <TricolorAccent variant="subtle" />

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
          {currentTrip && currentTrip.budget > 0 && (
            <>
              <p className="mt-1 text-xs text-slate-400">予算¥{currentTrip.budget.toLocaleString()}のうち</p>
              <div className="mx-auto mt-1.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${isOverBudget ? 'bg-costco-red-500' : 'bg-costco-blue-500'}`}
                  style={{ width: `${Math.min((total / currentTrip.budget) * 100, 100)}%` }}
                />
              </div>
            </>
          )}
          {isOverBudget && currentTrip && (
            <p className="mt-1.5 flex items-center justify-center gap-1 text-sm font-medium text-costco-red-600">
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

      {showCheckoutConfirm && (
        <CheckoutConfirmSheet
          total={total}
          isProcessing={isCheckingOut}
          onCancel={() => setShowCheckoutConfirm(false)}
          onConfirm={async () => {
            setShowCheckoutConfirm(false)
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

type CheckoutConfirmSheetProps = {
  total: number
  isProcessing: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * 「購入する」タップ時の、最終確認シート(検討中の商品が残っていない
 * 通常のケース)。以前はブラウザ標準のwindow.confirm()を使っていたが、
 * OS標準のダイアログをやめてアプリ内の自作シートに置き換えた
 * (経緯はhandleCheckoutTapのコメントを参照)
 */
function CheckoutConfirmSheet({ total, isProcessing, onCancel, onConfirm }: CheckoutConfirmSheetProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-base font-bold text-slate-800">買い物を終了しますか?</h2>
          <button onClick={onCancel} className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-5 text-sm text-slate-500">
          合計金額: <span className="text-base font-semibold text-slate-800">¥{total.toLocaleString()}</span>
        </p>

        <button
          onClick={onConfirm}
          disabled={isProcessing}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-green-700 disabled:opacity-50"
        >
          <CheckCircle2 className="h-5 w-5" />
          購入する
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
