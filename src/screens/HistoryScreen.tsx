import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { fetchAllPurchaseHistory, type PurchaseHistoryEntry } from '../store/tripStore'
import { TricolorAccent } from '../components/TricolorAccent'

// 画面C:購入履歴・レポート画面(いつでも振り返れる画面)。
// 買い物の前後に関わらず、いつでも過去の記録を振り返れる画面として、
// 画面Aのヘッダーからいつでも開ける(costco_app_concept_v3.mdの
// 「2. 画面構成」を参照)。
//
// 【フェーズ1(最小実装)の割り切り】まずは「全体の購入履歴一覧」から
// 着手する。買い物1回ごとの合計金額の推移グラフ・商品単価の変動推移・
// 年間利用額は、レイアウトも含めて後日追加する想定
//
// 【表示の考え方】商品ごとの履歴(ProductHistorySheet)とは別に、
// すべての商品を横断して、購入日の新しい順・月ごとにまとめて表示する

const OTHER_MONTH = '日付不明'

type Props = {
  onBack: () => void
}

function formatDate(iso: string): string {
  if (!iso) return '日付不明'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '日付不明'
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

function monthLabel(iso: string): string {
  if (!iso) return OTHER_MONTH
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return OTHER_MONTH
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

export function HistoryScreen({ onBack }: Props) {
  const [history, setHistory] = useState<PurchaseHistoryEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAllPurchaseHistory().then((rows) => {
      if (!cancelled) setHistory(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const groupedByMonth = useMemo(() => {
    if (!history) return []
    const groups = new Map<string, PurchaseHistoryEntry[]>()
    for (const entry of history) {
      const label = monthLabel(entry.purchasedAt)
      const list = groups.get(label)
      if (list) list.push(entry)
      else groups.set(label, [entry])
    }
    // historyはすでに新しい順なので、Mapに登場した順番(=新しい月から)をそのまま使う
    return [...groups.entries()].map(([month, entries]) => ({ month, entries }))
  }, [history])

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <header className="bg-costco-blue-700 px-4 pb-4 pt-4 text-white shadow-md">
        <TricolorAccent />
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
            aria-label="今回買うものリストへ戻る"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold">購入履歴</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4">
        {history === null && <p className="text-sm text-slate-400">読み込んでいます…</p>}

        {history !== null && history.length === 0 && (
          <p className="rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm">
            まだ購入履歴がありません。買い物を1回終えると、ここに記録されます。
          </p>
        )}

        {groupedByMonth.map(({ month, entries }) => (
          <section key={month} className="mb-4">
            <h2 className="mb-1.5 text-xs font-semibold text-slate-500">{month}</h2>
            <ul className="space-y-1.5">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm"
                >
                  <span className="shrink-0 text-xs text-slate-400">{formatDate(entry.purchasedAt)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-800">{entry.productName}</div>
                    {entry.category && <div className="truncate text-xs text-slate-400">{entry.category}</div>}
                  </div>
                  <span className="shrink-0 text-right text-sm text-slate-700">
                    ¥{entry.price.toLocaleString()}
                    {entry.amount !== null && (
                      <span className="block text-xs text-slate-400">
                        ({entry.amount}{entry.unit ?? ''})
                      </span>
                    )}
                    {entry.quantity > 1 && <span className="block text-xs text-slate-400">×{entry.quantity}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  )
}
