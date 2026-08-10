// アプリ起動後、最初に表示する「あいさつ画面」。
// 開いたら即座に今回買うものリストが出てくると味気ないため、SOTAさんの
// 要望で、遊び心のある短いアニメーションを挟んでから本編に進む形にした。
//
// 【演出の流れ】赤白のストライプと格子状のカートが斜めに勢いよく
// 滑り込み、「COSTCO GO」の文字が浮かんだ後にフェードアウトし、
// 中央に白い丸バッジ(大きく太い「GO」の文字)がポップインする。
// バッジをタップすると今回買うものリストへ進む。
//
// 【デザイン上の注意】コストコの公式ロゴ(斜めストライプの商標デザイン)
// はそのまま使わず、独自の配色・文字組みだけで「勢いのある雰囲気」を
// 表現している(SOTAさんと相談の上で決定)。
//
// mcp visualizeツールで試作を重ね、確認した内容をそのまま実装している。
// アニメーションはCSSキーフレーム(src/index.cssのsplash-*)で制御している

type Props = {
  /** バッジをタップして本編(今回買うものリスト)へ進む時に呼ぶ */
  onContinue: () => void
}

export function SplashScreen({ onContinue }: Props) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-costco-blue-800">
      <div className="splash-stripe-1 absolute -left-[60%] top-[22%] h-9 w-[220%] bg-costco-red-600" />
      <div className="splash-stripe-2 absolute -left-[60%] top-[34%] h-4 w-[220%] bg-white/85" />

      <div className="splash-word absolute left-1/2 top-[27%] flex -translate-x-1/2 -translate-y-1/2 rotate-[-14deg] flex-col items-center">
        <span className="text-3xl font-medium tracking-wide text-white">COSTCO GO</span>
      </div>

      <div className="splash-cart absolute left-1/2 top-[56%] w-48">
        <svg viewBox="0 0 120 100" fill="none" className="w-full">
          <polygon
            points="8,14 108,14 92,62 26,62"
            fill="none"
            stroke="#fff"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <line x1="28.4" y1="14" x2="39.2" y2="62" stroke="#fff" strokeWidth="3" />
          <line x1="48.8" y1="14" x2="52.4" y2="62" stroke="#fff" strokeWidth="3" />
          <line x1="69.2" y1="14" x2="65.6" y2="62" stroke="#fff" strokeWidth="3" />
          <line x1="89.6" y1="14" x2="78.8" y2="62" stroke="#fff" strokeWidth="3" />
          <line x1="17" y1="38" x2="100" y2="38" stroke="#fff" strokeWidth="3" />
          <rect x="26" y="66" width="46" height="8" rx="4" fill="#fff" />
          <circle cx="34" cy="86" r="9" fill="#fff" />
          <circle cx="70" cy="86" r="9" fill="#fff" />
          <path
            d="M8 14 L2 4 L14 4"
            stroke="#fff"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>

      <button
        onClick={onContinue}
        className="splash-badge absolute left-1/2 top-1/2 flex h-48 w-48 flex-col items-center justify-center rounded-full bg-white shadow-lg active:scale-95"
      >
        <span className="text-8xl font-black leading-none text-costco-red-600">GO</span>
      </button>
    </div>
  )
}
