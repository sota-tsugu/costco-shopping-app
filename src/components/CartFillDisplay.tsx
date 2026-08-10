import { useMemo } from 'react'
import cartFrontMesh from '../assets/cart-icon-front.png'

// カートのイラスト(cart-icon-front.png、背景透明)の中に、カート内商品の
// 点数ぶん絵文字をランダムに敷き詰めて表示する。元画像(746x700px)を
// 実際に計測して求めた、バスケット内側のおおよその範囲(台形の4隅、
// 画像サイズに対する比率)をもとに位置を計算している。
//
// 【配置ロジックの考え方】
// - バスケットの底(手前)からカートの縁に向かって、行ごとに敷き詰めていく
// - 縁を超えたら、同じ横幅のまま上に積み上がっていく(山盛り。件数の上限なし)
// - ただし山盛りの「高さ」には天井(MOUND_CEILING_PERCENT)があり、天井に
//   達した分は同じ高さ付近に密度高く散らす(画面上部の「バーコードで
//   追加」ボタンに商品が重ならないようにするため。件数自体は減らさない)
// - 大きさ(1.5〜2倍)・重なり・傾きはすべて商品ごとにランダム
// - 同じindexには常に同じ乱数(seededRandom)を使うことで、商品が増減しても
//   既存の商品の見た目が変わらないようにしている
//
// mcp visualizeツールでプロトタイプを作り、SOTAさんと確認した配置ロジックを
// そのまま実装している(costco_app_concept_v3.mdの「画面B」を参照)
//
// 【カゴの網目を商品より手前に見せる工夫】
// 絵文字をそのままカート写真の上に重ねると、商品がカゴの網目より前面に
// 出てしまい、「カゴの中に入っている」ようには見えない(SOTAさんの
// フィードバックで判明)。そこで、cart-icon.jpgの白背景を透明化した
// cart-icon-front.png(このファイルと同じ内容だが背景だけ透明)を
// 用意し、バスケット内側の範囲(台形)だけを切り抜いて、絵文字の
// さらに上に重ねている。網目の線がある部分は不透明(商品を隠す)、
// 線が無い隙間は透明(商品が見える)ため、商品が網目の奥にあるように見える
//
// 【土台にも透明背景の画像を使う】以前は土台(一番下のレイヤー)に
// 白背景のcart-icon.jpgをそのまま使っていたが、画面の背景色
// (bg-slate-50)とのわずかな色差で、写真の四角い縁が「シールを
// 貼ったよう」に見えてしまう問題があった(SOTAさんのフィードバックで
// 判明)。土台にも同じ透明背景のcart-icon-front.pngを使うことで、
// 四角い縁自体をなくし、カートの形だけが画面に直接浮かんで見えるようにした

const BASKET_TOP_LEFT: [number, number] = [0.0268, 0.2357]
const BASKET_TOP_RIGHT: [number, number] = [0.7909, 0.0929]
const BASKET_BOTTOM_LEFT: [number, number] = [0.0402, 0.5071]
const BASKET_BOTTOM_RIGHT: [number, number] = [0.6434, 0.55]

const EMOJI_POOL = ['🥛', '🧃', '📦', '🍞', '🧀', '🥩', '🥦', '🍊', '🥫', '🥚', '🍫', '🧻', '🍎', '🥔', '🧴', '🍗']

const ITEMS_PER_ROW = 5
const ROW_STEP = 0.16
// 一番下の行の基準位置。1.0(バスケットの底のライン)ぴったりにすると、
// 商品の絵文字の下半分がカゴの底を突き抜けて見えてしまうため、少し
// 手前(小さい値)に余白を持たせている。アイコンサイズを1.2倍にした分、
// 突き抜けやすくなったため、その分だけ余白も広めに取り直している
const V_BOTTOM = 0.86

// 山盛りが上に伸びていく高さの天井(画像内でのtop位置、%)。件数自体には
// 上限を設けないが(仕様通り)、見た目の高さには天井を設け、画面上部の
// 「バーコードで追加」ボタンに商品が重ならないようにしている。天井に
// 達した分は、同じ高さ付近にランダムに散らして密度を上げる形で表現する
const MOUND_CEILING_PERCENT = -6
const MOUND_CEILING_BAND_PERCENT = 8

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// u: 0(左)〜1(右)、v: 0(カートの縁)〜1(バスケットの底)を、実際の画像内の
// 位置(0〜1の比率)に変換する。v<0(縁を超えた分)にも自然に対応できるよう、
// x方向だけ0未満を切り上げて幅が過剰に狭まらないようにしている(呼び出し側で処理)
function basketX(u: number, v: number) {
  return lerp(lerp(BASKET_TOP_LEFT[0], BASKET_TOP_RIGHT[0], u), lerp(BASKET_BOTTOM_LEFT[0], BASKET_BOTTOM_RIGHT[0], u), v)
}

function basketY(u: number, v: number) {
  return lerp(lerp(BASKET_TOP_LEFT[1], BASKET_TOP_RIGHT[1], u), lerp(BASKET_BOTTOM_LEFT[1], BASKET_BOTTOM_RIGHT[1], u), v)
}

