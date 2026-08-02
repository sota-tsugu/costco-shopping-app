import { useEffect, useMemo, useState } from 'react'
import { Loader2, ClipboardList, Plus, X, Check, ChevronDown, Search, Settings, ListPlus } from 'lucide-react'
import {
  useCartStore,
  searchProductCatalog,
  getSuggestedCartDetails,
  type Product,
  type CatalogSuggestion,
} from '../store/cartStore'
import { SettingsModal } from './SettingsModal'
import { ManageFavoritesModal } from './ManageFavoritesModal'
import { TricolorAccent } from '../components/TricolorAccent'

// 買い物を始める前に、今回の見込み合計金額と「今回買う予定のもの」を
// 確認する画面。企画書の方針により「予算は買い物1回ごと」に設定する
// 形にしている。
//
// 【トップ要素の設計】当初は予算入力を画面の主役にしていたが、
// 「コストコ現地で実際に確認できる、カート内の購入予定合計金額や
// 中身が主役にある方がよい」というSOTAさんの意見を受けて変更。
// ShoppingScreenの上部固定バーと同じ構成(合計金額+予算バー)を
// この画面にも採用し、「予定を組む画面」と「実際に買い物する画面」で
// 同じ体験(合計を見ながら調整する)を一貫させている。
//
// 【予定リストの設計】ほぼ毎回同じものを買う、という実際の使い方に
// 合わせて、マイ定番棚の商品を全部「買う予定」としてチェック済みで
// 表示し、不要なものだけチェックを外す方式にした。「前回の買い物を
// そのまま複製する」方式も検討したが、たまたま前回買わなかった定番品が
// 次回以降も出てこなくなってしまう弱点があるため見送った。
//
// 【カテゴリ別表示】買い忘れを防げるよう、予定リストは商品のカテゴリ
// (商品名候補データベースから選んだ場合に設定される)ごとにグループ
// 表示する。カテゴリが分かっていない商品(自分で自由入力した場合など)
// は「その他」にまとめる。
//
// 定番棚にないイレギュラーな商品は、引き続き自由入力のメモ(事前リスト)
// で対応する。

