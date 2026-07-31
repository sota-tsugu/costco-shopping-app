import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2, PlusCircle } from 'lucide-react'
import { dbClient } from './db/dbClient'

// STEP0(環境構築)専用の確認画面。
// ここではまだ「買い物リスト」としての機能は作っていない。
// 目的は以下3点が実際に動くことを確認するだけ:
//   1. Web Worker上でsql.jsが動き、SELECT 1が実行できるか
//   2. ダミーテーブルにデータを追加できるか
//   3. リロードしてもIndexedDBから前回のデータが復元されるか
// 本番の買い物機能(カート・予算・定番棚など)はSTEP1以降で実装する。

type SmokeTestRow = {
  id: number
  message: string
  created_at: string
}

type Status = 'loading' | 'ready' | 'error'

function App() {
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectOneResult, setSelectOneResult] = useState<number | null>(null)
  const [rows, setRows] = useState<SmokeTestRow[]>([])
  const [isAdding, setIsAdding] = useState(false)

  async function refreshRows() {
    const result = await dbClient.exec(
      'SELECT id, message, created_at FROM smoke_test ORDER BY id DESC',
    )
    const table = result[0]
    if (!table) {
      setRows([])
      return
    }
    const parsed = table.values.map((row) => ({
      id: row[0] as number,
      message: row[1] as string,
      created_at: row[2] as string,
    }))
    setRows(parsed)
  }

  useEffect(() => {
    let cancelled = false

    async function setup() {
      try {
        await dbClient.init()

        const selectOne = await dbClient.exec('SELECT 1')
        if (cancelled) return
        setSelectOneResult(Number(selectOne[0]?.values[0]?.[0] ?? null))

        await refreshRows()
        if (cancelled) return

        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        setErrorMessage(error instanceof Error ? error.message : String(error))
        setStatus('error')
      }
    }

    setup()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAddDummyData() {
    setIsAdding(true)
    try {
      const now = new Date().toISOString()
      await dbClient.run(
        'INSERT INTO smoke_test (message, created_at) VALUES (?, ?)',
        [`テストデータ #${rows.length + 1}`, now],
      )
      await dbClient.persist()
      await refreshRows()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="bg-blue-800 px-4 py-5 text-white shadow">
        <h1 className="text-lg font-bold">我が家専用コストコ買い物リスト</h1>
        <p className="mt-1 text-sm text-blue-100">
          STEP0:環境構築の動作確認画面(まだ買い物機能はありません)
        </p>
      </header>

      <main className="mx-auto max-w-md space-y-4 p-4">
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-800">
            1. Web Worker + sql.js の動作確認
          </h2>

          {status === 'loading' && (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>初期化しています…</span>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-start gap-2 text-red-600">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>エラーが発生しました: {errorMessage}</span>
            </div>
          )}

          {status === 'ready' && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span>SELECT 1 の結果: {selectOneResult}(成功)</span>
            </div>
          )}
        </section>

        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-800">
            2〜3. IndexedDBへの保存・復元の確認
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            下のボタンでダミーデータを追加し、ブラウザをリロードしても
            残っていればIndexedDBへの永続化が成功しています。
          </p>

          <button
            onClick={handleAddDummyData}
            disabled={status !== 'ready' || isAdding}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white shadow disabled:opacity-50"
          >
            {isAdding ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <PlusCircle className="h-5 w-5" />
            )}
            ダミーデータを追加
          </button>

          <ul className="mt-4 space-y-2">
            {rows.length === 0 && (
              <li className="text-sm text-slate-400">まだデータがありません</li>
            )}
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <div className="font-medium text-slate-700">{row.message}</div>
                <div className="text-xs text-slate-400">{row.created_at}</div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}

export default App
