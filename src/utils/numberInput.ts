// 金額(予算・価格)の入力欄を、桁区切りのカンマ付きで表示するための
// ヘルパー。HTMLの<input type="number">はカンマを含む値を受け付けない
// (ブラウザ側で無効な値として弾かれる)ため、<input type="text"
// inputMode="numeric">にした上で、内部の状態は数字だけの文字列で持ち、
// 表示するタイミングでカンマを付ける、という形にしている。
//
// 【使い方】stateには常に数字だけの文字列(例:"30000")を持たせる。
// 入力欄には value={formatWithCommas(state)} を渡し、onChangeでは
// setState(toDigitsOnly(e.target.value)) のようにして数字だけに戻してから保存する

/** 入力された文字列から、数字以外の文字(カンマなど)を取り除く */
export function toDigitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

/** 数字だけの文字列に、桁区切りのカンマを付けて表示用にする */
export function formatWithCommas(digits: string): string {
  if (digits === '') return ''
  return Number(digits).toLocaleString('ja-JP')
}