export function BudgetSetupScreen() {
  const startTrip = useCartStore((state) => state.startTrip)
  const favorites = useCartStore((state) => state.favorites)
  const wishlist = useCartStore((state) => state.wishlist)
  const addWishlistItem = useCartStore((state) => state.addWishlistItem)
  const removeWishlistItem = useCartStore((state) => state.removeWishlistItem)
  const purchaseSummaryByProduct = useCartStore((state) => state.purchaseSummaryByProduct)

  const [budgetInput, setBudgetInput] = useState('30000')
  const [isStarting, setIsStarting] = useState(false)
  const [wishlistInput, setWishlistInput] = useState('')
  const [isAddingWishlistItem, setIsAddingWishlistItem] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isManageFavoritesOpen, setIsManageFavoritesOpen] = useState(false)

  // 事前リスト(メモ)の入力中に出す予測変換。商品名候補データベース+
  // マイ定番棚から検索する(AddProductForm.tsxと同じ仕組み)。
  // 300ms待ってから検索し、1文字打つたびに検索が走らないようにしている。
  const [wishlistSuggestions, setWishlistSuggestions] = useState<CatalogSuggestion[]>([])
  const [isWishlistSuggestionsOpen, setIsWishlistSuggestionsOpen] = useState(false)
  useEffect(() => {
    if (wishlistInput.trim().length < 2) {
      setWishlistSuggestions([])
      return
    }
    const timer = setTimeout(() => {
      setWishlistSuggestions(searchProductCatalog(wishlistInput, favorites))
    }, 300)
    return () => clearTimeout(timer)
  }, [wishlistInput, favorites])

  // 「今回買う予定」のチェック状態。初回に定番棚が読み込まれたタイミングで
  // 全部チェック済みにする(以降はユーザーの操作を優先し、上書きしない)。
  const [checkedIds, setCheckedIds] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (checkedIds === null && favorites.length > 0) {
      setCheckedIds(new Set(favorites.map((p) => p.id)))
    }
  }, [favorites, checkedIds])

  function isChecked(productId: string) {
    return checkedIds?.has(productId) ?? true
  }

  function toggleChecked(productId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev ?? favorites.map((p) => p.id))
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  // 画面上部に表示する「見込み合計金額」。チェックが入っている商品の
  // 価格(直近の購入価格があればそれを優先)を合計するだけなので、
  // メモリ上の計算だけで即座に求まる。
  const estimatedTotal = useMemo(() => {
    return favorites.reduce((sum, p) => {
      if (!isChecked(p.id)) return sum
      return sum + getSuggestedCartDetails(p, purchaseSummaryByProduct[p.id]).price
    }, 0)
  }, [favorites, checkedIds, purchaseSummaryByProduct])

  const budgetNumber = Number(budgetInput) || 0
  const progressRatio = budgetNumber > 0 ? Math.min(estimatedTotal / budgetNumber, 1) : 0
  const isOverBudget = budgetNumber > 0 && estimatedTotal > budgetNumber

  // リストが長くなっても見つけやすいよう、よく買う(購入回数が多い)順に
  // 並べ替える。初めて登録したばかりでまだ購入履歴がない商品は末尾に。
  const sortedFavorites = useMemo(() => {
    return [...favorites].sort((a, b) => {
      const countA = purchaseSummaryByProduct[a.id]?.count ?? 0
      const countB = purchaseSummaryByProduct[b.id]?.count ?? 0
      return countB - countA
    })
  }, [favorites, purchaseSummaryByProduct])

  // 【今回買う予定リストの折りたたみ・検索】リストが長くなる想定のため、
  // 初期状態では折りたたんでおき「◯点中◯点選択中」の要約だけ見せる。
  // 開いた時だけ検索欄で絞り込みながら全件を確認できるようにしている。
  const [isPlanListExpanded, setIsPlanListExpanded] = useState(false)
  const [planListQuery, setPlanListQuery] = useState('')
  const checkedCount = checkedIds ? checkedIds.size : favorites.length

  const visibleFavorites = useMemo(() => {
    if (planListQuery.trim().length === 0) return sortedFavorites
    const q = planListQuery.trim().toLowerCase()
    return sortedFavorites.filter((p) => p.name.toLowerCase().includes(q))
  }, [sortedFavorites, planListQuery])

  // 買い忘れ防止のため、カテゴリごとにグループ化する。
  // カテゴリ未設定の商品(自分で自由入力した商品など)は「その他」に
  // まとめ、常に一覧の最後に表示する。
  const OTHER_CATEGORY = 'その他'
  const groupedFavorites = useMemo(() => {
    const groups = new Map<string, Product[]>()
    for (const product of visibleFavorites) {
      const category = product.category ?? OTHER_CATEGORY
      const list = groups.get(category)
      if (list) {
        list.push(product)
      } else {
        groups.set(category, [product])
      }
    }
    const categoryNames = [...groups.keys()]
      .filter((name) => name !== OTHER_CATEGORY)
      .sort((a, b) => a.localeCompare(b, 'ja'))
    if (groups.has(OTHER_CATEGORY)) categoryNames.push(OTHER_CATEGORY)

    return categoryNames.map((category) => ({ category, items: groups.get(category)! }))
  }, [visibleFavorites])

  // 事前リストの予測変換もカテゴリ別に見出しを付けて表示する
  // (件数が多くなりがちな商品名候補データベースの中から探しやすくするため)
  const groupedWishlistSuggestions = useMemo(() => {
    const groups = new Map<string, CatalogSuggestion[]>()
    for (const suggestion of wishlistSuggestions) {
      const category = suggestion.category ?? OTHER_CATEGORY
      const list = groups.get(category)
      if (list) {
        list.push(suggestion)
      } else {
        groups.set(category, [suggestion])
      }
    }
    const categoryNames = [...groups.keys()]
      .filter((name) => name !== OTHER_CATEGORY)
      .sort((a, b) => a.localeCompare(b, 'ja'))
    if (groups.has(OTHER_CATEGORY)) categoryNames.push(OTHER_CATEGORY)

    return categoryNames.map((category) => ({ category, items: groups.get(category)! }))
  }, [wishlistSuggestions])

  function handleWishlistInputChange(value: string) {
    setWishlistInput(value)
    setIsWishlistSuggestionsOpen(true)
  }

  function handlePickWishlistSuggestion(suggestion: CatalogSuggestion) {
    // 名前を入力欄に反映するだけ(候補選択=即追加ではない)。店内で
    // タップした時に商品名が完全一致していれば自動で紐付けられるよう、
    // 候補と同じ表記に揃えることが主な目的。
    setWishlistInput(suggestion.name)
    setIsWishlistSuggestionsOpen(false)
  }

  function selectAll() {
    setCheckedIds(new Set(favorites.map((p) => p.id)))
  }
  function selectNone() {
    setCheckedIds(new Set())
  }

  async function handleStart() {
    const budget = Number(budgetInput)
    if (!Number.isFinite(budget) || budget <= 0) return

    setIsStarting(true)
    try {
      // チェックの入っている商品idを「予定」としてトリップに記録するだけで、
      // カートには入れない(価格・内容量は店内でカートに入れる瞬間に
      // 確認・入力する方針に変更したため)。ShoppingScreen側では、この
      // 予定に入っているがまだカートに入れていない商品を目立たせて表示する
      const plannedProductIds = favorites.filter((p) => isChecked(p.id)).map((p) => p.id)
      await startTrip(budget, plannedProductIds)
    } finally {
      setIsStarting(false)
    }
  }

  async function handleAddWishlistItem() {
    if (wishlistInput.trim().length === 0) return
    setIsAddingWishlistItem(true)
    setIsWishlistSuggestionsOpen(false)
    try {
      await addWishlistItem(wishlistInput)
      setWishlistInput('')
    } finally {
      setIsAddingWishlistItem(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* 上部固定:見込み合計・予算(ShoppingScreenの買い物中画面と同じ構成に揃えている) */}
      <header className="sticky top-0 z-10 bg-costco-blue-700 px-4 pb-4 pt-4 text-white shadow-md">
        <TricolorAccent />
        <div className="mb-1 mt-3 flex items-center justify-end">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="rounded-full p-1 text-costco-blue-100 transition-colors hover:bg-costco-blue-600"
            aria-label="設定"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-end justify-between">
          <span className="text-sm text-costco-blue-100">見込み合計(チェック中の商品)</span>
          <span className="text-3xl font-semibold tracking-tight">¥{estimatedTotal.toLocaleString()}</span>
        </div>

        <div className="mt-3">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/20">
            <div
              className={`h-full rounded-full transition-all ${
                isOverBudget ? 'bg-costco-red-400' : 'bg-white'
              }`}
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-costco-blue-100">
            <span>予算</span>
            <span className="flex items-center gap-0.5">
              ¥
              <input
                type="number"
                inputMode="numeric"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                className="w-20 border-b border-costco-blue-300 bg-transparent text-right text-white focus:outline-none"
              />
            </span>
          </div>
          {isOverBudget && (
            <div className="mt-1 text-right text-xs font-semibold text-costco-red-200">予算オーバー</div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-sm px-6 py-6">
        {/* 今回買う予定(マイ定番棚のチェックリスト。カテゴリ別に表示) */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            {favorites.length > 0 ? (
              <button
                onClick={() => setIsPlanListExpanded((v) => !v)}
                className="flex flex-1 items-center justify-between"
              >
                <div className="text-left">
                  <h2 className="font-semibold text-slate-800">今回買う予定</h2>
                  <p className="text-xs text-slate-500">
                    {favorites.length}点中{checkedCount}点選択中(不要なものだけ外してください)
                  </p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${
                    isPlanListExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
            ) : (
              <h2 className="font-semibold text-slate-800">今回買う予定</h2>
            )}
            <button
              onClick={() => setIsManageFavoritesOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500"
            >
              <ListPlus className="h-3.5 w-3.5" />
              管理
            </button>
          </div>

          {favorites.length === 0 && (
            <p className="mt-3 text-xs text-slate-400">
              まだマイ定番棚に商品が登録されていません。「管理」から買い物前に登録しておけます。
            </p>
          )}

          {favorites.length > 0 &&
            (isPlanListExpanded && (
              <div className="mt-4">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={planListQuery}
                    onChange={(e) => setPlanListQuery(e.target.value)}
                    placeholder="商品名で絞り込み"
                    className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-costco-blue-500 focus:outline-none"
                  />
                </div>

                <div className="mb-3 flex gap-2">
                  <button
                    onClick={selectAll}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 text-xs text-slate-600"
                  >
                    全部チェック
                  </button>
                  <button
                    onClick={selectNone}
                    className="flex-1 rounded-lg border border-slate-300 py-1.5 text-xs text-slate-600"
                  >
                    全部外す
                  </button>
                </div>

                <div className="max-h-[55vh] space-y-4 overflow-y-auto">
                  {groupedFavorites.map(({ category, items }) => {
                    const checkedInGroup = items.filter((p) => isChecked(p.id)).length
                    return (
                      <div key={category}>
                        <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                          <span>{category}</span>
                          <span>
                            {checkedInGroup}/{items.length}
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {items.map((product) => {
                            const checked = isChecked(product.id)
                            const summary = purchaseSummaryByProduct[product.id]
                            const suggested = getSuggestedCartDetails(product, summary)

                            return (
                              <li key={product.id}>
                                <button
                                  onClick={() => toggleChecked(product.id)}
                                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                                >
                                  <span
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                                      checked ? 'border-costco-red-600 bg-costco-red-600' : 'border-slate-300'
                                    }`}
                                  >
                                    {checked && <Check className="h-3.5 w-3.5 text-white" />}
                                  </span>
                                  <span
                                    className={`min-w-0 flex-1 truncate text-sm ${
                                      checked ? 'text-slate-800' : 'text-slate-400 line-through'
                                    }`}
                                  >
                                    {product.name}
                                  </span>
                                  <span className="shrink-0 text-right">
                                    <span
                                      className={`block text-base font-bold ${
                                        checked ? 'text-costco-red-700' : 'text-slate-400'
                                      }`}
                                    >
                                      ¥{suggested.price.toLocaleString()}
                                    </span>
                                    {summary && (
                                      <span className="block text-[10px] leading-tight text-slate-400">
                                        前回購入価格
                                      </span>
                                    )}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                  {groupedFavorites.length === 0 && (
                    <p className="py-4 text-center text-xs text-slate-400">見つかりませんでした</p>
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* 事前買い物予定リスト(定番棚にない、今回だけ欲しいもの) */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 flex items-center gap-1.5 font-semibold text-slate-800">
            <ClipboardList className="h-4 w-4 text-costco-blue-600" />
            今回だけ買いたいもの(メモ)
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            定番棚にない特別なものを自由にメモできます。店内でタップしてカートに追加できます。
          </p>

          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={wishlistInput}
                onChange={(e) => handleWishlistInputChange(e.target.value)}
                onFocus={() => setIsWishlistSuggestionsOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddWishlistItem()
                }}
                placeholder="例:トイペ"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-costco-blue-500 focus:outline-none"
              />
              {isWishlistSuggestionsOpen && groupedWishlistSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {groupedWishlistSuggestions.map(({ category, items }) => (
                    <div key={category}>
                      <div className="sticky top-0 border-b border-slate-100 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
                        {category}
                      </div>
                      <ul>
                        {items.map((item, index) => (
                          <li key={item.id ?? `catalog-${category}-${index}`}>
                            <button
                              type="button"
                              onClick={() => handlePickWishlistSuggestion(item)}
                              className="flex w-full items-start gap-2 border-b border-slate-50 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                            >
                              <Search className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                              <span className="flex-1 break-words leading-snug">{item.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleAddWishlistItem}
              disabled={isAddingWishlistItem || wishlistInput.trim().length === 0}
              className="flex shrink-0 items-center justify-center rounded-lg bg-costco-red-600 px-3 text-white transition-colors active:bg-costco-red-700 disabled:opacity-40"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {wishlist.length === 0 ? (
            <p className="text-xs text-slate-400">まだメモがありません</p>
          ) : (
            <ul className="space-y-2">
              {wishlist.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="text-slate-700">{item.raw_name}</span>
                  <button
                    onClick={() => removeWishlistItem(item.id)}
                    className="text-slate-300"
                    aria-label="削除"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 下部固定:買い物を始めるボタン */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white p-4">
        <button
          onClick={handleStart}
          disabled={isStarting}
          className="mx-auto flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-4 text-lg font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
        >
          {isStarting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          買い物を始める
        </button>
      </div>

      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      {isManageFavoritesOpen && (
        <ManageFavoritesModal onClose={() => setIsManageFavoritesOpen(false)} />
      )}
    </div>
  )
}
