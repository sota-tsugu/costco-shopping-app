// 「計画中→買い物中」という、実際に一方通行な2段階だけを示すピル型の
// バッジ。画面A・画面Bのヘッダーに共通で置く。
//
// 【設計意図】画面A(リスト)と画面B(カート)は、買い物中という同じ段階の
// 中で自由に行き来できる2つの見方であり、「リストを終えたらカートに
// 進む」という順番があるわけではない。そのため、この2画面を進行バーの
// 別ステップとして並べてしまうと、本来自由なはずの行き来に誤って
// 「順番」があるように見えてしまう。そこで、段階(計画中/買い物中)は
// このピルで、画面の切り替え(リスト/カート)は別のScreenPageDots
// コンポーネントで表現し、2つの意味を混同しないようにしている

type Props = {
  stage: 'planning' | 'active'
}

export function TripStageIndicator({ stage }: Props) {
  return (
    <div className="inline-flex rounded-full bg-white/15 p-0.5">
      <span
        className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
          stage === 'planning' ? 'bg-white font-medium text-costco-blue-800' : 'text-white/60'
        }`}
      >
        計画中
      </span>
      <span
        className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
          stage === 'active' ? 'bg-white font-medium text-costco-blue-800' : 'text-white/60'
        }`}
      >
        買い物中
      </span>
    </div>
  )
}
