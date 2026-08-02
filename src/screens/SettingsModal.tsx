import { useState } from 'react'
import { X, RefreshCw, Loader2, Users, Copy, Check, LogOut } from 'lucide-react'
import { forceUpdateApp } from '../utils/appUpdate'
import { forgetHousehold, getSavedHouseholdId } from '../firebase/household'

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
  const householdId = getSavedHouseholdId()

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
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">設定</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <Users className="h-4 w-4 text-blue-700" />
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
            マイ定番棚や購入履歴などのデータは別の場所に保存されているため、更新しても消えません。
          </p>
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-bold text-white shadow disabled:opacity-50"
          >
            {isUpdating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
            {isUpdating ? '更新しています…' : 'アプリを最新の状態に更新する'}
          </button>
        </div>
      </div>
    </div>
  )
}
