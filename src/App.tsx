import { useEffect, useState } from 'react'
import { HouseholdSetupScreen } from './screens/HouseholdSetupScreen'
import { ListScreen } from './screens/ListScreen'
import { CartScreen } from './screens/CartScreen'
import { UpdateBanner } from './components/UpdateBanner'
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
// 行き来できるようにする。

function App() {
  const [householdReady, setHouseholdReady] = useState(() => getSavedHouseholdId() !== null)
  const [view, setView] = useState<'list' | 'cart'>('list')

  const init = useTripStore((state) => state.init)
  const currentTrip = useTripStore((state) => state.currentTrip)
  const errorMessage = useTripStore((state) => state.errorMessage)

  useEffect(() => {
    if (householdReady) {
      void init()
    }
  }, [householdReady, init])

  if (!householdReady) {
    return <HouseholdSetupScreen onReady={() => setHouseholdReady(true)} />
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
        <p className="text-sm text-red-600">エラーが発生しました: {errorMessage}</p>
      </div>
    )
  }

  // 買い物中(active)でなければ、カート画面を選んでいても常にリスト画面を表示する
  const effectiveView = currentTrip?.status === 'active' ? view : 'list'

  return (
    <>
      {/* 新しいバージョンが公開されたら、画面によらず常に気づけるようにする */}
      <UpdateBanner />

      {effectiveView === 'cart' ? (
        <CartScreen onBack={() => setView('list')} />
      ) : (
        <ListScreen onOpenCart={() => setView('cart')} />
      )}
    </>
  )
}

export default App
