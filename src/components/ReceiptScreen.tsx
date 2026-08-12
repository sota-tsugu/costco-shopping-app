import { useRef } from 'react'
import { X, Share2 } from 'lucide-react'
import { calcDiscountPercent, formatDiscountPercent } from '../utils/discount'

// 会計完了時に表示する、擬似レシート画面。
//
// 【狙い】「購入する」を押した瞬間に淡々とリスト画面へ戻るだけでは
// 味気ないため、本物のレシートを模した画面を一度挟むことで、視覚的・
// 感覚的にも「今回の買い物が終わった」という区切りを感じられるように
// している(SOTAさんのアイデア)。
//
// 【表示するタイミングの都合】会計完了(completeCheckout)が終わると、
// tripStore側の状態(currentTrip・tripItems)はすぐに次の計画中
// トリップへ切り替わってしまう。そのため、このレシートに使うデータは
// CartScreen側で会計完了「前」の時点のスナップショットとして作り、
// App.tsx側の状態として持たせている(画面の切り替わり(カート→リスト)
// と競合させず、レシートを独立したオーバーレイとして表示するため)。
//
// 【商標への配慮】実際のコストコのレシートのロゴ・書体・レイアウトを
// そのまま再現するのではなく、「継家オリジナルのレシート」という
// 独自デザインにしている(スプラッシュ画面の「COSTCO GO」バッジと
// 同じ考え方)。
//
// 【画像として保存する仕組み】新しい外部ライブラリを追加せず、ブラウザ
// 標準のCanvas APIで画面上の見た目を直接再描画して画像化している
// (drawReceiptToCanvasを参照。他のグラフ表示で外部ライブラリを使わず
// 自前でSVGを組み立てているのと同じ方針)。保存はWeb Share API
// (navigator.share)で共有シートを開き、「写真に保存」「家族に送る」等を
// その場で選べるようにしている。共有APIが使えない環境(主にPC)では、
// ファイルのダウンロードにフォールバックする

export type ReceiptItem = {
  name: string
  price: number
  amount: number | null
  unit: string | null
  quantity: number
  isOnSale: boolean
  /** セールだった場合の通常価格(割引率の表示に使う) */
  regularPrice: number | null
}

export type ReceiptData = {
  storeName: string | null
  /** 会計完了日時(ISO文字列) */
  completedAt: string
  /** 買い物開始日時(ISO文字列)。所要時間の計算に使う */
  startedAt: string | null
  budget: number
  items: ReceiptItem[]
  total: number
  /** 前回完了した買い物の合計金額(無ければnull) */
  lastTripTotal: number | null
}

type Props = {
  data: ReceiptData
  onClose: () => void
}

const PAPER_BG = '#fdfcf7'
const INK = '#2c2c2a'
const BADGE_BLUE = '#00284C'
const BADGE_RED = '#E31837'
// ギザギザ(千切り)の歯の数。JSX(clip-path)とCanvas(画像化)の両方で
// 必ず同じ値を使うよう、ここに1つだけ定義している。以前は歯の数が
// 少なく粗い印象だったため、より細かく・リアルな見た目になるよう増やした
const TORN_EDGE_TEETH = 30

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 品目名に添える、セールだったことを示す接尾辞。通常価格が分かって
// いれば割引率も一緒に表示する(画面表示・Canvas画像化の両方で使う)
function saleSuffix(item: ReceiptItem): string {
  if (!item.isOnSale) return ''
  if (item.regularPrice !== null && calcDiscountPercent(item.regularPrice, item.price) !== null) {
    return ` ※セール${formatDiscountPercent(item.regularPrice, item.price)}`
  }
  return ' ※セール'
}