// indexから再現性のある「ランダム」値を作る(mulberry32)。商品数が増減しても
// 既存の商品の見た目(位置・大きさ・向き)が変わらないようにするため
function seededRandom(n: number) {
  let t = (n += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

type ItemStyle = {
  key: number
  leftPercent: number
  topPercent: number
  scale: number
  rotateDeg: number
  emoji: string
}

function computeItemStyle(index: number): ItemStyle {
  const row = Math.floor(index / ITEMS_PER_ROW)
  const col = index % ITEMS_PER_ROW
  const r1 = seededRandom(index * 9 + 1)
  const r2 = seededRandom(index * 9 + 2)
  const r3 = seededRandom(index * 9 + 3)
  const r4 = seededRandom(index * 9 + 4)
  const r5 = seededRandom(index * 9 + 5)
  const r6 = seededRandom(index * 9 + 6)

  // v: V_BOTTOM=バスケットの底付近(手前)、0=カートの縁。0を下回ると縁を超えて山盛りになる
  const v = V_BOTTOM - row * ROW_STEP + (r1 - 0.5) * 0.06
  const vForWidth = Math.max(v, 0)
  let u = (col + 0.5) / ITEMS_PER_ROW + (r2 - 0.5) * 0.34
  // 左右の端ぎりぎり(0や1に近い位置)だと、商品の絵文字の左右端が
  // 網目の外(白い背景側)に突き抜けて見えてしまうため、両端に余白を
  // 持たせている(底の突き抜け対策(V_BOTTOM)と同じ考え方)。
  // 「山盛りで賑やかに見える」ことを優先し、余白は最小限に留めている
  u = Math.min(Math.max(u, 0.06), 0.94)

  // 天井(MOUND_CEILING_PERCENT)を超える高さになる分は、そのまま上に
  // 伸ばさず、天井付近の帯(MOUND_CEILING_BAND_PERCENT)にランダムに
  // 散らす。これにより件数は減らさずに、見た目の高さだけ頭打ちにできる
  const rawTopPercent = basketY(u, v) * 100
  const topPercent =
    rawTopPercent < MOUND_CEILING_PERCENT
      ? MOUND_CEILING_PERCENT + r6 * MOUND_CEILING_BAND_PERCENT
      : rawTopPercent

  return {
    key: index,
    leftPercent: basketX(u, vForWidth) * 100,
    topPercent,
    scale: 1.5 + r3 * 0.5,
    rotateDeg: (r4 - 0.5) * 50,
    emoji: EMOJI_POOL[Math.floor(r5 * EMOJI_POOL.length)],
  }
}

// バスケット内側の台形部分だけを切り抜くためのclip-path(%指定)。
// 商品の配置に使っているBASKET_TOP_LEFT等の4点をそのまま使うと、実際の
// 網目の描画範囲より少し内側になってしまい、切り抜きの境目で網目の
// 縦線が途中で途切れて見えることがあった(境目のすぐ外側は元の写真が
// そのまま見えるはずが、そこに商品の絵文字が重なって線を隠してしまうため)。
// そのため、切り抜きの範囲は商品の配置範囲より少し広めに取っている
// (写真自体は透明背景のPNGなので、広めに切り抜いても網目や縁以外の
// 余計なものが映り込むことはない)
const CLIP_MARGIN_X = 0.04
const CLIP_MARGIN_Y = 0.03
const CLIP_TOP_LEFT: [number, number] = [BASKET_TOP_LEFT[0] - CLIP_MARGIN_X, BASKET_TOP_LEFT[1] - CLIP_MARGIN_Y]
const CLIP_TOP_RIGHT: [number, number] = [BASKET_TOP_RIGHT[0] + CLIP_MARGIN_X, BASKET_TOP_RIGHT[1] - CLIP_MARGIN_Y]
const CLIP_BOTTOM_LEFT: [number, number] = [BASKET_BOTTOM_LEFT[0] - CLIP_MARGIN_X, BASKET_BOTTOM_LEFT[1] + CLIP_MARGIN_Y]
const CLIP_BOTTOM_RIGHT: [number, number] = [BASKET_BOTTOM_RIGHT[0] + CLIP_MARGIN_X, BASKET_BOTTOM_RIGHT[1] + CLIP_MARGIN_Y]

const BASKET_CLIP_PATH = `polygon(${[CLIP_TOP_LEFT, CLIP_TOP_RIGHT, CLIP_BOTTOM_RIGHT, CLIP_BOTTOM_LEFT]
  .map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`)
  .join(', ')})`

type Props = {
  /** カートに入っている商品の点数(数量の合計) */
  itemCount: number
}

export function CartFillDisplay({ itemCount }: Props) {
  const items = useMemo(() => {
    const list: ItemStyle[] = []
    for (let i = 0; i < itemCount; i++) list.push(computeItemStyle(i))
    return list
  }, [itemCount])

  return (
    <div className="relative mx-auto w-full max-w-xs" style={{ containerType: 'inline-size' }}>
      <img src={cartFrontMesh} alt="カート" className="w-full" />
      <div className="pointer-events-none absolute inset-0">
        {items.map((item) => (
          <span
            key={item.key}
            className="absolute cart-item-pop"
            style={{ left: `${item.leftPercent}%`, top: `${item.topPercent}%` }}
          >
            <span
              style={{
                display: 'inline-block',
                fontSize: '10.8cqw',
                lineHeight: 1,
                transform: `scale(${item.scale}) rotate(${item.rotateDeg}deg)`,
              }}
            >
              {item.emoji}
            </span>
          </span>
        ))}
      </div>
      <img
        src={cartFrontMesh}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ clipPath: BASKET_CLIP_PATH }}
      />
    </div>
  )
}
