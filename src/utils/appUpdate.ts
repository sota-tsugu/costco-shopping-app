// PWA(オフラインでも起動できるようキャッシュされたアプリ)は、
// 新しいバージョンをpushしても、スマホ側で自動的にすぐ切り替わるとは
// 限らない(古いキャッシュが残ったままになることがある)。
// この関数は「Service Worker(裏側のキャッシュの仕組み)を登録解除し、
// 保存されているキャッシュを全部消してから再読み込みする」ことで、
// 確実に最新版を取得し直す「強制アップデート」を行う。
//
// 【location.reload()だけでは不十分だった点】Service Worker・
// Cache APIのキャッシュを消しても、location.reload()自体は通常の
// ページ読み込みと同じ扱いになり、ブラウザが持つ別のHTTPキャッシュ
// (GitHub Pages側のCache-Controlヘッダーに基づくもの)まではバイパス
// できず、結局古いindex.htmlが表示され続けてしまう可能性があった。
// URLの末尾に毎回変わるパラメータ(現在時刻)を付けて遷移することで、
// ブラウザに「これは別のURLだ」と認識させ、HTTPキャッシュも確実に
// 迂回してサーバーから直接取得し直すようにした
export async function forceUpdateApp(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys()
    await Promise.all(cacheKeys.map((key) => caches.delete(key)))
  }

  const url = new URL(window.location.href)
  url.searchParams.set('_freshness', String(Date.now()))
  window.location.replace(url.toString())
}
