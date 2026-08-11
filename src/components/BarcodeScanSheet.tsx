import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { X, Camera } from 'lucide-react'
import { fetchTripItemByBarcode, type Product } from '../store/tripStore'
import {
  fetchOpenFoodFactsProduct,
  fetchOpenProductsFactsProduct,
  fetchOpenBeautyFactsProduct,
} from '../utils/openFactsDatabases'
import { toDigitsOnly, formatWithCommas } from '../utils/numberInput'

// バーコードスキャンで、計画リストに無かった商品をその場で追加するための
// フルスクリーンシート。カメラでバーコードを読み取ったら、次の順番で
// 商品情報を探しに行く(costco_app_concept_v3.mdの方針、SOTAさんと相談の上で決定):
// ①自分たちの過去のスキャン履歴(tripItems内のbarcode一致)
// ②Open Food Facts(無料・食品飲料中心の外部データベース。カークランド等の
//   プライベートブランドは弱いが、全国区のブランド品はヒットすることがある)
// ③Open Products Facts(食品・化粧品以外の一般商品。洗剤・紙製品など)
// ④Open Beauty Facts(化粧品・ボディケア用品)
// ⑤どれも見つからなければ、バーコード番号だけ分かっている状態で手入力
//
// ②〜④はいずれも同じ運営元(Open Food Facts)による無料・APIキー不要の
// 姉妹データベースで、ジャンルごとにサイトが分かれている
//
// どのパターンでも、最後は必ず内容を確認・編集できる画面を経由してから
// 「カートに追加する」を押す(読み取り間違い・価格の変動に備えるため)

type Phase = 'scanning' | 'looking-up' | 'confirming' | 'camera-error'

type ScanControls = { stop: () => void }

type Props = {
  existingProducts: Product[]
  onClose: () => void
  onSubmit: (details: {
    name: string
    category: string | null
    price: number
    amount: number | null
    unit: string | null
    quantity: number
    barcode: string
  }) => Promise<void>
}

