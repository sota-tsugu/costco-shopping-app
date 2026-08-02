import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useCartStore } from './store/cartStore'
import { BudgetSetupScreen } from './screens/BudgetSetupScreen'
import { ShoppingScreen } from './screens/ShoppingScreen'
import { HouseholdSetupScreen } from './screens/HouseholdSetupScreen'
import { UpdateBanner } from './components/UpdateBanner'
import { getSavedHouseholdId } from './firebase/household'

// アプリのエントリーポイント。
// 最初に「家族コード」が端末に保存されているかを確認し、なければ
// HouseholdSetupScreen(家族を作る/参加する画面)を表示する。
// 家族コードが決まったら、cartStoreのFirestore購読を開始する。

function App() {
  const [householdReady, setHouseholdReady] = useState(() => getSavedHouseholdId() !== null)

  const screen = useCartStore((state) => state.screen)
  const errorMessage = useCartStore((state) => state.errorMessage)
  const init = useCartStore((state) => state.init)

  useEffect(() => {
    if (householdReady) {
      init()
    }
  }, [householdReady, init])

  if (!householdReady) {
    return <HouseholdSetupScreen onReady={() => setHouseholdReady(true)} />
  }

  return (
    <>
      {/* 新しいバージョンが公開されたら、画面によらず常に気づけるようにする */}
      <UpdateBanner />
      {renderScreen()}
    </>
  )

  function renderScreen() {
    if (errorMessage) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500" />
          <p className="text-sm text-red-600">エラーが発生しました: {errorMessage}</p>
        </div>
      )
    }

    if (screen === 'loading') {
      return (
        <div className="flex min-h-screen items-center justify-center gap-2 bg-slate-50 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-costco-blue-600" />
          <span>読み込んでいます…</span>
        </div>
      )
    }

    if (screen === 'budget-setup') {
      return <BudgetSetupScreen />
    }

    return <ShoppingScreen />
  }
}

export default App
