import { useState } from 'react'
import { Settings } from 'lucide-react'
import { HouseholdSetupScreen } from './screens/HouseholdSetupScreen'
import { SettingsModal } from './screens/SettingsModal'
import { UpdateBanner } from './components/UpdateBanner'
import { TricolorAccent } from './components/TricolorAccent'
import { getSavedHouseholdId } from './firebase/household'

// アプリのエントリーポイント。
//
// 【白紙化にあたっての注記】STEP0(開発環境の土台)とフェーズ2で作った
// Firebase基盤(匿名認証+家族コードの仕組み)だけを残し、それ以外の
// 画面・データの持ち方(マイ定番棚・カート・購入履歴など)は企画を
// ゼロから見直すため一旦すべて削除した。詳しい経緯はCLAUDE.mdを参照。
//
// 家族コードの設定が済んだ後にどんな画面を出すかは、これから改めて
// 企画・設計していく。今はまだ何もない状態であることが分かる、簡単な
// プレースホルダー画面だけを表示している。

function App() {
  const [householdReady, setHouseholdReady] = useState(() => getSavedHouseholdId() !== null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  if (!householdReady) {
    return <HouseholdSetupScreen onReady={() => setHouseholdReady(true)} />
  }

  return (
    <>
      {/* 新しいバージョンが公開されたら、画面によらず常に気づけるようにする */}
      <UpdateBanner />

      <div className="min-h-screen bg-slate-50">
        <header className="bg-costco-blue-700 px-4 pb-4 pt-4 text-white shadow-md">
          <TricolorAccent />
          <div className="mt-3 flex items-center justify-between">
            <h1 className="text-base font-semibold">我が家専用コストコ買い物リスト</h1>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
              aria-label="設定"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-md px-6 py-10 text-center">
          <p className="text-sm text-slate-500">
            画面はまだありません。これから企画・設計をゼロから見直していきます。
          </p>
        </main>
      </div>

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </>
  )
}

export default App
