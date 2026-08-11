import { useEffect, useRef, useState, type TouchEvent } from 'react'
import { HouseholdSetupScreen } from './screens/HouseholdSetupScreen'
import { SplashScreen } from './screens/SplashScreen'
import { ListScreen } from './screens/ListScreen'
import { CartScreen } from './screens/CartScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { UpdateBanner } from './components/UpdateBanner'
import { ReceiptScreen, type ReceiptData } from './components/ReceiptScreen'
import { getSavedHouseholdId } from './firebase/household'
import { useTripStore } from './store/tripStore'

// アプリのエントリーポイント。
// 家族コードの設定が済んだら、tripStore(定番商品・買い物トリップ・
// トリップ内商品)のFirestore購読を開始し、画面A(ListScreen)と
// 画面B(CartScreen)を切り替える。
//
// 【画面の出し分け】買い物トリップが「active」(買い物中)でない時は、
// 常に画面A(リスト)を表示する。「active」の間だけ、画面Aのカート
// サマリーをタップして画面Bへ、画面Bの戻るボタンで画面Aへ、を
// 行き来できる。それに加えて、左右スワイプでも同じように行き来できる
// (カートを押しながらの片手操作を重視しているため、ボタンタップより
// スワイプの方が自然な場面が多いと考え追加した)。
//
// 【スワイプの実装方針】外部ライブラリは使わず、素のタッチイベント
// (touchstart/touchend)で左右移動量を見るだけの軽量な実装にしている。
// iPhoneのSafariには画面端からのスワイプで「戻る」動作が標準で入って
// いるため、画面のどこからスワイプしても反応するようにし、端末標準の
// 戻る操作と体感が重ならないようにしている。

const SWIPE_THRESHOLD_PX = 60

function App() {
  const [householdReady, setHouseholdReady] = useState(() => getSavedHouseholdId() !== null)
  // 起動のたびに一度だけ、あいさつ画面(SplashScreen)を挟んでから
  // 本編(今回買うものリスト)へ進む。タップされるまでは本編を表示しない
  const [splashDismissed, setSplashDismissed] = useState(false)
  const [view, setView] = useState<'list' | 'cart' | 'history'>('list')
  const [transitionKey, setTransitionKey] = useState(0)
  // 会計完了直後、tripStore側の状態(currentTrip等)はすぐに次の計画中
  // トリップへ切り替わり、それに伴い画面もカート→リストへ自動遷移する。
  // レシート表示はその画面遷移と競合させたくないため、App直下の独立した
  // 状態として持たせ、リスト画面への遷移とは関係なくオーバーレイ表示する
  const [pendingReceipt, setPendingReceipt] = useState<ReceiptData | null>(null)

  const init = useTripStore((state) => state.init)
  const currentTrip = useTripStore((state) => state.currentTrip)
  const errorMessage = useTripStore((state) => state.errorMessage)

  const touchStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (householdReady) {
      void init()
    }
  }, [householdReady, init])

  const isActive = currentTrip?.status === 'active'
  // 買い物中(active)でなければ、カート画面を選んでいても常にリスト画面を表示する。
  // 画面C(購入履歴)は「買い物の前後に関わらずいつでも振り返れる」画面のため、
  // この制約の対象外にしている
  const effectiveView = view === 'history' ? 'history' : isActive ? view : 'list'

  function goTo(next: 'list' | 'cart' | 'history') {
    setView((prev) => {
      if (prev === next) return prev
      setTransitionKey((k) => k + 1)
      return next
    })
  }

  function handleTouchStart(e: TouchEvent<HTMLDivElement>) {
    // 画面C(購入履歴)を見ている間は、画面A/画面Bのスワイプ切り替えを
    // 誤って発動させないようにする
    if (!isActive || effectiveView === 'history') return
    const touch = e.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleTouchEnd(e: TouchEvent<HTMLDivElement>) {
    if (!isActive || effectiveView === 'history' || !touchStart.current) return
    const touch = e.changedTouches[0]
    const dx = touch.clientX - touchStart.current.x
    const dy = touch.clientY - touchStart.current.y
    touchStart.current = null

    // 横方向の移動が縦方向より大きく、しきい値を超えていればスワイプとみなす
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return

    if (dx < 0) {
      goTo('cart') // 左にスワイプ→カート画面(次に進む)
    } else {
      goTo('list') // 右にスワイプ→リスト画面(戻る)
    }
  }

  if (!householdReady) {
    return <HouseholdSetupScreen onReady={() => setHouseholdReady(true)} />
  }

  if (!splashDismissed) {
    return <SplashScreen onContinue={() => setSplashDismissed(true)} />
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
        <p className="text-sm text-red-600">エラーが発生しました: {errorMessage}</p>
      </div>
    )
  }

  return (
    <>
      {/* 新しいバージョンが公開されたら、画面によらず常に気づけるようにする */}
      <UpdateBanner />

      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div key={transitionKey} className="screen-fade-in">
          {effectiveView === 'cart' ? (
            <CartScreen onBack={() => goTo('list')} onCheckoutComplete={setPendingReceipt} />
          ) : effectiveView === 'history' ? (
            <HistoryScreen onBack={() => goTo('list')} />
          ) : (
            <ListScreen onOpenCart={() => goTo('cart')} onOpenHistory={() => goTo('history')} />
          )}
        </div>
      </div>

      {pendingReceipt && <ReceiptScreen data={pendingReceipt} onClose={() => setPendingReceipt(null)} />}
    </>
  )
}

export default App
