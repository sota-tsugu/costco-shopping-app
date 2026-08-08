// 「Open ... Facts」シリーズは、同じ非営利団体(Open Food Facts)が運営する、
// 無料・APIキー不要の商品データベース群。ジャンルごとにサイト(ドメイン)が
// 分かれているが、API仕様はどれも共通のため、ドメインを変えるだけで
// 同じように使える。
// - Open Food Facts(world.openfoodfacts.org):食品・飲料
// - Open Products Facts(world.openproductsfacts.org):食品・化粧品・
//   ペットフード以外の一般商品(洗剤・紙製品・日用品など)
// - Open Beauty Facts(world.openbeautyfacts.org):化粧品・ボディケア用品
//
// 世界中のユーザーが登録している情報のため、コストコの定番商品(特に
// カークランドなどのプライベートブランド)はヒットしないことが多いが、
// 全国的に流通しているブランド品はヒットする可能性がある。
//
// バーコードスキャン機能では、次の順番で商品情報を探す設計にしている:
// ①自分たちの過去のスキャン履歴(tripStore.fetchTripItemByBarcode)
// ②Open Food Facts(食品・飲料)
// ③Open Products Facts(食品・化粧品以外の一般商品)
// ④Open Beauty Facts(化粧品・ボディケア用品)
// ⑤どれも見つからなければ手入力

export type OpenFactsResult = {
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
 * 「Open ... Facts」系サイトのうち指定したドメインへ、バーコード番号で
 * 商品情報を問い合わせる共通処理。見つからない場合・通信エラーの場合は
 * nullを返す(呼び出し側は次の候補、最終的には手入力にフォールバックする)
 */
async function fetchFromOpenFactsSite(domain: string, barcode: string): Promise<OpenFactsResult | null> {
  try {
    const response = await fetch(
      `https://${domain}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,quantity`,
    )
    if (!response.ok) return null
    const data = await response.json()
    if (data.status !== 1 || !data.product) return null

    const name = (data.product.product_name ?? '').trim()
    if (name === '') return null

    const { amount, unit } = parseQuantity(data.product.quantity)
    return { name, amount, unit }
  } catch {
    // オフライン・通信エラー時も静かにnullを返し、次の候補に進めるようにする
    return null
  }
}

/** Open Food Facts(食品・飲料)で検索する */
export function fetchOpenFoodFactsProduct(barcode: string): Promise<OpenFactsResult | null> {
  return fetchFromOpenFactsSite('world.openfoodfacts.org', barcode)
}

/** Open Products Facts(食品・化粧品・ペットフード以外の一般商品)で検索する */
export function fetchOpenProductsFactsProduct(barcode: string): Promise<OpenFactsResult | null> {
  return fetchFromOpenFactsSite('world.openproductsfacts.org', barcode)
}

/** Open Beauty Facts(化粧品・ボディケア用品)で検索する */
export function fetchOpenBeautyFactsProduct(barcode: string): Promise<OpenFactsResult | null> {
  return fetchFromOpenFactsSite('world.openbeautyfacts.org', barcode)
}
