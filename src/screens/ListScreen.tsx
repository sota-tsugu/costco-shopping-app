import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Check,
  ChevronRight,
  Settings,
  ShoppingCart,
  X,
  Search,
  Minus,
  Trash2,
  Pencil,
  History,
  ReceiptJapaneseYen,
  AlertTriangle,
  CornerUpLeft,
  TrendingUp,
  Calendar,
  Tag,
} from 'lucide-react'
import {
  useTripStore,
  fetchLastCompletedTripProductNames,
  fetchLastCompletedTripTotal,
  type Product,
  type TripItem,
} from '../store/tripStore'
import { SettingsModal } from './SettingsModal'
import { TricolorAccent } from '../components/TricolorAccent'
import { ProductHistorySheet } from '../components/ProductHistorySheet'
import { TripStageIndicator } from '../components/TripStageIndicator'
import { PRODUCT_CATALOG } from '../data/productCatalog'
import { COSTCO_STORES, OTHER_STORE_VALUE } from '../data/costcoStores'
import { toDigitsOnly, formatWithCommas } from '../utils/numberInput'
import { calcDiscountPercent, formatDiscountPercent } from '../utils/discount'

// 予定日(YYYY-MM-DD)を「8月20日(木)」のような表示用の文字列に変換する
function formatPlannedDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
}

// 画面A:今回買うものリスト画面。
// 買い物前の計画(定番商品リストから選ぶ・予算設定)から、店内での進行管理
// (検討中→会計待ち→購入済の状態表示)まで、一貫して担う中心画面。
//
// 【フェーズ1(最小実装)の割り切り】
// - 「カートに入れる」時の演出(飛んでいくアニメーション等)はフェーズ3で
//   追加する。今回は状態がその場で切り替わるだけのシンプルな実装
// - 商品名タップでの購入履歴・単価比較の詳細画面は、購入データが
//   貯まってから作る画面Cとあわせて後日追加する

const OTHER_CATEGORY = 'その他'

type Props = {
  /** カート画面(画面B)へ移動する時に呼ぶ */
  onOpenCart: () => void
  /** 購入履歴・レポート画面(画面C)へ移動する時に呼ぶ */
  onOpenHistory: () => void
}

