import { useState } from 'react'
import { X, RefreshCw, Loader2 } from 'lucide-react'
import { forceUpdateApp } from '../utils/appUpdate'

// アプリの設定画面(モーダル)。今のところ「アプリを最新の状態に更新する」
// ボタンのみ。オフライン対応のため、pushした変更がスマホ側にすぐには
// 反映されないことがある(キャッシュが残るため)。その時にこのボタンで
// 強制的に最新版を取得し直せるようにしている。

type Props = {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const [isUpdating, setIsUpdating] = useState(false)

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

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">設定</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
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
