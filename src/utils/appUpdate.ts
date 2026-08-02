// PWA(オフラインでも起動できるようキャッシュされたアプリ)は、
// 新しいバージョンをpushしても、スマホ側で自動的にすぐ切り替わるとは
// 限らない(古いキャッシュが残ったままになることがある)。
// この関数は「Service Worker(裏側のキャッシュの仕組み)を登録解除し、
// 保存されているキャッシュを全部消してから再読み込みする」ことで、
// 確実に最新版を取得し直す「強制アップデート」を行う。

export async function forceUpdateApp(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if ('caches' in window) {
    const cacheKeys = await caches.keys()
    await Promise.all(cacheKeys.map((key) => caches.delete(key)))
  }

  // キャッシュを迂回して、サーバーから直接最新のファイルを取得し直す
  window.location.reload()
}
