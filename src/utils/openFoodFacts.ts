// Open Food Facts(https://world.openfoodfacts.org/)は、バーコード番号から
// 食品・飲料の商品名などを検索できる、無料・APIキー不要の商品データベース。
// 世界中のユーザーが登録している情報のため、コストコの定番商品(特に
// カークランドなどのプライベートブランド)はヒットしないことが多いが、
// 全国的に流通しているブランド品(飲料・菓子など)はヒットする可能性がある。
//
// バーコードスキャン機能では、次の順番で商品情報を探す設計にしている:
// ①自分たちの過去のスキャン履歴(tripStore.fetchTripItemByBarcode)
// ②このOpen Food Facts(全国的なブランド品向け)
// ③どちらも見つからなければ手入力
//
// 【注意】洗剤・紙製品・家電など食品以外のカテゴリはこのデータベースの
// 対象外のため、ヒットしない。その場合も手入力にフォールバックする想定

export type OpenFoodFactsResult = {
  name: string
  amount: number | null
  unit: string | null
}

// "500 g" や "1.5 L" のような自由記述の内容量表記から、数値と単位を
// ざっくり分離する(必ず正確に取れるとは限らないため、あくまで入力補助)
function parseQuantity(quantity: string | undefined): { amount: number | null; unit: string | null } {
  if (!quantity) return { amount: null, unit: null }
  const match = quantity.trim().match(/^([\d.,]+)\s*(.*)$/)
  if (!match) return { amount: null, unit: null }
  const amount = Number(match[1].replace(',', '.'))
  const unit = match[2].trim()
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    unit: unit !== '' ? unit : null,
  }
}

/**
 * バーコード番号からOpen Food Factsで商品情報を検索する。
 * 見つからない場合・通信エラーの場合はnullを返す(呼び出し側は手入力に
 * フォールバックする)
 */
export async function fetchOpenFoodFactsProduct(barcode: string): Promise<OpenFoodFactsResult | null> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,quantity`,
    )
    if (!response.ok) return null
    const data = await response.json()
    if (data.status !== 1 || !data.product) return null

    const name = (data.product.product_name ?? '').trim()
    if (name === '') return null

    const { amount, unit } = parseQuantity(data.product.quantity)
    return { name, amount, unit }
  } catch {
    // オフライン・通信エラー時も静かにnullを返し、手入力に進めるようにする
    return null
  }
}