export function ListScreen({ onOpenCart, onOpenHistory }: Props) {
  const products = useTripStore((state) => state.products)
  const currentTrip = useTripStore((state) => state.currentTrip)
  const tripItems = useTripStore((state) => state.tripItems)
  const addProduct = useTripStore((state) => state.addProduct)
  const ensurePlanningTrip = useTripStore((state) => state.ensurePlanningTrip)
  const updateTripBudget = useTripStore((state) => state.updateTripBudget)
  const updateTripPlan = useTripStore((state) => state.updateTripPlan)
  const resetTripPlan = useTripStore((state) => state.resetTripPlan)
  const togglePlannedProduct = useTripStore((state) => state.togglePlannedProduct)
  const startShopping = useTripStore((state) => state.startShopping)
  const backToPlanning = useTripStore((state) => state.backToPlanning)
  const addToCart = useTripStore((state) => state.addToCart)
  const updateProduct = useTripStore((state) => state.updateProduct)
  const removeProduct = useTripStore((state) => state.removeProduct)
  const updateCartItemQuantity = useTripStore((state) => state.updateCartItemQuantity)
  const updateCartItemDetails = useTripStore((state) => state.updateCartItemDetails)
  const removeTripItem = useTripStore((state) => state.removeTripItem)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isAddProductOpen, setIsAddProductOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [budgetInput, setBudgetInput] = useState('30000')
  const [isApplyingLastTrip, setIsApplyingLastTrip] = useState(false)
  const [lastTripCandidates, setLastTripCandidates] = useState<Product[] | null>(null)
  const [lastTripTotal, setLastTripTotal] = useState<number | null>(null)
  const [isTripPlanOpen, setIsTripPlanOpen] = useState(false)
  // 「買い物を始める」が行く予定日・店舗の未入力で止められた時にtrueにする。
  // TripPlanSheetを開いた時、未入力の項目を赤く強調表示するために使う
  const [tripPlanValidationFailed, setTripPlanValidationFailed] = useState(false)
  const [historyProductName, setHistoryProductName] = useState<string | null>(null)
  // 計画時の基準価格と、実際に店頭で見た価格が違っていた場合に、
  // カートに入っている商品の価格・内容量・単位・セールかどうかを
  // その場で修正できるようにするためのシート
  const [editingCartItem, setEditingCartItem] = useState<TripItem | null>(null)

  // トリップが無ければ、初期予算3万円でplanningトリップを自動的に作る
  // (以前のアプリと同様、毎回同じようなものを買う前提で「まず一覧が
  // すぐ出る」体験を優先している)
  useEffect(() => {
    if (currentTrip === null) {
      void ensurePlanningTrip(Number(budgetInput) || 30000)
    } else {
      // 「計画を白紙に戻す」で予算を0にした直後は、入力欄に「0」ではなく
      // 空欄を出す(未入力であることが直感的に伝わるようにするため)
      setBudgetInput(currentTrip.budget > 0 ? String(currentTrip.budget) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrip])

  const isPlanning = currentTrip?.status === 'planning'
  const isActive = currentTrip?.status === 'active'

  // 計画中の画面では「検討中」だけでなく「会計待ち(inCart)」も
  // チェック済みとして扱う。買い物中から計画中に戻れるようにしたため、
  // すでにカートに入れた商品も「選んでいる」状態として正しく表示する必要がある
  const consideringProductIds = useMemo(
    () =>
      new Set(
        tripItems
          .filter((item) => item.status === 'considering' || item.status === 'inCart')
          .map((item) => item.productId),
      ),
    [tripItems],
  )

  // 商品id→検討中 or 会計待ちのtripItem。数量の参照・変更に使う
  const consideringItemByProductId = useMemo(() => {
    const map = new Map<string, TripItem>()
    for (const item of tripItems) {
      if ((item.status === 'considering' || item.status === 'inCart') && item.productId) {
        map.set(item.productId, item)
      }
    }
    return map
  }, [tripItems])

  function isChecked(productId: string) {
    return consideringProductIds.has(productId)
  }

  // バーコードスキャンで追加した商品(定番商品リストに無い、productIdが
  // 無いもの)。計画中の画面はもともと定番商品リストのチェックリスト
  // として作っていたため、この種の商品を表示する場所が無かった
  // (買い物中から計画中の画面に戻れるようにした際に判明した既知の段差)。
  // 別枠の一覧として、計画中の画面にも表示・数量変更・削除できるようにする
  const scannedItems = useMemo(
    () => tripItems.filter((item) => item.source === 'scan'),
    [tripItems],
  )

  // 計画中(planning)は、直近に完了した買い物の合計額を「前回の購入額」
  // として表示する(予算を決める際の目安になるように)。トリップが
  // 切り替わるたび(新しい買い物を始めるたび)に最新の値を取り直す
  useEffect(() => {
    if (!isPlanning) return
    void fetchLastCompletedTripTotal().then(setLastTripTotal)
  }, [isPlanning, currentTrip?.id])

  async function handleToggle(product: Product) {
    await togglePlannedProduct(product, !isChecked(product.id))
  }

  function handleBudgetBlur() {
    const value = Number(budgetInput)
    if (Number.isFinite(value) && value > 0) {
      void updateTripBudget(value)
    }
  }

  const estimatedTotal = useMemo(() => {
    const catalogTotal = products.reduce((sum, p) => {
      const item = consideringItemByProductId.get(p.id)
      if (!item) return sum
      return sum + (p.defaultPrice ?? 0) * item.quantity
    }, 0)
    // スキャンした商品(定番商品リストに無いもの)の分も見込み合計に含める
    const scannedTotal = scannedItems.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0)
    return catalogTotal + scannedTotal
  }, [products, consideringItemByProductId, scannedItems])

  // 計画中に選んでいる商品の合計点数(検討中・会計待ちの両方、数量の
  // 合計)。買い物中のカート点数表示と同じ考え方で、行数ではなく数量を数える
  const plannedCount = useMemo(
    () =>
      tripItems
        .filter((item) => item.status === 'considering' || item.status === 'inCart')
        .reduce((sum, item) => sum + item.quantity, 0),
    [tripItems],
  )

  const cartTotal = useMemo(() => {
    return tripItems
      .filter((item) => item.status === 'inCart')
      .reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0)
  }, [tripItems])

  // 「計画を白紙に戻す」ボタンを出すかどうか。何も選んでおらず、予算・
  // 行く予定日・店舗のいずれも未設定であれば、リセットする対象が無いため出さない
  const hasPlanToReset =
    tripItems.length > 0 || (currentTrip?.budget ?? 0) > 0 || !!currentTrip?.plannedDate || !!currentTrip?.storeName

  // 予算オーバーの判定。計画中は入力中の予算(budgetInput)、買い物中は
  // 確定している予算(currentTrip.budget)と比べる
  const budgetForPlanning = Number(budgetInput)
  const isOverBudgetPlanning = budgetForPlanning > 0 && estimatedTotal > budgetForPlanning
  const isOverBudgetActive = currentTrip !== null && cartTotal > currentTrip.budget
  // 買い物中の進捗バーに使う、予算に対する使用割合(%)。90%を超えたら
  // 注意色(amber)、100%を超えたらオーバー色(red)に切り替える
  const budgetUsagePercent =
    currentTrip && currentTrip.budget > 0 ? Math.round((cartTotal / currentTrip.budget) * 100) : null
  // 画面B(カート)の点数表示と揃えるため、行数ではなく数量の合計を数える
  // (以前は行数のみを数えていたため、同じ商品の数量を増やしても点数が
  // 変わらない不具合があった)
  const cartCount = tripItems
    .filter((item) => item.status === 'inCart')
    .reduce((sum, item) => sum + item.quantity, 0)

  const groupedProducts = useMemo(() => {
    const groups = new Map<string, Product[]>()
    for (const product of products) {
      const category = product.category ?? OTHER_CATEGORY
      const list = groups.get(category)
      if (list) list.push(product)
      else groups.set(category, [product])
    }
    const names = [...groups.keys()].filter((n) => n !== OTHER_CATEGORY).sort((a, b) => a.localeCompare(b, 'ja'))
    if (groups.has(OTHER_CATEGORY)) names.push(OTHER_CATEGORY)
    return names.map((category) => ({ category, items: groups.get(category)! }))
  }, [products])

  const groupedTripItems = useMemo(() => {
    const groups = new Map<string, TripItem[]>()
    for (const item of tripItems) {
      const category = item.category ?? OTHER_CATEGORY
      const list = groups.get(category)
      if (list) list.push(item)
      else groups.set(category, [item])
    }
    const names = [...groups.keys()].filter((n) => n !== OTHER_CATEGORY).sort((a, b) => a.localeCompare(b, 'ja'))
    if (groups.has(OTHER_CATEGORY)) names.push(OTHER_CATEGORY)
    return names.map((category) => ({ category, items: groups.get(category)! }))
  }, [tripItems])

  // 「買い物を始める」は、これまで確認なしで即座に実行していたため、
  // ゴーストクリック(スマホブラウザで、ボタンが入れ替わる瞬間にタップが
  // 誤って新しいボタンへ伝わってしまう現象)などで意図せず押されて
  // しまうと、気づかないまま買い物中の状態になってしまう問題があった。
  // 会計・計画中へ戻るなど他の重要な操作と同様に、確認ダイアログを
  // 挟むことで誤操作の影響を防ぐ。
  //
  // 【行く予定日・店舗の入力必須化】どちらか未入力のまま買い物を
  // 始めようとした場合は、開始せずにTripPlanSheetを開き、未入力の
  // 項目を赤く強調表示する(tripPlanValidationFailed)
  async function handleStartShopping() {
    if (!currentTrip?.plannedDate || !currentTrip?.storeName) {
      setTripPlanValidationFailed(true)
      setIsTripPlanOpen(true)
      return
    }
    const confirmed = window.confirm('買い物を始めますか?')
    if (!confirmed) return
    await startShopping()
  }

  // 買い物中から計画中に戻る。カートに入れた商品(inCart)・検討中の商品は
  // 削除せずそのまま保持する(計画中の画面側で両方をチェック済みとして
  // 扱うようにしている。consideringProductIds・consideringItemByProductIdを参照)
  async function handleBackToPlanning() {
    const confirmed = window.confirm(
      '計画中の画面に戻りますか?カートに入れた商品や検討中の商品は、そのまま保持されます。',
    )
    if (!confirmed) return
    await backToPlanning()
  }

  // 「計画を白紙に戻す」:買い物予定が急遽取りやめになった場合などに、
  // 選んでいた商品・予算・行く予定日/店舗をまとめてリセットする。
  // 選択作業がまとめて消える操作のため、確認ダイアログを必ず挟む
  async function handleResetTripPlan() {
    const confirmed = window.confirm(
      '計画を白紙に戻しますか?選んでいる商品・予算・行く予定日/店舗が、すべて未設定に戻ります。',
    )
    if (!confirmed) return
    await resetTripPlan()
  }

  // 「前回買ったものを反映」:直近に完了した買い物トリップで実際に
  // 購入済みだった商品を候補として取得し、確認シートを開く。
  // (取捨選択してから反映する方式。一気に全部反映すると、前回だけの
  // 一回限りの商品まで交じってしまうため、確認のワンクッションを挟む)
  async function handleOpenApplyLastTrip() {
    setIsApplyingLastTrip(true)
    try {
      const productNames = await fetchLastCompletedTripProductNames()
      if (productNames.length === 0) {
        window.alert('前回の買い物履歴がまだありません。')
        return
      }
      // idではなく商品名で照合する(定番商品を削除して登録し直した場合も
      // 同じ名前であれば正しく反映できるようにするため)
      const candidates = products.filter((p) => productNames.includes(p.name))
      if (candidates.length === 0) {
        window.alert('前回購入した商品が、現在の定番商品リストに見つかりませんでした。')
        return
      }
      setLastTripCandidates(candidates)
    } finally {
      setIsApplyingLastTrip(false)
    }
  }

  return (
    <div className={`min-h-screen bg-slate-50 ${isPlanning && products.length > 0 ? 'pb-28' : 'pb-8'}`}>
      <header
        className={`relative overflow-hidden px-4 text-white shadow-md transition-colors ${
          isActive ? 'bg-costco-blue-900 pb-1.5 pt-3' : 'bg-costco-blue-700 pb-4 pt-4'
        }`}
      >
        {isActive && (
          <ShoppingCart aria-hidden="true" className="pointer-events-none absolute -bottom-3 -right-3 h-24 w-24 text-white/[0.08]" />
        )}
        <TricolorAccent />
        <div className={`flex items-center justify-between ${isActive ? 'mt-2' : 'mt-3'}`}>
          <TripStageIndicator stage={isPlanning ? 'planning' : 'active'} startedAt={currentTrip?.startedAt} />
        </div>
        <div className={`mt-0.5 flex items-center ${isActive ? 'justify-end' : 'justify-between'}`}>
          {/* 買い物中は既にTripStageIndicatorで「買い物中・XX分」と表示され
              ており、このタイトルと意味が重複するため、買い物中は視覚的には
              隠す(スクリーンリーダー向けにsr-onlyとしては残す)。空いた
              スペースは購入履歴ラベルを横並びで見せる余裕にあてている */}
          <h1 className={isActive ? 'sr-only' : 'text-base font-semibold'}>今回買うものリスト</h1>
          {/* 購入履歴ボタンは縦積み(アイコン+文字)で設定ボタンより高さが
              あるため、items-centerのままだと2つのアイコンの高さがずれて
              見える。items-startにして、両方のアイコンの上端を揃えている */}
          <div className="flex items-start gap-1">
            <button
              onClick={onOpenHistory}
              className="flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-0 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
              aria-label="購入履歴・レポート"
            >
              <ReceiptJapaneseYen className="h-5 w-5" />
              <span className="whitespace-nowrap text-[9px] font-medium leading-none">購入履歴</span>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
              aria-label="設定"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        {isPlanning && (
          <div className="mt-3">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-xs text-costco-blue-100">見込み合計・{plannedCount}点</span>
                <div
                  className={`text-2xl font-semibold tracking-tight ${isOverBudgetPlanning ? 'text-costco-red-200' : ''}`}
                >
                  ¥{estimatedTotal.toLocaleString()}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xs text-costco-blue-100">予算</span>
                <label className="flex items-center gap-1 text-xl font-semibold">
                  ¥
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatWithCommas(budgetInput)}
                    onChange={(e) => setBudgetInput(toDigitsOnly(e.target.value))}
                    onBlur={handleBudgetBlur}
                    className="w-24 border-b border-costco-blue-300 bg-transparent text-right text-xl font-semibold text-white focus:outline-none"
                  />
                </label>
              </div>
            </div>
            {isOverBudgetPlanning && (
              <p className="mt-1 flex items-center justify-end gap-1 text-xs font-medium text-costco-red-200">
                <AlertTriangle className="h-3.5 w-3.5" />
                予算を¥{(estimatedTotal - budgetForPlanning).toLocaleString()}オーバーしています
              </p>
            )}
            {lastTripTotal !== null && (
              <p className="mt-1 text-right text-xs text-costco-blue-100">
                前回の購入額 ¥{lastTripTotal.toLocaleString()}
              </p>
            )}
            {currentTrip &&
              (() => {
                const isTripPlanIncomplete = !currentTrip.plannedDate || !currentTrip.storeName
                return (
                  <button
                    onClick={() => setIsTripPlanOpen(true)}
                    className={`mt-2 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                      isTripPlanIncomplete
                        ? 'bg-costco-red-700 text-white active:bg-costco-red-800'
                        : 'bg-white/10 text-costco-blue-100 active:bg-white/20'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      {isTripPlanIncomplete ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {currentTrip.plannedDate || currentTrip.storeName ? (
                        <span className="truncate">
                          {currentTrip.plannedDate ? formatPlannedDate(currentTrip.plannedDate) : '日程未定'}
                          {currentTrip.storeName ? ` ・ ${currentTrip.storeName}` : '(店舗未入力)'}
                        </span>
                      ) : (
                        '行く予定日・店舗を入力してください'
                      )}
                    </span>
                    <Pencil
                      className={`h-3 w-3 shrink-0 ${isTripPlanIncomplete ? 'text-white/80' : 'text-costco-blue-200'}`}
                    />
                  </button>
                )
              })()}
            {hasPlanToReset && (
              <button
                onClick={handleResetTripPlan}
                className="mt-2 w-full text-center text-[11px] text-costco-blue-200 underline underline-offset-2 active:text-white"
              >
                計画を白紙に戻す
              </button>
            )}
          </div>
        )}

        {isActive && (
          <div className="mt-1.5">
            <button
              onClick={onOpenCart}
              className={`flex w-full flex-col items-stretch rounded-xl px-3 py-2.5 text-left transition-colors ${
                isOverBudgetActive
                  ? 'bg-costco-red-700 active:bg-costco-red-800'
                  : 'bg-costco-blue-600 active:bg-costco-blue-800'
              }`}
            >
              <span className="flex items-center justify-between text-xs text-costco-blue-100">
                <span className="flex items-center gap-1.5">
                  <span className="relative shrink-0">
                    <ShoppingCart className="h-4 w-4" />
                    {cartCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-costco-red-600 px-1 text-[9px] font-bold leading-none text-white">
                        {cartCount}
                      </span>
                    )}
                  </span>
                  カート {cartCount}点
                </span>
                {/* アイコン・シェブロンの向きだけでは「別の画面に移動する」
                    ことが伝わりにくいという指摘があったため、行き先を
                    言葉でも明言している(パートナーなど、初めて触る人にも
                    分かりやすくするため) */}
                <span className="flex items-center gap-0.5">
                  カートを見る
                  <ChevronRight className="h-4 w-4" />
                </span>
              </span>
              {/* カートの合計金額は、この画面で最も知りたい数字のため、
                  他の要素より大きく太くして視覚的な主役にしている
                  (画面Bのカート画面と表現を揃え、アプリ全体の一貫性も
                  持たせている) */}
              <span className="mt-1 text-xl font-bold leading-tight text-white">
                ¥{cartTotal.toLocaleString()}
              </span>
            </button>
            {budgetUsagePercent !== null && currentTrip && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full rounded-full transition-all ${
                      budgetUsagePercent > 100
                        ? 'bg-costco-red-300'
                        : budgetUsagePercent >= 90
                          ? 'bg-amber-300'
                          : 'bg-white'
                    }`}
                    style={{ width: `${Math.min(budgetUsagePercent, 100)}%` }}
                  />
                </div>
                {/* 「計画を見る」ボタンを廃止した際、そこにしか表示されて
                    いなかった予算の金額が見えなくなってしまうため、
                    ここに小さく添えている */}
                <span
                  className={`shrink-0 text-[11px] font-medium tabular-nums ${
                    budgetUsagePercent > 100
                      ? 'text-costco-red-200'
                      : budgetUsagePercent >= 90
                        ? 'text-amber-200'
                        : 'text-costco-blue-100'
                  }`}
                >
                  予算¥{currentTrip.budget.toLocaleString()}中{budgetUsagePercent}%
                </span>
              </div>
            )}
            {isOverBudgetActive && currentTrip && (
              <p className="mt-1.5 flex items-center gap-1 px-1 text-xs font-medium text-costco-red-200">
                <AlertTriangle className="h-3.5 w-3.5" />
                予算を¥{(cartTotal - currentTrip.budget).toLocaleString()}オーバーしています
              </p>
            )}
            {/* 「計画を見る」は、内容のほとんどがこの下に表示されている
                買い物中の商品一覧・上の予算表示と重複していたため廃止した。
                「計画中に戻る」は状態そのものを切り替える操作のため残している */}
            <button
              onClick={handleBackToPlanning}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/5 py-2 text-xs text-costco-blue-100 active:bg-white/15"
            >
              <CornerUpLeft className="h-3.5 w-3.5" />
              計画中に戻る
            </button>
          </div>
        )}
      </header>
      {isActive && <TricolorAccent variant="subtle" />}

      <main
        key={isActive ? 'active' : 'planning'}
        className={`screen-fade-in mx-auto max-w-md px-4 pb-4 ${isActive ? 'pt-2' : 'pt-4'}`}
      >
        {isPlanning && products.length > 0 && (
          <button
            onClick={handleOpenApplyLastTrip}
            disabled={isApplyingLastTrip}
            className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-costco-blue-200 bg-white py-2.5 text-sm font-medium text-costco-blue-700 shadow-sm disabled:opacity-50"
          >
            <History className="h-4 w-4" />
            {isApplyingLastTrip ? '確認中…' : '前回買ったものを反映'}
          </button>
        )}

        {products.length === 0 && (
          <p className="mb-4 rounded-xl bg-white p-4 text-sm text-slate-400 shadow-sm">
            まだ定番商品が登録されていません。下の「商品を登録」から追加してください。
          </p>
        )}

        {isPlanning &&
          groupedProducts.map(({ category, items }) => (
            <section key={category} className="mb-4">
              <h2 className="mb-1.5 text-xs font-semibold text-slate-500">{category}</h2>
              <ul className="space-y-1.5">
                {items.map((product) => {
                  const checked = isChecked(product.id)
                  const consideringItem = consideringItemByProductId.get(product.id)
                  const quantity = consideringItem?.quantity ?? 1
                  return (
                    <li
                      key={product.id}
                      className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm"
                    >
                      <button
                        onClick={() => handleToggle(product)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                          checked ? 'border-costco-red-600 bg-costco-red-600' : 'border-slate-300'
                        }`}
                        aria-label="今回買うものリストに入れる/外す"
                      >
                        {checked && <Check className="h-3.5 w-3.5 text-white" />}
                      </button>
                      <button
                        onClick={() => setEditingProduct(product)}
                        className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm"
                      >
                        <span
                          className={`truncate underline decoration-slate-300 underline-offset-2 ${
                            checked ? 'text-slate-800' : 'text-slate-400 line-through'
                          }`}
                        >
                          {product.name}
                        </span>
                        <Pencil className="h-3 w-3 shrink-0 text-slate-300" />
                      </button>
                      <button
                        onClick={() => setHistoryProductName(product.name)}
                        className="shrink-0 rounded-full p-1 text-slate-300 active:text-costco-blue-600"
                        aria-label="単価の推移・購入履歴を見る"
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                      </button>
                      {checked && consideringItem && (
                        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                          <button
                            onClick={() => updateCartItemQuantity(consideringItem.id, quantity - 1)}
                            className="rounded bg-white p-1 shadow-sm active:bg-slate-200"
                            aria-label="数量を減らす"
                          >
                            <Minus className="h-3.5 w-3.5 text-slate-700" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold text-slate-800">{quantity}</span>
                          <button
                            onClick={() => updateCartItemQuantity(consideringItem.id, quantity + 1)}
                            className="rounded bg-white p-1 shadow-sm active:bg-slate-200"
                            aria-label="数量を増やす"
                          >
                            <Plus className="h-3.5 w-3.5 text-slate-700" />
                          </button>
                        </div>
                      )}
                      <span className="shrink-0 text-xs text-slate-400">
                        ¥{((product.defaultPrice ?? 0) * (checked ? quantity : 1)).toLocaleString()}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

        {isPlanning && scannedItems.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-1.5 text-xs font-semibold text-slate-500">スキャンした商品(定番商品リスト外)</h2>
            <ul className="space-y-1.5">
              {scannedItems.map((item) => (
                <li key={item.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{item.productName}</span>
                  <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                    <button
                      onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}
                      className="rounded bg-white p-1 shadow-sm active:bg-slate-200"
                      aria-label="数量を減らす"
                    >
                      <Minus className="h-3.5 w-3.5 text-slate-700" />
                    </button>
                    <span className="w-5 text-center text-xs font-bold text-slate-800">{item.quantity}</span>
                    <button
                      onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}
                      className="rounded bg-white p-1 shadow-sm active:bg-slate-200"
                      aria-label="数量を増やす"
                    >
                      <Plus className="h-3.5 w-3.5 text-slate-700" />
                    </button>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    ¥{((item.price ?? 0) * item.quantity).toLocaleString()}
                  </span>
                  <button
                    onClick={() => removeTripItem(item.id)}
                    className="shrink-0 p-1 text-slate-300 active:text-red-500"
                    aria-label="今回買うものリストから外す"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isActive &&
          groupedTripItems.map(({ category, items }) => (
            <section key={category} className="mb-4">
              <h2 className="mb-1.5 text-xs font-semibold text-slate-500">{category}</h2>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => setHistoryProductName(item.productName)}
                        className="max-w-full truncate text-left text-sm text-slate-800 underline decoration-slate-300 underline-offset-2"
                      >
                        {item.productName}
                      </button>
                      <span
                        className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          item.status === 'considering'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-costco-blue-50 text-costco-blue-700'
                        }`}
                      >
                        {item.status === 'considering' ? '検討中' : '会計待ち'}
                      </span>
                      {item.status === 'inCart' && item.isOnSale && (
                        <span className="mt-0.5 ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          <Tag className="h-2.5 w-2.5" />
                          セール
                          {item.regularPrice !== null &&
                            item.price !== null &&
                            calcDiscountPercent(item.regularPrice, item.price) !== null && (
                              <> {formatDiscountPercent(item.regularPrice, item.price)}</>
                            )}
                        </span>
                      )}
                    </div>
                    {item.status === 'considering' ? (
                      <>
                        <button
                          onClick={() => addToCart(item.id)}
                          className="flex shrink-0 items-center gap-1 rounded-lg bg-costco-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors active:bg-costco-red-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          カートに入れる
                        </button>
                        <button
                          onClick={() => removeTripItem(item.id)}
                          className="shrink-0 p-1 text-slate-300 active:text-red-500"
                          aria-label="今回買うものリストから外す"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-0.5">
                          <button
                            onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}
                            className="rounded bg-white p-1 shadow-sm active:bg-slate-200"
                            aria-label="数量を減らす"
                          >
                            <Minus className="h-3.5 w-3.5 text-slate-700" />
                          </button>
                          <span className="w-5 text-center text-xs font-bold text-slate-800">{item.quantity}</span>
                          <button
                            onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}
                            className="rounded bg-white p-1 shadow-sm active:bg-slate-200"
                            aria-label="数量を増やす"
                          >
                            <Plus className="h-3.5 w-3.5 text-slate-700" />
                          </button>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">
                          ¥{((item.price ?? 0) * item.quantity).toLocaleString()}
                        </span>
                        {/* 計画時の基準価格と、実際に店頭で見た価格が違うことが
                            あるため、カートに入っている商品はここで価格・内容量・
                            単位・セールかどうかを修正できるようにしている */}
                        <button
                          onClick={() => setEditingCartItem(item)}
                          className="shrink-0 p-1 text-slate-300 active:text-costco-blue-600"
                          aria-label="価格・内容量を修正する"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeTripItem(item.id)}
                          className="shrink-0 p-1 text-slate-300 active:text-red-500"
                          aria-label="カートから外す"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}

        <button
          onClick={() => setIsAddProductOpen(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-400 transition-colors active:border-costco-blue-300 active:text-costco-blue-500"
        >
          <Plus className="h-4 w-4" />
          商品を登録
        </button>
      </main>

      {isPlanning && products.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4">
          <button
            onClick={handleStartShopping}
            className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-4 text-lg font-semibold text-white shadow transition-colors active:bg-costco-red-700"
          >
            買い物を始める
          </button>
        </div>
      )}

      {isAddProductOpen && (
        <AddProductSheet
          existingProducts={products}
          onClose={() => setIsAddProductOpen(false)}
          onSubmit={async (name, category, price, amount, unit) => {
            const newProduct = await addProduct(name, category, price, amount, unit)
            // 登録した商品は、その場で今回買うものリストにも含める(チェック済みに
            // する)。登録直後に「除外されている」ような見た目(取り消し線)に
            // なってしまうのを防ぐため
            await togglePlannedProduct(newProduct, true)
            setIsAddProductOpen(false)
          }}
        />
      )}

      {editingProduct && (
        <EditProductSheet
          product={editingProduct}
          existingProducts={products}
          onClose={() => setEditingProduct(null)}
          onSubmit={async (name, category, price, amount, unit) => {
            await updateProduct(editingProduct.id, { name, category, price, amount, unit })
            setEditingProduct(null)
          }}
          onDelete={async () => {
            await removeProduct(editingProduct.id)
            setEditingProduct(null)
          }}
        />
      )}

      {lastTripCandidates && (
        <ApplyLastTripSheet
          candidates={lastTripCandidates}
          onClose={() => setLastTripCandidates(null)}
          onSubmit={async (selected) => {
            // 追加方式:選ばれた商品のうち、まだチェックしていないものだけ
            // チェックする(すでにチェック済みの他の商品には影響しない)
            for (const product of selected) {
              if (!isChecked(product.id)) {
                await togglePlannedProduct(product, true)
              }
            }
            setLastTripCandidates(null)
          }}
        />
      )}

      {isTripPlanOpen && currentTrip && (
        <TripPlanSheet
          plannedDate={currentTrip.plannedDate}
          storeName={currentTrip.storeName}
          showMissingWarning={tripPlanValidationFailed}
          onClose={() => {
            setIsTripPlanOpen(false)
            setTripPlanValidationFailed(false)
          }}
          onSave={(plannedDate, storeName) => {
            void updateTripPlan(plannedDate, storeName)
          }}
        />
      )}

      {historyProductName && (
        <ProductHistorySheet productName={historyProductName} onClose={() => setHistoryProductName(null)} />
      )}

      {editingCartItem && (
        <EditCartItemSheet
          item={editingCartItem}
          product={products.find((p) => p.id === editingCartItem.productId) ?? null}
          onClose={() => setEditingCartItem(null)}
          onSave={async (updates) => {
            await updateCartItemDetails(editingCartItem.id, updates)
          }}
          onUpdateDefaultPrice={async (price) => {
            if (!editingCartItem.productId) return
            const product = products.find((p) => p.id === editingCartItem.productId)
            if (!product) return
            await updateProduct(product.id, {
              name: product.name,
              category: product.category,
              price,
              amount: product.defaultAmount,
              unit: product.defaultUnit,
            })
          }}
        />
      )}

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
    </div>
  )
}

// カテゴリ欄で「新しいカテゴリを追加」を選んだ時に使う特別な値。
// TripPlanSheetの店舗選択(その他=自由入力)と同じ考え方
const NEW_CATEGORY_VALUE = '__new_category__'

type CategorySelectFieldProps = {
  /** 現在のカテゴリ(空文字=未選択)。呼び出し側のフォームの状態をそのまま渡す */
  value: string
  /** 選択肢として出す既存カテゴリの一覧 */
  options: string[]
  onChange: (category: string) => void
}

/**
 * カテゴリの入力欄。以前はテキスト入力+datalist(ブラウザ標準の入力候補)
 * だったが、スマホでは候補一覧がうまく表示されず「選択肢から選べている」
 * 実感が薄かった。TripPlanSheetの店舗選択(一覧から選ぶ/その他で自由入力)
 * と同じ、select+切り替え式の自由入力欄という組み合わせに変更している。
 *
 * 【選択モードへの復帰について】商品名の候補を選ぶとカテゴリも一緒に
 * 自動で入る(handlePickSuggestion)。その際に選択モードへ戻すため、
 * 呼び出し側でこのコンポーネントのkeyを変更して再マウントさせている
 * (内部のmodeは初回マウント時のvalueだけを見て決めるシンプルな作りに
 * しているため)
 */
function CategorySelectField({ value, options, onChange }: CategorySelectFieldProps) {
  const isKnownValue = value === '' || options.includes(value)
  const [mode, setMode] = useState<'select' | 'new'>(isKnownValue ? 'select' : 'new')
  const [newInput, setNewInput] = useState(isKnownValue ? '' : value)

  function handleSelectChange(v: string) {
    if (v === NEW_CATEGORY_VALUE) {
      setMode('new')
      setNewInput('')
      onChange('')
    } else {
      setMode('select')
      onChange(v)
    }
  }

  function handleNewInputChange(v: string) {
    setNewInput(v)
    onChange(v)
  }

  if (mode === 'new') {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          autoFocus
          value={newInput}
          onChange={(e) => handleNewInputChange(e.target.value)}
          placeholder="新しいカテゴリ名(例:日用品)"
          className="w-full flex-1 rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            setMode('select')
            setNewInput('')
            onChange('')
          }}
          className="shrink-0 rounded-lg border border-slate-300 px-3 text-xs text-slate-500"
        >
          一覧から選ぶ
        </button>
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => handleSelectChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
    >
      <option value="">カテゴリなし</option>
      {options.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={NEW_CATEGORY_VALUE}>＋ 新しいカテゴリを追加</option>
    </select>
  )
}

type AddProductSheetProps = {
  existingProducts: Product[]
  onClose: () => void
  onSubmit: (
    name: string,
    category: string | null,
    price: number | null,
    amount: number | null,
    unit: string | null,
  ) => Promise<void>
}

function AddProductSheet({ existingProducts, onClose, onSubmit }: AddProductSheetProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false)
  // 商品名の候補を選ぶとカテゴリ欄も自動で選択モードに戻したいため、
  // このkeyを変えてCategorySelectFieldを再マウントさせる
  const [categoryFieldResetKey, setCategoryFieldResetKey] = useState(0)

  // 商品名候補データベース(costcotuu.com由来・約3200件)から、商品名の
  // 入力補助を行う。名前を選ぶとカテゴリも一緒に入る。
  // 通常は2文字以上で検索するが、漢字は1文字でも意味が絞られやすい
  // (例:「豚」「鶏」)ため、1文字目が漢字の場合は1文字から候補を出す
  const nameSuggestions = useMemo(() => {
    const trimmed = name.trim().toLowerCase()
    const startsWithKanji = /[一-鿿]/.test(trimmed[0] ?? '')
    const minLength = startsWithKanji ? 1 : 2
    if (trimmed.length < minLength) return []
    return PRODUCT_CATALOG.filter((entry) => entry.name.toLowerCase().includes(trimmed)).slice(0, 12)
  }, [name])

  // カテゴリの選択補助:候補データベースと、すでに登録済みの定番商品の
  // カテゴリをあわせて、入力候補(datalist)として出す(表記ゆれを防ぐため)
  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const entry of PRODUCT_CATALOG) set.add(entry.category)
    for (const product of existingProducts) {
      if (product.category) set.add(product.category)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [existingProducts])

  function handlePickSuggestion(entry: { name: string; category: string }) {
    setName(entry.name)
    setCategory(entry.category)
    setCategoryFieldResetKey((k) => k + 1)
    setIsSuggestionsOpen(false)
  }

  const canSubmit = name.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      await onSubmit(
        name.trim(),
        category.trim() !== '' ? category.trim() : null,
        Number(price) > 0 ? Number(price) : null,
        Number(amount) > 0 ? Number(amount) : null,
        unit.trim() !== '' ? unit.trim() : null,
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">定番商品を登録</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">商品名</label>
        <div className="relative mb-1">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setIsSuggestionsOpen(true)
            }}
            onFocus={() => setIsSuggestionsOpen(true)}
            onBlur={() => {
              // 候補をタップした瞬間のonClickより先に閉じてしまわないよう、
              // 少し遅らせてから閉じる(タッチ操作向けの定番の対処)
              window.setTimeout(() => setIsSuggestionsOpen(false), 150)
            }}
            placeholder="例:トイレットペーパー"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 pr-9 text-base focus:border-costco-blue-500 focus:outline-none"
          />
          {name !== '' && (
            <button
              type="button"
              onClick={() => setName('')}
              aria-label="商品名を消去する"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isSuggestionsOpen && nameSuggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {nameSuggestions.map((entry, index) => (
                <li key={`${entry.name}-${index}`}>
                  <button
                    type="button"
                    onClick={() => handlePickSuggestion(entry)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <Search className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                    <span className="flex-1 truncate">{entry.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{entry.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* 候補に無い商品でも困らないよう、自由入力ができることを明示している */}
        <p className="mb-4 text-xs text-slate-400">候補になければ、そのまま自由に入力・修正できます。</p>

        <label className="mb-1 block text-xs font-medium text-slate-500">カテゴリ(任意)</label>
        <div className="mb-4">
          <CategorySelectField
            key={categoryFieldResetKey}
            value={category}
            options={categoryOptions}
            onChange={setCategory}
          />
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">価格(円・任意)</label>
        <input
          type="text"
          inputMode="numeric"
          value={formatWithCommas(price)}
          onChange={(e) => setPrice(toDigitsOnly(e.target.value))}
          placeholder="例:1,580"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">内容量(任意)</label>
        <div className="mb-6 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例:900"
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

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
        >
          登録する
        </button>
      </div>
    </div>
  )
}

type EditProductSheetProps = {
  product: Product
  existingProducts: Product[]
  onClose: () => void
  onSubmit: (
    name: string,
    category: string | null,
    price: number | null,
    amount: number | null,
    unit: string | null,
  ) => Promise<void>
  onDelete: () => Promise<void>
}

/** 定番商品リストの1件を編集・削除するシート。AddProductSheetと似た作りだが、
 * 値がすでに入っている状態で開き、削除ボタンも持つ */
function EditProductSheet({ product, existingProducts, onClose, onSubmit, onDelete }: EditProductSheetProps) {
  const [name, setName] = useState(product.name)
  const [category, setCategory] = useState(product.category ?? '')
  const [price, setPrice] = useState(product.defaultPrice !== null ? String(product.defaultPrice) : '')
  const [amount, setAmount] = useState(product.defaultAmount !== null ? String(product.defaultAmount) : '')
  const [unit, setUnit] = useState(product.defaultUnit ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const p of existingProducts) {
      if (p.category) set.add(p.category)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [existingProducts])

  const canSubmit = name.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      await onSubmit(
        name.trim(),
        category.trim() !== '' ? category.trim() : null,
        Number(price) > 0 ? Number(price) : null,
        Number(amount) > 0 ? Number(amount) : null,
        unit.trim() !== '' ? unit.trim() : null,
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `「${product.name}」を定番商品リストから完全に削除しますか?(元に戻せません)`,
    )
    if (!confirmed) return
    setIsDeleting(true)
    try {
      await onDelete()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">商品を編集</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">商品名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">カテゴリ(任意)</label>
        <div className="mb-4">
          <CategorySelectField value={category} options={categoryOptions} onChange={setCategory} />
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">価格(円・任意)</label>
        <input
          type="text"
          inputMode="numeric"
          value={formatWithCommas(price)}
          onChange={(e) => setPrice(toDigitsOnly(e.target.value))}
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">内容量(任意)</label>
        <div className="mb-6 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例:900"
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

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSaving}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-costco-blue-700 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-blue-800 disabled:opacity-50"
        >
          保存する
        </button>

        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          定番商品リストから削除する
        </button>
      </div>
    </div>
  )
}

type ApplyLastTripSheetProps = {
  /** 前回の買い物で購入済みだった、定番商品リスト上の商品(候補) */
  candidates: Product[]
  onClose: () => void
  onSubmit: (selected: Product[]) => Promise<void>
}

/** 「前回買ったものを反映」の確認シート。
 * 前回購入した商品を一覧表示し、デフォルトで全てチェック済みにしておく。
 * 今回は不要なものだけチェックを外してから反映できるようにすることで、
 * 一回限りの商品(誕生日ケーキなど)を毎回間違って含めてしまうのを防ぐ */
function ApplyLastTripSheet({ candidates, onClose, onSubmit }: ApplyLastTripSheetProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(candidates.map((p) => p.id)))
  const [isSaving, setIsSaving] = useState(false)

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (selectedIds.size === 0) return
    setIsSaving(true)
    try {
      await onSubmit(candidates.filter((p) => selectedIds.has(p.id)))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">前回買ったものを反映</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-400">今回は不要なものはチェックを外してください。</p>

        <ul className="mb-4 flex-1 space-y-1.5 overflow-y-auto">
          {candidates.map((product) => {
            const checked = selectedIds.has(product.id)
            return (
              <li key={product.id}>
                <button
                  onClick={() => toggle(product.id)}
                  className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-left"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                      checked ? 'border-costco-red-600 bg-costco-red-600' : 'border-slate-300'
                    }`}
                  >
                    {checked && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                  <span className={`flex-1 truncate text-sm ${checked ? 'text-slate-800' : 'text-slate-400'}`}>
                    {product.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">¥{(product.defaultPrice ?? 0).toLocaleString()}</span>
                </button>
              </li>
            )
          })}
        </ul>

        <button
          onClick={handleSubmit}
          disabled={isSaving || selectedIds.size === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
        >
          {selectedIds.size}件を反映する
        </button>
      </div>
    </div>
  )
}

type TripPlanSheetProps = {
  plannedDate: string | null
  storeName: string | null
  /** 「買い物を始める」が未入力で止められて開かれた場合にtrue。
   * 未入力の項目を赤く強調表示し、上部に案内を出す */
  showMissingWarning?: boolean
  onClose: () => void
  onSave: (plannedDate: string | null, storeName: string | null) => void
}

/**
 * 計画中の画面から開く、行く予定日・店舗を設定するシート。
 * 通常時はどちらも任意項目として保存できる(自分のペースで先に
 * 片方だけ決めておく、といった使い方ができるように)。ただし
 * 「買い物を始める」時点ではどちらも入力必須にしており、未入力の
 * まま始めようとするとこのシートが開き、足りない項目を強調表示する
 * (showMissingWarning)。店舗は一覧から選ぶ形式だが、リストに無い
 * 店舗にも対応できるよう「その他(自由入力)」を用意している
 * (costcoStores.tsを参照。Web検索で確認できた店舗のみのリストのため、
 * 全店舗を網羅していない)
 */
function TripPlanSheet({ plannedDate, storeName, showMissingWarning, onClose, onSave }: TripPlanSheetProps) {
  const isKnownStore = storeName !== null && COSTCO_STORES.includes(storeName)
  const [date, setDate] = useState(plannedDate ?? '')
  const [selectedStore, setSelectedStore] = useState(
    storeName === null ? '' : isKnownStore ? storeName : OTHER_STORE_VALUE,
  )
  const [customStore, setCustomStore] = useState(isKnownStore || storeName === null ? '' : storeName)

  // 保存されている値ではなく、今まさに入力中の内容を見て「今も未入力か」
  // を判定する。入力し始めればその場で赤い強調が消えるようにするため
  const isDateMissing = showMissingWarning && date === ''
  const isStoreMissing = showMissingWarning && selectedStore === ''

  function handleSave() {
    const finalStore = selectedStore === OTHER_STORE_VALUE ? customStore.trim() || null : selectedStore || null
    onSave(date || null, finalStore)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">行く予定日・店舗</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {showMissingWarning && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-costco-red-50 p-3 text-xs text-costco-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>行く予定日・店舗の両方を入力すると、買い物を始められます。</span>
          </div>
        )}

        <label className="mb-3 block">
          <span className={`mb-1 block text-xs font-medium ${isDateMissing ? 'text-costco-red-600' : 'text-slate-500'}`}>
            予定日{isDateMissing && '(未入力)'}
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
              isDateMissing
                ? 'border-costco-red-400 focus:border-costco-red-500'
                : 'border-slate-200 focus:border-costco-blue-500'
            }`}
          />
        </label>

        <label className="block">
          <span className={`mb-1 block text-xs font-medium ${isStoreMissing ? 'text-costco-red-600' : 'text-slate-500'}`}>
            店舗{isStoreMissing && '(未入力)'}
          </span>
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${
              isStoreMissing
                ? 'border-costco-red-400 focus:border-costco-red-500'
                : 'border-slate-200 focus:border-costco-blue-500'
            }`}
          >
            <option value="">選択しない</option>
            {COSTCO_STORES.map((store) => (
              <option key={store} value={store}>
                {store}
              </option>
            ))}
            <option value={OTHER_STORE_VALUE}>その他(自由入力)</option>
          </select>
        </label>
        {selectedStore === OTHER_STORE_VALUE && (
          <input
            type="text"
            value={customStore}
            onChange={(e) => setCustomStore(e.target.value)}
            placeholder="店舗名を入力"
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-costco-blue-500 focus:outline-none"
          />
        )}

        {/* まだはっきり決まっていない時に、一旦未入力の状態に戻すための
            ボタン。ここではフォームの入力内容をその場でクリアするだけで、
            実際にFirestoreへ反映されるのは下の「保存する」を押した時点
            (誤タップしてもそのまま保存ボタンを押さなければ影響が無い) */}
        {(date !== '' || selectedStore !== '') && (
          <button
            type="button"
            onClick={() => {
              setDate('')
              setSelectedStore('')
              setCustomStore('')
            }}
            className="mt-3 text-xs text-slate-400 underline underline-offset-2 active:text-slate-600"
          >
            予定日・店舗をリセットする
          </button>
        )}

        <button
          onClick={handleSave}
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-costco-blue-600 px-4 py-3 text-sm font-semibold text-white active:bg-costco-blue-700"
        >
          保存する
        </button>
      </div>
    </div>
  )
}

type EditCartItemSheetProps = {
  item: TripItem
  /** 定番商品リスト側の登録(基準価格の更新確認に使う)。バーコードスキャン
   * 由来などでproductIdが無い場合はnull */
  product: Product | null
  onClose: () => void
  onSave: (updates: {
    price: number
    amount: number | null
    unit: string | null
    isOnSale: boolean
    regularPrice: number | null
  }) => Promise<void>
  /** 基準価格を今回の価格に更新する(確認後にのみ呼ばれる) */
  onUpdateDefaultPrice: (price: number) => Promise<void>
}

/**
 * カートに入っている商品(inCart)の価格・内容量・単位・セールかどうかを、
 * 店頭で確認した実際の内容に修正するシート。計画時点の基準価格(定番
 * 商品リストの登録値)と、実際の店頭価格がズレていた場合に使う。
 *
 * 【基準価格への反映確認】保存する価格が、定番商品リストの基準価格と
 * 大きく異なり、かつ「セール価格だった」にチェックが入っていない場合は、
 * 「この価格を今後の基準価格として更新しますか?」と確認する。セール
 * だと分かっている場合は、一時的な値下がりのはずなので確認しない
 *
 * 【割引率】セールにチェックを入れると、通常価格(任意)の入力欄が出る。
 * 入力すると、その場で割引率を計算して表示する(保存もされ、カートの
 * 一覧やレシートのセールバッジにも割引率が添えられる)
 */
function EditCartItemSheet({ item, product, onClose, onSave, onUpdateDefaultPrice }: EditCartItemSheetProps) {
  const [price, setPrice] = useState(String(item.price ?? 0))
  const [amount, setAmount] = useState(item.amount !== null ? String(item.amount) : '')
  const [unit, setUnit] = useState(item.unit ?? '')
  const [isOnSale, setIsOnSale] = useState(item.isOnSale)
  const [regularPrice, setRegularPrice] = useState(item.regularPrice !== null ? String(item.regularPrice) : '')
  const [isSaving, setIsSaving] = useState(false)

  const canSave = Number(price) > 0
  const discountPercent =
    isOnSale && Number(regularPrice) > 0 && Number(price) > 0
      ? calcDiscountPercent(Number(regularPrice), Number(price))
      : null

  async function handleSave() {
    if (!canSave) return
    setIsSaving(true)
    try {
      const finalPrice = Number(price)
      await onSave({
        price: finalPrice,
        amount: Number(amount) > 0 ? Number(amount) : null,
        unit: unit.trim() !== '' ? unit.trim() : null,
        isOnSale,
        regularPrice: isOnSale && Number(regularPrice) > 0 ? Number(regularPrice) : null,
      })

      // セールでなく、基準価格と大きく異なる場合だけ更新確認を出す
      // (1円単位の誤差では聞かない。10円以上または5%以上の差を目安にしている)
      if (!isOnSale && product?.defaultPrice != null) {
        const diff = Math.abs(finalPrice - product.defaultPrice)
        const diffPercent = product.defaultPrice > 0 ? diff / product.defaultPrice : 0
        if (diff >= 10 && diffPercent >= 0.05) {
          const confirmed = window.confirm(
            `定番商品リストの基準価格(¥${product.defaultPrice.toLocaleString()})と異なります。\n\n` +
              `¥${finalPrice.toLocaleString()}を今後の基準価格として更新しますか?`,
          )
          if (confirmed) {
            await onUpdateDefaultPrice(finalPrice)
          }
        }
      }
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-800">{item.productName}</h2>
          <button onClick={onClose} className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          店頭で見た実際の価格・内容量に修正できます。計画時の基準価格とは別に、この商品(1回ぶん)だけが変わります。
        </p>

        <label className="mb-1 block text-xs font-medium text-slate-500">価格(円)</label>
        <input
          type="text"
          inputMode="numeric"
          value={formatWithCommas(price)}
          onChange={(e) => setPrice(toDigitsOnly(e.target.value))}
          className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-costco-blue-500 focus:outline-none"
        />
        <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={isOnSale}
            onChange={(e) => setIsOnSale(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-costco-blue-600 focus:ring-costco-blue-500"
          />
          セール価格だった
        </label>

        {isOnSale && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3">
            <label className="mb-1 block text-xs font-medium text-amber-700">通常価格(任意・割引率の計算に使います)</label>
            <input
              type="text"
              inputMode="numeric"
              value={formatWithCommas(regularPrice)}
              onChange={(e) => setRegularPrice(toDigitsOnly(e.target.value))}
              placeholder="例:1,280"
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-base focus:border-amber-400 focus:outline-none"
            />
            {discountPercent !== null && (
              <p className="mt-1.5 text-xs font-medium text-amber-700">
                通常価格より{discountPercent}%オフです
              </p>
            )}
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-slate-500">内容量(任意)</label>
        <div className="mb-6 flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例:900"
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

        <button
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-costco-blue-700 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-blue-800 disabled:opacity-50"
        >
          保存する
        </button>
      </div>
    </div>
  )
}
