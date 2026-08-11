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
  // トリップへ切り替わる。ただし、空になったカート画面を一瞬見せてから
  // レシートを出したいため、レシート表示中は画面の自動遷移をあえて
  // 止めている(effectiveViewを参照)。App直下の独立した状態として
  // 持たせているのは、カート画面が裏で計画中トリップに切り替わっても
  // レシートの表示自体には影響させないようにするため
  const [pendingReceipt, setPendingReceipt] = useState<ReceiptData | null>(null)
  // 会計完了〜レシート表示までの間(カートが空になった画面をあえて
  // 見せている待ち時間)も、カート画面に留まらせるためのフラグ。
  // このタイミングではまだpendingReceiptがセットされていないため、
  // pendingReceiptだけでは待ち時間中にリスト画面へ切り替わってしまう
  // (「今回買うものリストが一瞬映ってしまう」不具合の原因だった)
  const [isSettlingCheckout, setIsSettlingCheckout] = useState(false)

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

  // 買い物中でなくなったら、画面選択の状態(view)自体も'list'に戻しておく。
  // 以前はeffectiveView側の分岐だけで強制的に'list'を表示させていたが、
  // view自体は'cart'のまま裏に残り続けていたため、次に買い物を始めた
  // 瞬間、その古いviewがそのまま表に出てきて、いきなりカート画面に
  // 飛んでしまう不具合があった(買い物中に一度でもカート画面を開いた
  // 後、計画中に戻って再度「買い物を始める」を押すと再現する)。
  // ただし、会計完了〜レシート表示中はまだカート画面に留まらせたいため、
  // isSettlingCheckout・pendingReceiptがある間はこのリセットを見送る。
  // レシートを閉じてどちらもfalse/nullに戻ると、この同じeffectが
  // 再度発火して正しく'list'にリセットされる
  useEffect(() => {
    if (!isActive && !isSettlingCheckout && !pendingReceipt) {
      setView('list')
    }
  }, [isActive, isSettlingCheckout, pendingReceipt])

  // 買い物中(active)でなければ、カート画面を選んでいても常にリスト画面を表示する。
  // 画面C(購入履歴)は「買い物の前後に関わらずいつでも振り返れる」画面のため、
  // この制約の対象外にしている。
  //
  // 【レシート表示中は例外】会計完了直後はisActiveがすぐfalseになるが、
  // 会計完了〜レシート表示の間(isSettlingCheckout)・レシート表示中
  // (pendingReceipt)は、あえてカート画面(空になった状態)に留まらせる。
  // 会計完了→即リスト画面、ではなく、会計完了→カートが空になった
  // 画面を見せる→レシート表示、という順番の方が「会計が終わった」
  // という実感を持てるため
  const effectiveView =
    view === 'history' ? 'history' : isActive || isSettlingCheckout || pendingReceipt ? view : 'list'

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
            <CartScreen
              onBack={() => goTo('list')}
              onCheckoutSettling={() => setIsSettlingCheckout(true)}
              onCheckoutSettlingCanceled={() => setIsSettlingCheckout(false)}
              onCheckoutComplete={(data) => {
                setIsSettlingCheckout(false)
                setPendingReceipt(data)
              }}
            />
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
