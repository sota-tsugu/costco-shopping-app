// 「計画中→買い物中」という、実際に一方通行な2段階だけを示す非interactive
// な現在地表示。画面A・画面Bのヘッダーに共通で置く。
//
// 【設計意図】画面A(リスト)と画面B(カート)は、買い物中という同じ段階の
// 中で自由に行き来できる2つの見方であり、「リストを終えたらカートに
// 進む」という順番があるわけではない。段階(計画中/買い物中)はこの
// コンポーネントで、画面の切り替え(リスト/カート)は別のScreenPageDots
// コンポーネントで表現し、2つの意味を混同しないようにしている
//
// 【見た目についての経緯】当初は「計画中」「買い物中」を横並びのピル型
// タブのように見せていたが、iOSのセグメントコントロール(タップで
// 切り替えるUI)に見た目が似ていて、実際にはタップで行き来できないのに
// 誤解を招く、というSOTAさんのフィードバックを受けて変更した。
// 丸を線でつないだ、タブ形状ではないステップ表示にすることで、
// 「タップできそう」に見えないようにしている

type Props = {
  stage: 'planning' | 'active'
}

export function TripStageIndicator({ stage }: Props) {
  const isActive = stage === 'active'

  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      <span
        className={`rounded-full transition-all ${
          !isActive ? 'h-2.5 w-2.5 bg-white ring-2 ring-white/20' : 'h-2 w-2 bg-white/35'
        }`}
      />
      <span className="h-px w-5 bg-white/35" />
      <span
        className={`rounded-full transition-all ${
          isActive ? 'h-2.5 w-2.5 bg-white ring-2 ring-white/20' : 'h-2 w-2 bg-white/35'
        }`}
      />
      <span className="ml-1 text-xs font-medium text-white">{isActive ? '買い物中' : '計画中'}</span>
    </div>
  )
}
