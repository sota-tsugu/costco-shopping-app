import { useState } from 'react'
import { Users, Loader2, Copy, Check } from 'lucide-react'
import { createNewHousehold, joinHousehold } from '../firebase/household'
import { TricolorAccent } from '../components/TricolorAccent'

// アプリを初めて開いた端末で表示される、家族コードの設定画面。
// 「新しい家族を作る」か「既にある家族コードで参加する」かを選ぶ。
//
// 【白紙化にあたっての注記】以前はここで、この端末に残っていた旧
// sql.js版のテストデータ(マイ定番棚・購入履歴など)をFirestoreへ
// 一度だけ引き継ぐ処理(migrateLocalDataToHousehold)を呼んでいたが、
// アプリの企画をゼロから見直すにあたり、旧データモデルごと削除した
// ため不要になった。household(家族コード)関連の土台自体は今後も
// 使う想定のため、この画面はそのまま残している。

type Props = {
  onReady: () => void
}

type Mode = 'choose' | 'created' | 'join'

export function HouseholdSetupScreen({ onReady }: Props) {
  const [mode, setMode] = useState<Mode>('choose')
  const [isWorking, setIsWorking] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [newCode, setNewCode] = useState('')
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [isCopied, setIsCopied] = useState(false)

  async function handleCreate() {
    setIsWorking(true)
    setErrorMessage(null)
    try {
      const code = await createNewHousehold()
      setNewCode(code)
      setMode('created')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsWorking(false)
    }
  }

  async function handleJoin() {
    if (joinCodeInput.trim().length === 0) return
    setIsWorking(true)
    setErrorMessage(null)
    try {
      await joinHousehold(joinCodeInput)
      onReady()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsWorking(false)
    }
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(newCode)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-sm">
        <TricolorAccent />
        <div className="p-6">
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-costco-blue-50 p-4">
            <Users className="h-8 w-8 text-costco-blue-600" />
          </div>
        </div>

        {mode === 'choose' && (
          <>
            <h1 className="mb-1 text-center text-lg font-bold text-slate-800">
              我が家専用コストコ買い物リスト
            </h1>
            <p className="mb-6 text-center text-sm text-slate-500">
              家族の合言葉(家族コード)を作るか、パートナーから教えてもらったコードで参加してください。
            </p>

            {errorMessage && (
              <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{errorMessage}</p>
            )}

            <button
              onClick={handleCreate}
              disabled={isWorking}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-4 text-base font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
            >
              {isWorking ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              新しく家族を作る
            </button>
            <button
              onClick={() => setMode('join')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-4 text-base font-bold text-slate-700"
            >
              家族コードを入力して参加する
            </button>
          </>
        )}

        {mode === 'join' && (
          <>
            <h1 className="mb-1 text-center text-lg font-bold text-slate-800">
              家族コードを入力してください
            </h1>
            <p className="mb-6 text-center text-sm text-slate-500">
              パートナーの端末に表示されているコードを、そのまま入力してください。
            </p>

            {errorMessage && (
              <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{errorMessage}</p>
            )}

            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="例:K3F9-7QXP-2MRT"
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-center text-lg tracking-wider focus:border-costco-blue-500 focus:outline-none"
            />

            <button
              onClick={handleJoin}
              disabled={isWorking || joinCodeInput.trim().length === 0}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-4 text-base font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
            >
              {isWorking ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              参加する
            </button>
            <button
              onClick={() => setMode('choose')}
              className="w-full py-2 text-sm text-slate-500"
            >
              戻る
            </button>
          </>
        )}

        {mode === 'created' && (
          <>
            <h1 className="mb-1 text-center text-lg font-bold text-slate-800">
              家族コードができました
            </h1>
            <p className="mb-4 text-center text-sm text-slate-500">
              このコードをパートナーに伝えて、「家族コードを入力して参加する」から入力してもらってください。
            </p>

            <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-slate-100 p-4">
              <span className="text-xl font-bold tracking-wider text-slate-800">{newCode}</span>
              <button onClick={handleCopyCode} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200">
                {isCopied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>

            <button
              onClick={onReady}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-4 text-base font-semibold text-white shadow transition-colors active:bg-costco-red-700"
            >
              始める
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  )
}
