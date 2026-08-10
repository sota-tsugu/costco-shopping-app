import { useEffect, useState } from 'react'

// 画面Aのヘッダーに置く、計画中/買い物中を示す小さなインジケーター。
// ドット+接続線の「段階」表示に加えて、買い物中だけ買い物開始からの
// 経過時間を実際に時を刻ませて表示する。
//
// 【なぜ経過時間か】色や形の飾りは計画中・買い物中のどちらでも作れて
// しまうが、時間が実際に進んでいるかどうかは作り物ではなくその状態の
// 本質そのもの。計画中は何度見返しても同じ内容だが、買い物中は開始が
// あり時が進み会計で終わる一度きりのセッションなので、時計そのものに
// 「今進行中である」ことを語らせている
//
// 【1分ごとの更新】バッテリー消費を抑えるため、秒単位ではなく1分おきに
// 再計算している。表示も分単位(「買い物中・14分」)にしている

type Props = {
  stage: 'planning' | 'active'
  /** 買い物開始時刻(ISO文字列)。tripStoreのcurrentTrip.startedAtをそのまま渡す想定 */
  startedAt?: string | null
}

export function TripStageIndicator({ stage, startedAt }: Props) {
  const isActive = stage === 'active'
  const [elapsedMinutes, setElapsedMinutes] = useState<number | null>(null)

  useEffect(() => {
    if (!isActive || !startedAt) {
      setElapsedMinutes(null)
      return
    }
    const startMs = new Date(startedAt).getTime()
    if (Number.isNaN(startMs)) {
      setElapsedMinutes(null)
      return
    }
    function tick() {
      setElapsedMinutes(Math.max(0, Math.floor((Date.now() - startMs) / 60000)))
    }
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [isActive, startedAt])

  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`rounded-full transition-all ${!isActive ? 'h-2.5 w-2.5 bg-white ring-2 ring-white/20' : 'h-2 w-2 bg-white/35'}`}
      />
      <span aria-hidden="true" className="h-px w-5 bg-white/35" />
      <span
        aria-hidden="true"
        className={`rounded-full transition-all ${
          isActive ? 'h-2.5 w-2.5 animate-pulse bg-white ring-2 ring-white/20' : 'h-2 w-2 bg-white/35'
        }`}
      />
      <span className="ml-1 text-xs font-medium text-white">
        {isActive ? '買い物中' : '計画中'}
        {isActive && elapsedMinutes !== null && <span className="text-white/70">・{elapsedMinutes}分</span>}
      </span>
    </div>
  )
}
