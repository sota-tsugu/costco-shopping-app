// 価格の比較(値上がり/値下がり判定)に関する共通ロジック。
// ProductHistoryModal(購入履歴画面)とBudgetSetupScreen(予算設定画面の
// 「今回買う予定」リスト)の両方で使うため、ここに切り出している。
//
// 比較は「支払った金額そのもの」ではなく、できる限り
// 「内容量あたりの単価」で行う。パッケージサイズが変わることがあるため、
// 内容量・単位は商品マスターの現在値ではなく、購入した時点の値を
// Purchaseテーブルにスナップショットとして記録している(cartStore.ts参照)。

export type ComparableValue = {
  /** 単位あたり単価ならその値、単価計算ができない場合は支払い価格そのもの */
  value: number
  /** 単位あたり単価の場合の単位(例: "g")。支払い価格そのものの場合はnull */
  unitLabel: string | null
}

/** 内容量・単位が分かれば単位あたり単価を、分からなければ価格そのものを比較値として使う */
export function toComparableValue(row: {
  price: number
  amount: number | null
  unit: string | null
}): ComparableValue {
  if (row.amount && row.amount > 0 && row.unit) {
    return { value: row.price / row.amount, unitLabel: row.unit }
  }
  return { value: row.price, unitLabel: null }
}

/** 単位が一致する場合だけ比較する(gとmlのように単位が違うものは比較しない) */
export function diffComparableValues(current: ComparableValue, previous: ComparableValue) {
  if (current.unitLabel !== previous.unitLabel) return null
  return { diff: current.value - previous.value, unitLabel: current.unitLabel }
}

export function formatComparable({ value, unitLabel }: ComparableValue): string {
  const formatted = value.toLocaleString(undefined, {
    maximumFractionDigits: unitLabel ? 2 : 0,
  })
  return unitLabel ? `¥${formatted}/${unitLabel}` : `¥${formatted}`
}
