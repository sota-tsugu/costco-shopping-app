// sql.js はメモリ上で動くデータベースなので、ブラウザを閉じたり
// リロードしたりすると内容が消えてしまう。
// そのため「DBの中身をバイト列として書き出し、IndexedDB(ブラウザに
// 用意されている保存領域)に保存する」処理をこのファイルで行う。
//
// STEP0時点ではダミーテーブルの動作確認用。本番用のProduct/Purchase
// などのテーブル設計はSTEP1以降で扱う。

const DB_NAME = 'costco-app-store'
const DB_VERSION = 1
const STORE_NAME = 'sqlite-file'
const RECORD_KEY = 'main'

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** 保存しておいたsql.jsのDBバイト列を読み込む。保存がなければnullを返す */
export async function loadDbBytes(): Promise<Uint8Array | null> {
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(RECORD_KEY)

    request.onsuccess = () => {
      const value = request.result as Uint8Array | undefined
      resolve(value ?? null)
    }
    request.onerror = () => reject(request.error)
  })
}

/** sql.jsのDBバイト列をIndexedDBに保存する(上書き保存) */
export async function saveDbBytes(bytes: Uint8Array): Promise<void> {
  const db = await openIndexedDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(bytes, RECORD_KEY)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
