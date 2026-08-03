// コストコのロゴカラー(赤・白・青のトリコロール)をイメージした、
// 画面上部に置く細いアクセントライン。「コストコ専用アプリ」らしさを
// さりげなく出すための装飾で、機能的な意味は持たない。
// 【白紙化にあたっての注記】以前は買い物系の画面のヘッダーで共通利用
// していたが、それらの画面は企画の見直しにあたり削除した。この
// コンポーネント自体はデザイン資産として残し、HouseholdSetupScreen/
// App.tsxのヘッダーで引き続き使っている。

export function TricolorAccent() {
  return (
    <div className="flex h-1 w-full" aria-hidden="true">
      <div className="flex-1 bg-costco-red-500" />
      <div className="flex-1 bg-white" />
      <div className="flex-1 bg-costco-blue-500" />
    </div>
  )
}
