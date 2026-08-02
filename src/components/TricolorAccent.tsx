// コストコのロゴカラー(赤・白・青のトリコロール)をイメージした、
// 画面上部に置く細いアクセントライン。「コストコ専用アプリ」らしさを
// さりげなく出すための装飾で、機能的な意味は持たない。
// ShoppingScreen/BudgetSetupScreenの固定ヘッダーの一番上に共通で使う。

export function TricolorAccent() {
  return (
    <div className="flex h-1 w-full" aria-hidden="true">
      <div className="flex-1 bg-costco-red-500" />
      <div className="flex-1 bg-white" />
      <div className="flex-1 bg-costco-blue-500" />
    </div>
  )
}
