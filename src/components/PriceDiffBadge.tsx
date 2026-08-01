import { ArrowUp, ArrowDown } from 'lucide-react'

/** 値上がり/値下がりのバッジ(価格差がなければ何も表示しない) */
export function PriceDiffBadge({ diff, unitLabel }: { diff: number; unitLabel: string | null }) {
  // 小数計算の誤差で±0.01のような無意味な差が出るのを防ぐ
  const rounded = unitLabel ? Math.round(diff * 100) / 100 : Math.round(diff)
  if (rounded === 0) return null
  const isUp = rounded > 0
  const displayValue = Math.abs(rounded).toLocaleString(undefined, {
    maximumFractionDigits: unitLabel ? 2 : 0,
  })
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-bold ${
        isUp ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
      }`}
    >
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}¥
      {displayValue}
      {unitLabel ? `/${unitLabel}` : ''}
    </span>
  )
}