function formatElapsedMinutes(startedAt: string | null, completedAt: string): string | null {
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  const end = new Date(completedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return `${Math.max(1, Math.round((end - start) / 60000))}分`
}

// レシートの縁(上下)を、紙を千切ったようなギザギザにするclip-path
function tornEdgeClipPath(teeth: number): string {
  const points: string[] = []
  const step = 100 / teeth
  points.push('0% 3%')
  for (let i = 0; i <= teeth; i++) {
    const x = i * step
    points.push(`${x.toFixed(2)}% ${i % 2 === 0 ? '0%' : '3%'}`)
  }
  points.push('100% 97%')
  for (let i = teeth; i >= 0; i--) {
    const x = i * step
    points.push(`${x.toFixed(2)}% ${i % 2 === 0 ? '100%' : '97%'}`)
  }
  return `polygon(${points.join(', ')})`
}

// tornEdgeClipPathと全く同じ形(上下3%分をギザギザにした紙の形)を、
// Canvas画像用にパスとして描いて塗りつぶす。CSSのclip-pathはCanvas
// 描画には反映されないため、画像保存用に同じ計算を別途行っている
function drawTornEdgeBackground(context: CanvasRenderingContext2D, width: number, height: number, teeth: number) {
  const step = width / teeth
  const band = height * 0.03
  context.beginPath()
  context.moveTo(0, band)
  for (let i = 0; i <= teeth; i++) {
    const x = i * step
    context.lineTo(x, i % 2 === 0 ? 0 : band)
  }
  context.lineTo(width, height - band)
  for (let i = teeth; i >= 0; i--) {
    const x = i * step
    context.lineTo(x, i % 2 === 0 ? height : height - band)
  }
  context.closePath()
  context.fillStyle = PAPER_BG
  context.fill()
}

export function ReceiptScreen({ data, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const elapsed = formatElapsedMinutes(data.startedAt, data.completedAt)
  const budgetDiff = data.budget > 0 ? data.budget - data.total : null
  const lastTripDiff = data.lastTripTotal !== null ? data.total - data.lastTripTotal : null

  async function handleShare() {
    const canvas = canvasRef.current ?? document.createElement('canvas')
    drawReceiptToCanvas(canvas, data, elapsed, budgetDiff, lastTripDiff)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      const fileName = `receipt-${data.completedAt.slice(0, 10)}.png`
      const file = new File([blob], fileName, { type: 'image/png' })

      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean
        share?: (data: ShareData) => Promise<void>
      }

      if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: '買い物レシート' })
        } catch {
          // ユーザーが共有をキャンセルした場合などはそのまま何もしない
        }
      } else {
        // 共有APIが使えない環境(主にPC)では、ファイルとしてダウンロードする
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
    }, 'image/png')
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-black/70 px-4 py-8">
      <div
        style={{ clipPath: tornEdgeClipPath(TORN_EDGE_TEETH), fontFamily: "'Courier New', monospace" }}
        className="w-full max-w-[300px] bg-[#fdfcf7] px-5 pb-8 pt-6 text-[#2c2c2a] shadow-xl"
      >
        <div className="mb-2.5 text-center">
          <div
            style={{ backgroundColor: BADGE_BLUE, color: BADGE_RED }}
            className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
          >
            GO
          </div>
          <div className="text-sm font-bold tracking-wide">継家 買い物レシート</div>
          {data.storeName && <div className="mt-0.5 text-xs text-[#666]">{data.storeName}</div>}
          <div className="mt-0.5 text-[10px] text-[#888]">
            {formatDateTime(data.completedAt)}
            {elapsed && `　所要時間 ${elapsed}`}
          </div>
        </div>

        <div className="my-2 border-t border-dashed border-[#999]" />

        <ul className="space-y-1.5 text-[11px] leading-relaxed">
          {data.items.map((item, i) => (
            <li key={i}>
              <div className="flex justify-between">
                <span className="min-w-0 flex-1 truncate pr-2">
                  {item.name}
                  {saleSuffix(item)}
                </span>
                <span className="shrink-0">¥{(item.price * item.quantity).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[#888]">
                <span>
                  &nbsp;&nbsp;{item.quantity}点 x ¥{item.price.toLocaleString()}
                  {item.amount !== null && ` (${item.amount}${item.unit ?? ''})`}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <div className="my-2.5 border-t border-dashed border-[#999]" />

        <div className="flex justify-between text-base font-bold">
          <span>合計</span>
          <span>¥{data.total.toLocaleString()}</span>
        </div>
        {budgetDiff !== null && (
          <div className={`mt-1 flex justify-between text-[10px] ${budgetDiff >= 0 ? 'text-[#3b6d11]' : 'text-[#a32d2d]'}`}>
            <span>予算¥{data.budget.toLocaleString()}のうち</span>
            <span>
              {budgetDiff >= 0 ? '-' : '+'}¥{Math.abs(budgetDiff).toLocaleString()}
            </span>
          </div>
        )}
        {lastTripDiff !== null && (
          <div className="mt-0.5 flex justify-between text-[10px] text-[#888]">
            <span>前回より</span>
            <span>
              {lastTripDiff === 0 ? '同じ' : `${lastTripDiff > 0 ? '+' : '-'}¥${Math.abs(lastTripDiff).toLocaleString()}`}
            </span>
          </div>
        )}

        <div className="my-3 border-t border-dashed border-[#999]" />

        <p className="text-center text-[10px] leading-relaxed text-[#666]">
          ご利用ありがとうございました
          <br />
          またのお買い物をお待ちしております
        </p>

        <div className="mt-3 flex justify-center gap-[2px]">
          {Array.from({ length: 28 }).map((_, i) => (
            <div key={i} style={{ width: i % 3 === 0 ? 3 : 1, height: 22, backgroundColor: INK }} />
          ))}
        </div>
      </div>

      <div className="flex w-full max-w-[300px] flex-col gap-2.5">
        <button
          onClick={handleShare}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow active:bg-slate-100"
        >
          <Share2 className="h-4 w-4" />
          保存する
        </button>
        <button
          onClick={onClose}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/40 px-4 py-3 text-sm font-medium text-white active:bg-white/10"
        >
          <X className="h-4 w-4" />
          リストへ戻る
        </button>
      </div>

      {/* 画像化専用の非表示キャンバス。画面表示用のDOMとは別に、
          同じ内容をCanvas APIで描き直して画像(PNG)を作る */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

/**
 * 画面表示中のレシートと同じ内容を、Canvas APIで直接描画する。
 * 外部ライブラリ(html2canvas等)を使わず、フォント・線・テキストを
 * 手動で描くことで、新しい依存関係を増やさずに画像保存を実現している。
 * レイアウトの数値は、上のJSX側の見た目に近づけているが、Canvas描画は
 * pxの絶対値指定になるため、完全に一致はしない(実用上問題ないレベル)
 */
function drawReceiptToCanvas(
  canvas: HTMLCanvasElement,
  data: ReceiptData,
  elapsed: string | null,
  budgetDiff: number | null,
  lastTripDiff: number | null,
) {
  const SCALE = 2 // 高解像度で保存するための倍率
  const WIDTH = 300 * SCALE
  const PADDING = 20 * SCALE
  const LINE_H = 15 * SCALE
  const ITEM_BLOCK_H = LINE_H * 2

  // 【下端が見切れる不具合の修正】以前はheaderH・footerHを固定の概算値
  // (92px・150px相当)にしていたが、実際の描画量(店舗名の有無・予算差額・
  // 前回比較の有無で行数が変わる)とズレることがあり、行が多い場合に
  // バーコードの下部がキャンバスからはみ出て見切れてしまっていた。
  // ここで実際の描画ロジックと全く同じ計算式を使うことで、見積もりと
  // 実描画を常に一致させている(下に少し余白も足している)
  const badgeR = 17 * SCALE
  let headerH = PADDING
  headerH += badgeR * 2 + 8 * SCALE // GOバッジ
  headerH += 15 * SCALE // タイトル
  if (data.storeName) headerH += 13 * SCALE // 店舗名(あれば)
  headerH += 14 * SCALE // 日時・所要時間
  headerH += 14 * SCALE // 区切り線とその後の余白

  const itemsH = data.items.length * ITEM_BLOCK_H

  let footerH = 4 * SCALE + 18 * SCALE // 区切り線前後の余白
  footerH += 16 * SCALE // 合計
  if (budgetDiff !== null) footerH += 13 * SCALE
  if (lastTripDiff !== null) footerH += 13 * SCALE
  footerH += 8 * SCALE + 20 * SCALE // 区切り線前後の余白
  footerH += 13 * SCALE + 22 * SCALE // お礼メッセージ2行
  footerH += 22 * SCALE // 飾りバーコード本体の高さ
  footerH += 16 * SCALE // バーコードと紙の下端の間の余白

  const HEIGHT = headerH + itemsH + footerH

  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 背景(紙を千切ったような上下のギザギザ形に切り抜いて塗る)。
  // 画面表示側(JSX)はCSSのclip-path(tornEdgeClipPath)で見た目だけ
  // 切り抜いているが、Canvas画像化では見た目そのものを別途描く必要が
  // あるため、同じ形をパスとして描いてから塗りつぶす。canvasの背景は
  // 元々透明なので、この形の外側は保存画像でも透明になる
  // (画面上は黒背景の上に乗っているため、そこだけ見えていた形)
  drawTornEdgeBackground(ctx, WIDTH, HEIGHT, TORN_EDGE_TEETH)

  let y = PADDING

  // GOバッジ(半径はheaderHの計算で使ったbadgeRをそのまま再利用する)
  ctx.beginPath()
  ctx.arc(WIDTH / 2, y + badgeR, badgeR, 0, Math.PI * 2)
  ctx.fillStyle = BADGE_BLUE
  ctx.fill()
  ctx.fillStyle = BADGE_RED
  ctx.font = `bold ${11 * SCALE}px 'Courier New', monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('GO', WIDTH / 2, y + badgeR + 1)
  y += badgeR * 2 + 8 * SCALE

  ctx.fillStyle = INK
  ctx.font = `bold ${13 * SCALE}px 'Courier New', monospace`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('継家 買い物レシート', WIDTH / 2, y)
  y += 15 * SCALE

  if (data.storeName) {
    ctx.fillStyle = '#666'
    ctx.font = `${11 * SCALE}px 'Courier New', monospace`
    ctx.fillText(data.storeName, WIDTH / 2, y)
    y += 13 * SCALE
  }

  ctx.fillStyle = '#888'
  ctx.font = `${10 * SCALE}px 'Courier New', monospace`
  const dateLine = `${formatDateTime(data.completedAt)}${elapsed ? `　所要時間 ${elapsed}` : ''}`
  ctx.fillText(dateLine, WIDTH / 2, y)
  y += 14 * SCALE

  // 【TypeScriptの制約への対応】この関数の外側で定義しているctxを
  // そのまま使うと、「if (!ctx) return」でnullではないと確認済みでも、
  // 関数(クロージャ)をまたぐとTypeScriptがその確認を覚えていてくれず
  // 「ctxはnullかもしれない」というビルドエラーになる。そのため、
  // ctxを引数として明示的に受け取る形にしている
  function dashedLine(context: CanvasRenderingContext2D, yPos: number) {
    context.save()
    context.strokeStyle = '#999'
    context.setLineDash([4 * SCALE, 3 * SCALE])
    context.beginPath()
    context.moveTo(PADDING, yPos)
    context.lineTo(WIDTH - PADDING, yPos)
    context.stroke()
    context.restore()
  }

  dashedLine(ctx, y)
  y += 14 * SCALE

  // 品目一覧
  ctx.textAlign = 'left'
  for (const item of data.items) {
    ctx.fillStyle = INK
    ctx.font = `${11 * SCALE}px 'Courier New', monospace`
    const fullName = `${item.name}${saleSuffix(item)}`
    let name = fullName
    const maxNameWidth = WIDTH - PADDING * 2 - 70 * SCALE
    let wasTruncated = false
    while (ctx.measureText(name).width > maxNameWidth && name.length > 1) {
      name = name.slice(0, -1)
      wasTruncated = true
    }
    if (wasTruncated) name += '…'
    ctx.fillText(name, PADDING, y)
    ctx.textAlign = 'right'
    ctx.fillText(`¥${(item.price * item.quantity).toLocaleString()}`, WIDTH - PADDING, y)
    ctx.textAlign = 'left'
    y += LINE_H

    ctx.fillStyle = '#888'
    ctx.font = `${10 * SCALE}px 'Courier New', monospace`
    const sub = `  ${item.quantity}点 x ¥${item.price.toLocaleString()}${
      item.amount !== null ? ` (${item.amount}${item.unit ?? ''})` : ''
    }`
    ctx.fillText(sub, PADDING, y)
    y += LINE_H
  }

  y += 4 * SCALE
  dashedLine(ctx, y)
  y += 18 * SCALE

  ctx.fillStyle = INK
  ctx.font = `bold ${15 * SCALE}px 'Courier New', monospace`
  ctx.fillText('合計', PADDING, y)
  ctx.textAlign = 'right'
  ctx.fillText(`¥${data.total.toLocaleString()}`, WIDTH - PADDING, y)
  ctx.textAlign = 'left'
  y += 16 * SCALE

  if (budgetDiff !== null) {
    ctx.fillStyle = budgetDiff >= 0 ? '#3b6d11' : '#a32d2d'
    ctx.font = `${10 * SCALE}px 'Courier New', monospace`
    ctx.fillText(`予算¥${data.budget.toLocaleString()}のうち`, PADDING, y)
    ctx.textAlign = 'right'
    ctx.fillText(`${budgetDiff >= 0 ? '-' : '+'}¥${Math.abs(budgetDiff).toLocaleString()}`, WIDTH - PADDING, y)
    ctx.textAlign = 'left'
    y += 13 * SCALE
  }

  if (lastTripDiff !== null) {
    ctx.fillStyle = '#888'
    ctx.font = `${10 * SCALE}px 'Courier New', monospace`
    ctx.fillText('前回より', PADDING, y)
    ctx.textAlign = 'right'
    ctx.fillText(
      lastTripDiff === 0 ? '同じ' : `${lastTripDiff > 0 ? '+' : '-'}¥${Math.abs(lastTripDiff).toLocaleString()}`,
      WIDTH - PADDING,
      y,
    )
    ctx.textAlign = 'left'
    y += 13 * SCALE
  }

  y += 8 * SCALE
  dashedLine(ctx, y)
  y += 20 * SCALE

  ctx.fillStyle = '#666'
  ctx.font = `${10 * SCALE}px 'Courier New', monospace`
  ctx.textAlign = 'center'
  ctx.fillText('ご利用ありがとうございました', WIDTH / 2, y)
  y += 13 * SCALE
  ctx.fillText('またのお買い物をお待ちしております', WIDTH / 2, y)
  y += 22 * SCALE

  // 飾りバーコード
  ctx.fillStyle = INK
  const barCount = 28
  const barGap = 2 * SCALE
  const totalBarWidth = barCount * barGap
  let barX = (WIDTH - totalBarWidth) / 2
  for (let i = 0; i < barCount; i++) {
    const w = i % 3 === 0 ? 3 * SCALE : 1 * SCALE
    ctx.fillRect(barX, y, w, 22 * SCALE)
    barX += barGap
  }
}
