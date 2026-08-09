// 買い物中(active)の間、今どちらの画面(画面A=リスト/画面B=カート)を
// 見ているかを示す小さな2つのドット。TripStageIndicatorとは意味が違い、
// こちらは「段階の完了」ではなく「現在地」だけを表す(スワイプで
// いつでも自由に行き来できることを、進行バーのような一方通行の見た目に
// してしまわないための工夫。TripStageIndicator.tsxのコメントを参照)

type Props = {
  active: 'list' | 'cart'
}

export function ScreenPageDots({ active }: Props) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      <span className={`h-1.5 w-1.5 rounded-full ${active === 'list' ? 'bg-white' : 'bg-white/35'}`} />
      <span className={`h-1.5 w-1.5 rounded-full ${active === 'cart' ? 'bg-white' : 'bg-white/35'}`} />
    </div>
  )
}
