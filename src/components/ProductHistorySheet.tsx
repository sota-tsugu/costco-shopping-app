import { useEffect, useState } from 'react'
import { X, TrendingUp, TrendingDown, Minus, Pencil, Trash2 } from 'lucide-react'
import { useTripStore, fetchPurchaseHistoryByProductName, type ProductPurchaseRecord } from '../store/tripStore'

// 商品ごとの詳細シート:単価比較・購入履歴・購入頻度を表示する。
// 画面Aの買い物中(active)リストで商品名をタップすると開く
// (「カートに入れる」ボタンとは別の入口。costco_app_concept_v3.mdの
// 「3. 履歴・比較機能」を参照)。
//
// 【単価比較の考え方】内容量(amount)が分かっている記録同士で、
// 内容量あたりの単価(price / amount)を比較する。パッケージサイズが
// 変わっても正しく値上がり/値下がりを判断できるようにするため
//
// 【購入記録の訂正・削除】各履歴の行を鉛筆アイコンからタップすると、
// 「買い物を終了する」ボタンの押し間違いなどで内容が違っていた場合に
// 備え、価格・内容量・数量を訂正したり、記録自体を削除できる
// (旧アプリで作っていた仕組みを踏襲)。訂正・削除すると、その記録が
// 属するトリップの実際の合計金額(actualTotal)も裏側で再計算される
//
// 【単価推移グラフ】外部のグラフ描画ライブラリ(Chart.jsなど)は使わず、
// インラインSVGを自前で組み立てて描いている(costco_app_concept_v3.mdの
// 技術方針より)。内容量が分かっている記録だけを古い順に並べ、
// JavaScriptでデータの最小値・最大値から座標を計算している

const CHART_WIDTH = 300
const CHART_HEIGHT = 140
const CHART_MARGIN = { top: 14, right: 12, bottom: 22, left: 44 }

type ChartPoint = { date: string; value: number }

function formatYen(value: number): string {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: 1 })
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
}

type Props = {
  productName: string
  onClose: () => void
}

