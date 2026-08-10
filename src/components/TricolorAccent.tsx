// コストコのロゴカラー(赤・白・青のトリコロール)をイメージした、
// 画面上部に置く細いアクセントライン。「コストコ専用アプリ」らしさを
// さりげなく出すための装飾で、機能的な意味は持たない。
// 各画面(画面A/B/C・家族設定画面)のヘッダー上部で共通利用している。
//
// 【subtleバリアント】買い物中だけ、画面Aのヘッダー下部にも薄く同じ帯を
// 追加する使い方を想定している。上下をトリコロールの帯で挟むことで、
// 「今、買い物という1つのセッションの中にいる」感覚を出すための装飾で、
// 通常表示(ヘッダー上部)より線を細く・色を薄くしている

type Props = {
  variant?: 'default' | 'subtle'
}

export function TricolorAccent({ variant = 'default' }: Props) {
  const isSubtle = variant === 'subtle'
  return (
    <div className={`flex w-full ${isSubtle ? 'h-0.5 opacity-40' : 'h-1'}`} aria-hidden="true">
      <div className="flex-1 bg-costco-red-500" />
      <div className="flex-1 bg-white" />
      <div className="flex-1 bg-costco-blue-500" />
    </div>
  )
}