export function BarcodeScanSheet({ existingProducts, onClose, onSubmit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<ScanControls | null>(null)

  const [phase, setPhase] = useState<Phase>('scanning')
  const [barcode, setBarcode] = useState('')
  const [lookupNote, setLookupNote] = useState<string | null>(null)
  const [lookupMatched, setLookupMatched] = useState(false)

  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [isSaving, setIsSaving] = useState(false)

  // カメラを確実に止めるための処理。stop()を呼んでいてもcontrolsRefへの
  // 反映が(タイミング的に)間に合っていない場合に備え、video要素に
  // つながっているカメラの映像ストリーム(MediaStreamTrack)を直接止める
  // 処理も合わせて行う。これを怠ると、シートを閉じた後もカメラが
  // 裏側で動き続けてしまう(SOTAさんのフィードバックで判明した不具合)
  function stopCamera() {
    controlsRef.current?.stop()
    controlsRef.current = null
    const stream = videoRef.current?.srcObject
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }

  useEffect(() => {
    if (phase !== 'scanning') return
    let cancelled = false
    const reader = new BrowserMultiFormatReader()

    reader
      .decodeFromConstraints(
        { audio: false, video: { facingMode: 'environment' } },
        videoRef.current!,
        (result, _error, controls) => {
          controlsRef.current = controls
          if (result && !cancelled) {
            cancelled = true
            stopCamera()
            void handleDecoded(result.getText())
          }
        },
      )
      .then((controls) => {
        // 1フレーム目のコールバックが呼ばれる前に閉じられた場合に備え、
        // Promiseの解決時点でもcontrolsを取得しておく
        controlsRef.current = controls
        if (cancelled) stopCamera()
      })
      .catch(() => {
        if (!cancelled) setPhase('camera-error')
      })

    return () => {
      cancelled = true
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // シート自体がアンマウントされる時(バーコードスキャン以外の理由での
  // クローズも含む)にも、念のためカメラを止める
  useEffect(() => {
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDecoded(code: string) {
    setBarcode(code)
    setPhase('looking-up')

    // ①自分たちの過去のスキャン履歴を優先して探す(全カテゴリ対応・確実)
    const history = await fetchTripItemByBarcode(code)
    if (history) {
      setName(history.name)
      setCategory(history.category ?? '')
      setPrice(history.price !== null ? String(history.price) : '')
      setAmount(history.amount !== null ? String(history.amount) : '')
      setUnit(history.unit ?? '')
      setLookupMatched(true)
      setLookupNote('前回スキャンした内容を呼び出しました。内容が変わっていれば修正してください。')
      setPhase('confirming')
      return
    }

    // ②〜④Open Food Facts系の姉妹データベースを順に試す
    // (食品→一般商品→化粧品の順。カテゴリの絞り込みはせず、単純に順番に問い合わせる)
    const externalSources: Array<{
      fetch: (code: string) => ReturnType<typeof fetchOpenFoodFactsProduct>
      label: string
    }> = [
      { fetch: fetchOpenFoodFactsProduct, label: 'Open Food Facts' },
      { fetch: fetchOpenProductsFactsProduct, label: 'Open Products Facts' },
      { fetch: fetchOpenBeautyFactsProduct, label: 'Open Beauty Facts' },
    ]
    for (const source of externalSources) {
      const result = await source.fetch(code)
      if (result) {
        setName(result.name)
        setAmount(result.amount !== null ? String(result.amount) : '')
        setUnit(result.unit ?? '')
        setLookupMatched(true)
        setLookupNote(`${source.label}から商品名を取得しました。価格などは手入力してください。`)
        setPhase('confirming')
        return
      }
    }

    // ⑤見つからなければ手入力(「なぜ何も反映されないのか」が分からず
    // 不安にならないよう、見つからなかったことをはっきり伝える)
    setLookupMatched(false)
    setLookupNote('一致する商品情報が見つかりませんでした。商品名・価格を入力してください。')
    setPhase('confirming')
  }

  // パン・惣菜・量り売りなど、そもそもバーコードが無い/読み取れない
  // 商品向けに、スキャンを経由せず直接入力画面に進めるようにする
  // (カメラ自体が使えない場合の代替手段としても、camera-error画面から
  // 呼べるようにしている)
  function handleManualEntry() {
    stopCamera()
    setBarcode('')
    setLookupMatched(false)
    setLookupNote('バーコードなしで手入力で追加します。商品名・価格を入力してください。')
    setName('')
    setCategory('')
    setPrice('')
    setAmount('')
    setUnit('')
    setQuantity('1')
    setPhase('confirming')
  }

  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of existingProducts) {
      if (p.category) set.add(p.category)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [existingProducts])

  const canSubmit = name.trim().length > 0 && Number(price) > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      await onSubmit({
        name: name.trim(),
        category: category.trim() !== '' ? category.trim() : null,
        price: Number(price),
        amount: Number(amount) > 0 ? Number(amount) : null,
        unit: unit.trim() !== '' ? unit.trim() : null,
        quantity: Number(quantity) > 0 ? Number(quantity) : 1,
        barcode,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black">
      <div className="flex items-center justify-between bg-black/60 px-4 py-3 text-white">
        <h2 className="text-sm font-semibold">バーコードをスキャン</h2>
        <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10" aria-label="閉じる">
          <X className="h-5 w-5" />
        </button>
      </div>

      {phase === 'scanning' && (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
          <div className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-2xl border-2 border-white/80" />
          <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 px-6">
            <p className="text-center text-sm text-white/80">商品のバーコードを枠内に合わせてください</p>
            <button
              onClick={handleManualEntry}
              className="rounded-full border border-white/40 bg-black/30 px-4 py-2 text-xs text-white active:bg-white/10"
            >
              バーコードが無い商品は手入力で追加
            </button>
          </div>
        </div>
      )}

      {phase === 'camera-error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-white">
          <Camera className="h-8 w-8 text-white/60" />
          <p className="text-sm text-white/80">
            カメラを起動できませんでした。ブラウザの設定でカメラへのアクセスが許可されているか確認してください。
          </p>
          <button
            onClick={handleManualEntry}
            className="mt-2 rounded-xl bg-white text-slate-800 px-4 py-2 text-sm font-medium active:bg-slate-100"
          >
            手入力で追加する
          </button>
          <button onClick={onClose} className="rounded-xl bg-white/10 px-4 py-2 text-sm">
            閉じる
          </button>
        </div>
      )}

      {phase === 'looking-up' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white">
          <p className="text-sm text-white/80">商品情報を確認しています…</p>
        </div>
      )}

      {phase === 'confirming' && (
        <div className="flex-1 overflow-y-auto bg-white p-5">
          {lookupNote && (
            <p
              className={`mb-4 rounded-lg px-3 py-2 text-xs ${
                lookupMatched ? 'bg-costco-blue-50 text-costco-blue-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {lookupNote}
            </p>
          )}
          {barcode && <p className="mb-3 text-xs text-slate-400">バーコード: {barcode}</p>}

          <label className="mb-1 block text-xs font-medium text-slate-500">商品名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="商品名を入力してください"
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />

          <label className="mb-1 block text-xs font-medium text-slate-500">カテゴリ(任意)</label>
          <input
            type="text"
            list="scan-category-options"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="例:飲料"
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />
          <datalist id="scan-category-options">
            {categoryOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <label className="mb-1 block text-xs font-medium text-slate-500">価格(円)</label>
          <input
            type="text"
            inputMode="numeric"
            value={formatWithCommas(price)}
            onChange={(e) => setPrice(toDigitsOnly(e.target.value))}
            placeholder="例:980"
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />

          <label className="mb-1 block text-xs font-medium text-slate-500">内容量(任意)</label>
          <div className="mb-4 flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例:500"
              className="w-1/2 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="g等"
              className="w-1/2 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
            />
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-500">数量</label>
          <input
            type="number"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
          />

          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
          >
            カートに追加する
          </button>
        </div>
      )}
    </div>
  )
}