function formatDate(iso: string): string {
  if (!iso) return '日付不明'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '日付不明'
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

function unitPrice(record: ProductPurchaseRecord): number | null {
  if (record.amount === null || record.amount <= 0) return null
  return record.price / record.amount
}

export function ProductHistorySheet({ productName, onClose }: Props) {
  const [history, setHistory] = useState<ProductPurchaseRecord[] | null>(null)
  const [editingRecord, setEditingRecord] = useState<ProductPurchaseRecord | null>(null)

  async function reload() {
    const rows = await fetchPurchaseHistoryByProductName(productName)
    setHistory(rows)
  }

  useEffect(() => {
    let cancelled = false
    void fetchPurchaseHistoryByProductName(productName).then((rows) => {
      if (!cancelled) setHistory(rows)
    })
    return () => {
      cancelled = true
    }
  }, [productName])

  // 直近2回のうち、両方とも内容量が分かっている場合だけ単価を比較する
  // (購入日も一緒に持たせておき、「いつといつを比較しているか」を
  // 表示できるようにする)
  let priceCompare: {
    latest: number
    previous: number
    diff: number
    percent: number
    latestDate: string
    previousDate: string
  } | null = null
  if (history && history.length >= 2) {
    const latestUnit = unitPrice(history[0])
    const previousUnit = unitPrice(history[1])
    if (latestUnit !== null && previousUnit !== null && previousUnit > 0) {
      const diff = latestUnit - previousUnit
      priceCompare = {
        latest: latestUnit,
        previous: previousUnit,
        diff,
        percent: (diff / previousUnit) * 100,
        latestDate: history[0].purchasedAt,
        previousDate: history[1].purchasedAt,
      }
    }
  }

  // 単価推移グラフ用のデータ:内容量が分かる記録だけを、古い順に並べる
  const unitPricePoints: ChartPoint[] = (history ?? [])
    .map((record) => ({ date: record.purchasedAt, value: unitPrice(record) }))
    .filter((p): p is ChartPoint => p.value !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  // 購入日の間隔(日数)の平均を、購入頻度の目安として出す
  let avgIntervalDays: number | null = null
  if (history && history.length >= 2) {
    const gaps: number[] = []
    for (let i = 0; i < history.length - 1; i++) {
      const a = new Date(history[i].purchasedAt).getTime()
      const b = new Date(history[i + 1].purchasedAt).getTime()
      if (!Number.isNaN(a) && !Number.isNaN(b) && a > b) {
        gaps.push((a - b) / (1000 * 60 * 60 * 24))
      }
    }
    if (gaps.length > 0) {
      avgIntervalDays = Math.round(gaps.reduce((sum, g) => sum + g, 0) / gaps.length)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-800">{productName}</h2>
          <button onClick={onClose} className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {history === null && <p className="text-sm text-slate-400">読み込んでいます…</p>}

        {history !== null && history.length === 0 && (
          <p className="text-sm text-slate-400">この商品の購入履歴はまだありません。</p>
        )}

        {history !== null && history.length > 0 && (
          <>
            {priceCompare && (
              <div className="mb-3 rounded-xl bg-slate-50 p-3">
                <span className="text-xs text-slate-500">前回との単価比較(内容量あたり)</span>
                <div className="mt-1 flex items-center gap-1.5">
                  {priceCompare.diff > 0 ? (
                    <TrendingUp className="h-4 w-4 text-costco-red-600" />
                  ) : priceCompare.diff < 0 ? (
                    <TrendingDown className="h-4 w-4 text-green-600" />
                  ) : (
                    <Minus className="h-4 w-4 text-slate-400" />
                  )}
                  <span
                    className={`text-lg font-semibold ${
                      priceCompare.diff > 0
                        ? 'text-costco-red-600'
                        : priceCompare.diff < 0
                          ? 'text-green-600'
                          : 'text-slate-500'
                    }`}
                  >
                    {priceCompare.diff === 0
                      ? '変わらず'
                      : `${priceCompare.diff > 0 ? '+' : ''}${formatYen(priceCompare.diff)}円(${priceCompare.percent > 0 ? '+' : ''}${priceCompare.percent.toFixed(0)}%)`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {formatDate(priceCompare.previousDate)}(¥{formatYen(priceCompare.previous)}) → {formatDate(priceCompare.latestDate)}
                  (¥{formatYen(priceCompare.latest)})
                </p>
              </div>
            )}

            {unitPricePoints.length >= 2 && (
              <div className="mb-4 rounded-xl bg-slate-50 p-3">
                <span className="mb-1 block text-xs text-slate-500">単価の推移(内容量あたり)</span>
                <UnitPriceChart points={unitPricePoints} />
              </div>
            )}

            {avgIntervalDays !== null && (
              <p className="mb-4 text-sm text-slate-600">平均 約{avgIntervalDays}日ごとに購入しています</p>
            )}

            <h3 className="mb-1.5 text-xs font-semibold text-slate-500">購入履歴</h3>
            <ul className="mb-1 space-y-1.5">
              {history.map((record) => (
                <li
                  key={record.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="shrink-0 text-slate-500">{formatDate(record.purchasedAt)}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-slate-700">
                    ¥{record.price.toLocaleString()}
                    {record.amount !== null && (
                      <span className="text-slate-400"> ({record.amount}{record.unit ?? ''})</span>
                    )}
                    {record.quantity > 1 && <span className="text-slate-400"> ×{record.quantity}</span>}
                  </span>
                  <button
                    onClick={() => setEditingRecord(record)}
                    className="shrink-0 p-1 text-slate-300 active:text-costco-blue-600"
                    aria-label="この購入記録を訂正・削除する"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {editingRecord && (
        <EditPurchaseRecordSheet
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSaved={async () => {
            setEditingRecord(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}

type EditPurchaseRecordSheetProps = {
  record: ProductPurchaseRecord
  onClose: () => void
  onSaved: () => Promise<void>
}

/** 購入記録1件の訂正・削除シート。「買い物を終了する」の押し間違いなどに備える */
function EditPurchaseRecordSheet({ record, onClose, onSaved }: EditPurchaseRecordSheetProps) {
  const updatePurchaseRecord = useTripStore((state) => state.updatePurchaseRecord)
  const removePurchaseRecord = useTripStore((state) => state.removePurchaseRecord)

  const [price, setPrice] = useState(String(record.price))
  const [amount, setAmount] = useState(record.amount !== null ? String(record.amount) : '')
  const [unit, setUnit] = useState(record.unit ?? '')
  const [quantity, setQuantity] = useState(String(record.quantity))
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const canSave = Number(price) > 0 && Number(quantity) > 0

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    try {
      await updatePurchaseRecord(record.tripId, record.id, {
        price: Number(price),
        amount: Number(amount) > 0 ? Number(amount) : null,
        unit: unit.trim() !== '' ? unit.trim() : null,
        quantity: Number(quantity),
      })
      await onSaved()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm('この購入記録を削除しますか?(元に戻せません)')
    if (!confirmed) return
    setIsDeleting(true)
    try {
      await removePurchaseRecord(record.tripId, record.id)
      await onSaved()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">購入記録を訂正</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">価格(円)</label>
        <input
          type="number"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">内容量(任意)</label>
        <div className="mb-4 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例:900"
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="g等"
            className="w-1/2 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">数量</label>
        <input
          type="number"
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />

        <button
          onClick={handleSave}
          disabled={!canSave || isSaving || isDeleting}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-costco-blue-700 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-blue-800 disabled:opacity-50"
        >
          保存する
        </button>

        <button
          onClick={handleDelete}
          disabled={isSaving || isDeleting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          この購入記録を削除する
        </button>
      </div>
    </div>
  )
}

/**
 * 単価の推移を表す折れ線グラフ。外部ライブラリは使わず、データの
 * 最小値・最大値からJavaScriptで座標を計算し、インラインSVGで描く
 * (costco_app_concept_v3.mdの技術方針より)
 */
function UnitPriceChart({ points }: { points: ChartPoint[] }) {
  const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom

  const values = points.map((p) => p.value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  // 最小値と最大値が同じ(値上がり/値下がりが無い)場合に0除算にならないよう、
  // 上下に少し余白を持たせる
  const minValue = rawMin === rawMax ? rawMin - 1 : rawMin
  const maxValue = rawMin === rawMax ? rawMax + 1 : rawMax

  function xAt(index: number): number {
    if (points.length === 1) return CHART_MARGIN.left + plotWidth / 2
    return CHART_MARGIN.left + (index / (points.length - 1)) * plotWidth
  }
  function yAt(value: number): number {
    return CHART_MARGIN.top + plotHeight - ((value - minValue) / (maxValue - minValue)) * plotHeight
  }

  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value), point: p }))
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')

  // x軸のラベルは、詰まりすぎないよう最大4件(最初・最後を必ず含む)だけ表示する
  const labelIndices = new Set<number>([0, points.length - 1])
  if (points.length > 2) {
    const mid = Math.floor((points.length - 1) / 2)
    labelIndices.add(mid)
  }

  return (
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full" role="img">
      <title>単価の推移グラフ</title>
      <line
        x1={CHART_MARGIN.left}
        y1={CHART_MARGIN.top}
        x2={CHART_MARGIN.left}
        y2={CHART_HEIGHT - CHART_MARGIN.bottom}
        stroke="#e2e8f0"
      />
      <line
        x1={CHART_MARGIN.left}
        y1={CHART_HEIGHT - CHART_MARGIN.bottom}
        x2={CHART_WIDTH - CHART_MARGIN.right}
        y2={CHART_HEIGHT - CHART_MARGIN.bottom}
        stroke="#e2e8f0"
      />

      <text x={CHART_MARGIN.left - 6} y={CHART_MARGIN.top + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
        ¥{formatYen(maxValue)}
      </text>
      <text x={CHART_MARGIN.left - 6} y={CHART_HEIGHT - CHART_MARGIN.bottom} textAnchor="end" fontSize="10" fill="#94a3b8">
        ¥{formatYen(minValue)}
      </text>

      <path d={linePath} fill="none" stroke="#00427c" strokeWidth="2" />

      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 4 : 3} fill="#00427c" />
      ))}

      {coords
        .filter((_, i) => labelIndices.has(i))
        .map((c, i) => (
          <text key={i} x={c.x} y={CHART_HEIGHT - CHART_MARGIN.bottom + 14} textAnchor="middle" fontSize="10" fill="#94a3b8">
            {formatShortDate(c.point.date)}
          </text>
        ))}
    </svg>
  )
}
