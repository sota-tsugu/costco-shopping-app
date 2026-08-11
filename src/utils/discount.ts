// 通常価格とセール価格(実際に支払った価格)から割引率を計算するための
// 共通ユーティリティ。カート画面・購入履歴・レシートなど複数箇所で
// 同じ計算方法を使うため、ここに1つだけ実装を置いている。
//
// 通常価格が未入力(0以下)の場合や、セール価格が通常価格以上(実質
// 値引きが無い)場合はnullを返す。入力ミスなどで誤解を招く表示を
// 出さないための割り切り

export function calcDiscountPercent(regularPrice: number, price: number): number | null {
  if (regularPrice <= 0) return null
  const percent = Math.round((1 - price / regularPrice) * 100)
  if (percent <= 0) return null
  return percent
}

// バッジ等にそのまま差し込める表示用文字列("20%OFF")。
// 割引が計算できない場合は空文字を返す
export function formatDiscountPercent(regularPrice: number, price: number): string {
  const percent = calcDiscountPercent(regularPrice, price)
  return percent !== null ? `${percent}%OFF` : ''
}
