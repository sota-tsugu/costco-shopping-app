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
// 軽い方法。通信量はごくわずか(SOTAさんへの回答:数十KB程度)。
//
// 【バナーが出たり出なかったりする問題への対応】以前は「起動直後に
// 1回だけ確認+1時間おきに確認」という仕組みだったが、このアプリは
// 買い物のたびに短時間だけ開いてすぐ閉じる使われ方が中心なので、
// 1時間おきの確認が実質ほとんど発火しないまま終わっていた。
// 「アプリを開くたび毎回確認する」ように、画面が表示状態になった
// 瞬間(visibilitychange)にも確認するよう変更した。ホーム画面の
// アイコンから開き直した時や、他アプリから戻ってきた時にも確認が
// 走るようになる。
//
// 【それでも100%ではない点】iPhoneのSafari(PWA)は、Service Worker
// の更新検知そのものにOS側の既知の癖があり、まれに検知が遅れる
// ことがある。これでも反映されないくらい古い状態になっている場合は、
// 引き続きSettingsModalの強制更新ボタンを使う。

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // 開きっぱなしの場合の保険として30分おきにも確認

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    function checkForUpdate() {
      navigator.serviceWorker?.getRegistration().then((registration) => {
        registration?.update()
      })
    }

    // 起動直後に一度確認
    checkForUpdate()

    // アプリを開き直した/前面に戻ってきたタイミングでも都度確認する
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkForUpdate()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 開いたまま使い続けているケースの保険として、一定間隔でも確認する
    const intervalId = setInterval(checkForUpdate, CHECK_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(intervalId)
    }
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
          className="flex items-center gap-1 rounded-lg bg-costco-red-600 px-3 py-1.5 font-semibold transition-colors active:bg-costco-red-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          今すぐ更新
        </button>
      </div>
    </div>
  )
}
