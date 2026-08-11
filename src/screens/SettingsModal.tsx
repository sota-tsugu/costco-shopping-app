import { useState } from 'react'
import { X, RefreshCw, Loader2, Users, Copy, Check, LogOut, Trash2, Wrench, HelpCircle } from 'lucide-react'
import { forceUpdateApp } from '../utils/appUpdate'
import { forgetHousehold, getSavedHouseholdId } from '../firebase/household'
import { useTripStore, resetStuckTrips } from '../store/tripStore'
import { HelpModal } from './HelpModal'

// アプリの設定画面(モーダル)。
// 「アプリを最新の状態に更新する」ボタンと、この端末が今どの家族コードに
// 紐づいているかの確認・切り替え機能を持つ。
//
// 【家族コードの切り替えについて】各端末でそれぞれ別々に「新しく家族を
// 作る」を押してしまうと、家族コードが別々になりデータが共有されない
// (よくある操作ミス)。その場合、片方の端末をここから「家族コードを
// 切り替える」で正しいコードに参加し直すことで直せる。

type Props = {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isClearingProducts, setIsClearingProducts] = useState(false)
  const [isResettingTrip, setIsResettingTrip] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const householdId = getSavedHouseholdId()
  const products = useTripStore((state) => state.products)
  const clearAllProducts = useTripStore((state) => state.clearAllProducts)

  async function handleUpdate() {
    setIsUpdating(true)
    try {
      await forceUpdateApp()
      // forceUpdateApp内でページが再読み込みされるため、通常ここには
      // 到達しないが、念のためfinallyでも状態を戻せるようにしておく
    } catch {
      setIsUpdating(false)
    }
  }

  function handleCopyCode() {
    if (!householdId) return
    navigator.clipboard.writeText(householdId)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  async function handleClearAllProducts() {
    if (products.length === 0) {
      window.alert('定番商品リストにはまだ何も登録されていません。')
      return
    }
    const confirmed = window.confirm(
      `定番商品リストの${products.length}件をすべて削除しますか?(元に戻せません)\n\n` +
        'これまでの購入履歴は別に保存されているため、削除しても消えません。',
    )
    if (!confirmed) return
    setIsClearingProducts(true)
    try {
      await clearAllProducts()
    } finally {
      setIsClearingProducts(false)
    }
  }

  // 一連の不具合調査の過程で、Firestore上に「進行中(planning/active)」
  // のまま残ってしまった壊れたトリップをまとめてリセットする。
  // 完了済みの購入履歴には触れないため、過去の記録は消えない
  async function handleResetStuckTrip() {
    const confirmed = window.confirm(
      '今の「今回買うものリスト」の進行状態をリセットしますか?\n\n' +
        '今チェックしている商品やカートの中身は失われます(定番商品リストや、これまでの購入履歴は消えません)。',
    )
    if (!confirmed) return
    setIsResettingTrip(true)
    try {
      const count = await resetStuckTrips()
      window.alert(count > 0 ? `${count}件のトリップをリセットしました。` : 'リセット対象のデータはありませんでした。')
      window.location.reload()
    } catch (error) {
      window.alert(`リセットに失敗しました。\n(${error instanceof Error ? error.message : String(error)})`)
    } finally {
      setIsResettingTrip(false)
    }
  }

  function handleSwitchHousehold() {
    const confirmed = window.confirm(
      'この端末を今の家族コードから切り離して、最初の画面(家族を作る/参加する)に戻ります。' +
        '別々に「新しく家族を作る」を押してしまった場合など、正しい家族コードに参加し直したい時に使ってください。\n\n' +
        'よろしいですか?',
    )
    if (!confirmed) return
    forgetHousehold()
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">設定</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <button
          onClick={() => setIsHelpOpen(true)}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-costco-blue-200 bg-white px-4 py-2.5 text-sm font-medium text-costco-blue-700 shadow-sm"
        >
          <HelpCircle className="h-4 w-4" />
          使い方・よくある質問
        </button>

        <div className="mb-4 rounded-lg bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <Users className="h-4 w-4 text-costco-blue-600" />
            この端末の家族コード
          </div>
          <div className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-white p-3">
            <span className="text-base font-bold tracking-wider text-slate-800">
              {householdId ?? '未設定'}
            </span>
            {householdId && (
              <button onClick={handleCopyCode} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                {isCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            )}
          </div>
          <p className="mb-3 text-xs text-slate-400">
            パートナーと表示中のコードが違うと、データが共有されません(別々に「新しく家族を作る」を押してしまった場合によく起こります)。
          </p>
          <button
            onClick={handleSwitchHousehold}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600"
          >
            <LogOut className="h-4 w-4" />
            家族コードを切り替える
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 p-4">
          <p className="mb-3 text-sm text-slate-600">
            このアプリは電波が悪い場所でも使えるよう、内容を端末に保存(キャッシュ)しています。
            そのため、新しい修正をしても自動ではすぐに反映されないことがあります。
            画面がおかしい・新しい機能が出てこない、という時はこちらをお試しください。
          </p>
          <p className="mb-3 text-xs text-slate-400">
            Firestore(クラウド)に保存されているデータは別の場所にあるため、更新しても消えません。
          </p>
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-costco-red-600 px-4 py-3 font-semibold text-white shadow transition-colors active:bg-costco-red-700 disabled:opacity-50"
          >
            {isUpdating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
            {isUpdating ? '更新しています…' : 'アプリを最新の状態に更新する'}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-3 text-sm text-slate-600">
            「買い物中」の表示がおかしいまま元に戻らない場合(経過時間の数字がおかしい、など)は、こちらで今の進行状態をリセットできます。
          </p>
          <p className="mb-3 text-xs text-slate-400">
            定番商品リスト・これまでの購入履歴には触れません。今チェックしている商品やカートの中身だけリセットされます。
          </p>
          <button
            onClick={handleResetStuckTrip}
            disabled={isResettingTrip}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-medium text-amber-700 disabled:opacity-50"
          >
            <Wrench className="h-4 w-4" />
            {isResettingTrip ? 'リセットしています…' : '今回買うものリストの進行状態をリセット'}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-4">
          <p className="mb-3 text-sm text-slate-600">
            定番商品リスト(現在{products.length}件)を一括で空にします。登録し直すまで「今回買うものリスト」に何も出てこなくなります。
          </p>
          <p className="mb-3 text-xs text-slate-400">
            これまでの購入履歴は別に保存されているため、消えません。ただし空にした後に登録し直した商品は、新しい商品として扱われます。
          </p>
          <button
            onClick={handleClearAllProducts}
            disabled={isClearingProducts}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {isClearingProducts ? '削除しています…' : '定番商品リストを空にする'}
          </button>
        </div>
      </div>

      {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}
    </div>
  )
}
