import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search, X, ChevronRight } from 'lucide-react'
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
// グラフ→購入日の一覧、という構成にしている。商品単価の変動推移は、
// 商品ごとの詳細シート(ProductHistorySheet)側にすでにあるため、
// ここでは扱わない
//
// 【購入日ごとの切り替え表示】購入点数が多いと一覧が長くなりすぎるため、
// まず購入日の一覧(日付・点数・その日の合計)を表示し、日付をタップ
// すると、その日に買った商品だけの一覧に切り替わる(2段階の見せ方)。
//
// 【商品ごとの絞り込み検索】購入日の一覧を、商品名でその場で絞り込める
// 検索欄を設けている(costco_app_concept_v3.mdの「商品ごとに絞り込んで
// 見られるものと、全体を通しで見られるものの両方を想定」に対応)。
// 年間利用額・推移グラフは全体の集計のままで、絞り込みの対象にはしていない

type Props = {
  onBack: () => void
}

function dateKey(iso: string): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateLabel(key: string): string {
  if (key === 'unknown') return '日付不明'
  const d = new Date(key)
  if (Number.isNaN(d.getTime())) return '日付不明'
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
}

export function HistoryScreen({ onBack }: Props) {
  const [history, setHistory] = useState<PurchaseHistoryEntry[] | null>(null)
  const [trips, setTrips] = useState<CompletedTripSummary[] | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

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

  // 検索条件が変わったら、選択中の日付は一旦解除する(絞り込んだ結果
  // その日に商品が無くなる、といったズレを避けるため)
  useEffect(() => {
    setSelectedDate(null)
  }, [searchQuery])

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

  // 購入日ごとにまとめる(日付・その日の点数・その日の合計金額)
  const groupedByDate = useMemo(() => {
    if (!filteredHistory) return []
    const groups = new Map<string, PurchaseHistoryEntry[]>()
    for (const entry of filteredHistory) {
      const key = dateKey(entry.purchasedAt)
      const list = groups.get(key)
      if (list) list.push(entry)
      else groups.set(key, [entry])
    }
    // filteredHistoryはすでに新しい順なので、Mapに登場した順番をそのまま使う
    return [...groups.entries()].map(([date, entries]) => ({
      date,
      entries,
      total: entries.reduce((sum, e) => sum + e.price * e.quantity, 0),
    }))
  }, [filteredHistory])

  const selectedGroup = groupedByDate.find((g) => g.date === selectedDate) ?? null

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <header className="bg-costco-blue-700 px-4 pb-4 pt-4 text-white shadow-md">
        <TricolorAccent />
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={selectedDate !== null ? () => setSelectedDate(null) : onBack}
            className="rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
            aria-label={selectedDate !== null ? '購入日の一覧へ戻る' : '今回買うものリストへ戻る'}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold">
            {selectedDate !== null ? dateLabel(selectedDate) : '購入履歴'}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-4">
        {selectedGroup ? (
          <>
            <p className="mb-3 text-sm text-slate-500">
              {selectedGroup.entries.length}点 ・ 合計 ¥{selectedGroup.total.toLocaleString()}
            </p>
            <ul className="space-y-1.5">
              {selectedGroup.entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm">
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
          </>
        ) : (
          <>
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

            {groupedByDate.length === 0 && history !== null && history.length > 0 && (
              <p className="rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm">
                「{searchQuery}」に一致する購入履歴が見つかりませんでした。
              </p>
            )}

            {groupedByDate.length > 0 && (
              <section>
                <h2 className="mb-1.5 text-xs font-semibold text-slate-500">購入日</h2>
                <ul className="space-y-1.5">
                  {groupedByDate.map(({ date, entries, total }) => (
                    <li key={date}>
                      <button
                        onClick={() => setSelectedDate(date)}
                        className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm active:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-800">{dateLabel(date)}</div>
                          <div className="text-xs text-slate-400">{entries.length}点</div>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-slate-800">
                          ¥{total.toLocaleString()}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
