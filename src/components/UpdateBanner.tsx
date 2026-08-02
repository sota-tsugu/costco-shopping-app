import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// 新しいバージョンがGitHubに公開された時に、アプリを開いたタイミングや
// 使用中に自動で気づけるようにする通知バナー。
//
// SettingsModalの「アプリを最新の状態に更新する」ボタン(キャッシュを
// 全部消す少し強引な方法)とは違い、こちらはPWAの標準の仕組み
// (vite-plugin-pwaのuseRegisterSWフック)を使って「新しいバージョンが
// あるかどうか」を自動でチェックし、あった時だけ知らせる、より
// 軽い方法。1時間おきに裏側で確認する(通信量はごくわずか。
// SOTAさんへの回答:数十KB程度)。
//
// これでも反映されないくらい古い状態になっている場合は、引き続き
// SettingsModalの強制更新ボタンを使う。

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1時間ごとに確認

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // 一定間隔で新しいバージョンがないか裏側で確認する
      setInterval(() => {
        registration.update()
      }, CHECK_INTERVAL_MS)
    },
  })

  // 画面を開いた直後にも一度だけ確認しておく
  useEffect(() => {
    navigator.serviceWorker?.getRegistration().then((registration) => {
      registration?.update()
    })
  }, [])

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
      <span>新しいバージョンがあります</span>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => setNeedRefresh(false)}
          className="rounded-lg px-2 py-1 text-slate-300"
        >
          あとで
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          className="flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 font-bold"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          今すぐ更新
        </button>
      </div>
    </div>
  )
}
