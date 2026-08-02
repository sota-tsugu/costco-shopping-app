import { useEffect } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useCartStore } from './store/cartStore'
import { BudgetSetupScreen } from './screens/BudgetSetupScreen'
import { ShoppingScreen } from './screens/ShoppingScreen'
import { UpdateBanner } from './components/UpdateBanner'

// アプリのエントリーポイント。
// 画面の切り替えは cartStore の `screen` 状態に応じて行うシンプルな
// 構成にしている(react-routerなどのライブラリは、画面数が増えるまでは
// 不要と判断し導入していない)。

function App() {
  const screen = useCartStore((state) => state.screen)
  const errorMessage = useCartStore((state) => state.errorMessage)
  const init = useCartStore((state) => state.init)

  useEffect(() => {
    init()
  }, [init])

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
          <Loader2 className="h-5 w-5 animate-spin" />
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
