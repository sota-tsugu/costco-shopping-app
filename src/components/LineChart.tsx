// 汎用の折れ線グラフ(単価の推移・買い物ごとの合計金額の推移など、
// 「日付と円額の推移」を表示する場面で共通して使う)。
// 外部のグラフ描画ライブラリ(Chart.jsなど)は使わず、インラインSVGを
// 自前で組み立てて描いている(costco_app_concept_v3.mdの技術方針より)。
// データの最小値・最大値からJavaScriptで座標を計算している

export type LineChartPoint = { date: string; value: number }

const CHART_WIDTH = 300
const CHART_HEIGHT = 140
const CHART_MARGIN = { top: 14, right: 12, bottom: 22, left: 44 }

export function formatYen(value: number): string {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: 1 })
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
}

type Props = {
  points: LineChartPoint[]
  /** スクリーンリーダー向けの説明文 */
  title: string
}

export function LineChart({ points, title }: Props) {
  const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom

  const values = points.map((p) => p.value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  // 最小値と最大値が同じ(変化が無い)場合に0除算にならないよう、上下に少し余白を持たせる
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
      <title>{title}</title>
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
