// メイン画面(UI)側からWeb Workerに対してSQLの実行を依頼するための
// 小さな仲介役。Promiseベースにすることで、呼び出し側は
// `await dbClient.exec(...)` のように普通の非同期関数として使える。

import { loadDbBytes, saveDbBytes } from './persistence'

type PendingResolvers = {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

class DbClient {
  private worker: Worker
  private nextId = 1
  private pending = new Map<number, PendingResolvers>()
  private initPromise: Promise<void> | null = null

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })

    this.worker.onmessage = (event: MessageEvent) => {
      const { id, ok, result, error } = event.data
      const pending = this.pending.get(id)
      if (!pending) return
      this.pending.delete(id)

      if (ok) {
        pending.resolve(result)
      } else {
        pending.reject(new Error(error))
      }
    }
  }

  private call(type: string, payload: unknown, transfer: Transferable[] = []): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, type, payload }, transfer)
    })
  }

  /** 初回起動時に一度だけ呼ぶ。IndexedDBに保存済みのデータがあれば復元する */
  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const savedBytes = await loadDbBytes()
        const buffer = savedBytes
          ? savedBytes.buffer.slice(savedBytes.byteOffset, savedBytes.byteOffset + savedBytes.byteLength)
          : null
        await this.call('init', { bytes: buffer }, buffer ? [buffer] : [])
      })()
    }
    return this.initPromise
  }

  /** SELECTなど、結果行を返すSQLを実行する */
  async exec(sql: string, params: unknown[] = []) {
    await this.init()
    return this.call('exec', { sql, params }) as Promise<
      { columns: string[]; values: unknown[][] }[]
    >
  }

  /** INSERT/UPDATE/CREATE TABLEなど、結果行を返さないSQLを実行する */
  async run(sql: string, params: unknown[] = []) {
    await this.init()
    return this.call('run', { sql, params })
  }

  /** 現在のDBの中身をIndexedDBに保存する(永続化) */
  async persist(): Promise<void> {
    await this.init()
    const buffer = (await this.call('export', {})) as ArrayBuffer
    await saveDbBytes(new Uint8Array(buffer))
  }
}

// アプリ全体で1つのWorker・1つのDB接続を使い回す
export const dbClient = new DbClient()
