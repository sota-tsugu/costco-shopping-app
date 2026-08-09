import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import {
  fetchAllPurchaseHistory,
  fetchAllCompletedTrips,
  type PurchaseHistoryEntry,
  type CompletedTripSummary,
} from '../store/tripStore'
import { TricolorAccent } from '../components/TricolorAccent'
import { LineChart, type LineChartPoint } from '../components/LineChart'

// 画面C:購入履歴・レポート画面(いつでも振り返れる画面)。
// 買い物の前後に関わらず、いつでも過去の記録を振り返れる画面として、
// 画面Aのヘッダーからいつでも開ける(costco_app_concept_v3.mdの
// 「2. 画面構成」を参照)。
//
// 【表示の考え方】上から、年間利用額→買い物1回ごとの合計金額の推移
// グラフ→全体の購入履歴一覧(月ごとにまとめて新しい順)、という
// 構成にしている。商品単価の変動推移は、商品ごとの詳細シート
// (ProductHistorySheet)側にすでにあるため、ここでは扱わない
//
// 【商品ごとの絞り込み検索】全体の購入履歴一覧を、商品名でその場で
// 絞り込める検索欄を設けている(costco_app_concept_v3.mdの「商品ごとに
// 絞り込んで見られるものと、全体を通しで見られるものの両方を想定」に
// 対応)。年間利用額・推移グラフは全体の集計のままで、絞り込みの
// 対象にはしていない

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
  const [trips, setTrips] = useState<CompletedTripSummary[] | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetchAllPurchaseHistory().then((rows) => {
      if (!cancelled) setHistory(rows)
    })
    void fetchAllCompletedTrips().then((rows) => {
      if (!cancelled) setTrips(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 買い物1回ごとの合計金額の推移グラフ用データ(fetchAllCompletedTripsは
  // すでに古い順に並んでいる)
  const tripTotalPoints: LineChartPoint[] = (trips ?? []).map((t) => ({
    date: t.completedAt,
    value: t.actualTotal,
  }))

  // 年ごとの利用額合計(新しい年が上に来るよう並べる)
  const yearlyTotals = useMemo(() => {
    if (!trips) return []
    const map = new Map<string, number>()
    for (const trip of trips) {
      const year = trip.completedAt ? String(new Date(trip.completedAt).getFullYear()) : '日付不明'
      map.set(year, (map.get(year) ?? 0) + trip.actualTotal)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [trips])

  // 商品名で絞り込んだ履歴(検索欄が空の時はそのまま全件)
  const filteredHistory = useMemo(() => {
    if (!history) return null
    const q = searchQuery.trim().toLowerCase()
    if (q === '') return history
    return history.filter((entry) => entry.productName.toLowerCase().includes(q))
  }, [history, searchQuery])

  const groupedByMonth = useMemo(() => {
    if (!filteredHistory) return []
    const groups = new Map<string, PurchaseHistoryEntry[]>()
    for (const entry of filteredHistory) {
      const label = monthLabel(entry.purchasedAt)
      const list = groups.get(label)
      if (list) list.push(entry)
      else groups.set(label, [entry])
    }
    // historyはすでに新しい順なので、Mapに登場した順番(=新しい月から)をそのまま使う
    return [...groups.entries()].map(([month, entries]) => ({ month, entries }))
  }, [filteredHistory])

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
        {yearlyTotals.length > 0 && (
          <section className="mb-4 rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-xs font-semibold text-slate-500">年間利用額</h2>
            <ul className="space-y-1.5">
              {yearlyTotals.map(([year, total]) => (
                <li key={year} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{year}年</span>
                  <span className="font-semibold text-slate-800">¥{total.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tripTotalPoints.length >= 2 && (
          <section className="mb-4 rounded-xl bg-white p-4 shadow-sm">
            <h2 className="mb-1.5 text-xs font-semibold text-slate-500">買い物ごとの合計金額の推移</h2>
            <LineChart points={tripTotalPoints} title="買い物ごとの合計金額の推移グラフ" />
          </section>
        )}

        {history === null && <p className="text-sm text-slate-400">読み込んでいます…</p>}

        {history !== null && history.length === 0 && (
          <p className="rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm">
            まだ購入履歴がありません。買い物を1回終えると、ここに記録されます。
          </p>
        )}

        {history !== null && history.length > 0 && (
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="商品名で絞り込む"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm shadow-sm focus:border-costco-blue-500 focus:outline-none"
            />
            {searchQuery !== '' && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-300 hover:bg-slate-100"
                aria-label="検索をクリア"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {filteredHistory !== null && filteredHistory.length === 0 && history !== null && history.length > 0 && (
          <p className="rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm">
            「{searchQuery}」に一致する購入履歴が見つかりませんでした。
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
