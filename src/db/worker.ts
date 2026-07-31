// このファイルはWeb Worker(メイン画面の動きを止めずに裏側で計算する
// 仕組み)の中で動く。sql.js(ブラウザ内で動くSQLite)のクエリ実行は
// 「同期処理」で少し時間がかかることがあるため、メイン画面と分離して
// ここで実行することで、タップ操作がカクつかないようにしている。
//
// メイン画面(dbClient.ts)とはpostMessageでやり取りする。
// リクエストごとに一意のidを付け、レスポンスに同じidを付けて返すことで
// 「どの依頼に対する返事か」を対応付けている。

import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
// ViteのURL importを使い、sql.jsのWASM本体(データベースエンジン本体)
// を静的アセットとしてバンドルする。これによりPWAのキャッシュ対象にも
// 自動的に含まれる。
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

type RequestMessage =
  | { id: number; type: 'init'; payload: { bytes: ArrayBuffer | null } }
  | { id: number; type: 'exec'; payload: { sql: string; params?: unknown[] } }
  | { id: number; type: 'run'; payload: { sql: string; params?: unknown[] } }
  | { id: number; type: 'export'; payload: Record<string, never> }

type ResponseMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

let SQL: SqlJsStatic | null = null
let db: Database | null = null

async function ensureSqlJsLoaded(): Promise<SqlJsStatic> {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: () => sqlWasmUrl })
  }
  return SQL
}

// スキーマのバージョン管理(マイグレーション)。
// テーブル構造を変える必要が出てきたら、ここに新しいバージョンの
// ブロックを追加していく。既存ユーザーのデータを壊さずに構造を
// 変更するための仕組み。schema_versionテーブルに適用済みのバージョン
// を記録しておき、まだ適用されていないバージョンだけを順番に実行する。
type Migration = {
  version: number
  description: string
  statements: string[]
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'STEP0動作確認用のダミーテーブル',
    statements: [
      `CREATE TABLE IF NOT EXISTS smoke_test (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
    ],
  },
  {
    version: 2,
    description: 'フェーズ1-a: Product/ShoppingTrip/Purchaseの最小テーブル構成。smoke_testは撤去',
    statements: [
      `DROP TABLE IF EXISTS smoke_test;`,
      `CREATE TABLE IF NOT EXISTS product (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT,
        amount REAL,
        unit TEXT,
        default_price REAL,
        is_favorite INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS shopping_trip (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        budget REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        actual_total REAL
      );`,
      `CREATE TABLE IF NOT EXISTS purchase (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES product(id),
        trip_id INTEGER NOT NULL REFERENCES shopping_trip(id),
        price REAL NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_purchase_product_date ON purchase(product_id, created_at);`,
      `CREATE INDEX IF NOT EXISTS idx_purchase_trip ON purchase(trip_id);`,
    ],
  },
]

function runMigrations(database: Database) {
  database.run(
    `CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL
    );`,
  )

  const result = database.exec('SELECT MAX(version) AS current_version FROM schema_version')
  const currentVersion = (result[0]?.values[0]?.[0] as number | null) ?? 0

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version,
  )

  for (const migration of pending) {
    for (const statement of migration.statements) {
      database.run(statement)
    }
    database.run('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)', [
      migration.version,
      new Date().toISOString(),
    ])
  }
}

async function handleInit(bytes: ArrayBuffer | null) {
  const sqlJs = await ensureSqlJsLoaded()
  db = bytes ? new sqlJs.Database(new Uint8Array(bytes)) : new sqlJs.Database()

  runMigrations(db)

  return { initialized: true }
}

function requireDb(): Database {
  if (!db) {
    throw new Error('DBが初期化されていません。先にinitを呼んでください。')
  }
  return db
}

function handleExec(sql: string, params: unknown[] = []) {
  const database = requireDb()
  const result = database.exec(sql, params as never)
  return result
}

function handleRun(sql: string, params: unknown[] = []) {
  const database = requireDb()
  database.run(sql, params as never)
  return { success: true }
}

function handleExport() {
  const database = requireDb()
  const bytes = database.export()
  return bytes
}

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const { id, type } = event.data

  try {
    let result: unknown

    switch (type) {
      case 'init':
        result = await handleInit(event.data.payload.bytes)
        break
      case 'exec':
        result = handleExec(event.data.payload.sql, event.data.payload.params)
        break
      case 'run':
        result = handleRun(event.data.payload.sql, event.data.payload.params)
        break
      case 'export': {
        const bytes = handleExport()
        // Uint8Arrayの実体(ArrayBuffer)をコピーなしで転送し高速化する
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        const response: ResponseMessage = { id, ok: true, result: buffer }
        // @ts-expect-error transferable objects の第2引数
        self.postMessage(response, [buffer])
        return
      }
      default:
        throw new Error(`未対応のリクエストタイプ: ${type}`)
    }

    const response: ResponseMessage = { id, ok: true, result }
    self.postMessage(response)
  } catch (error) {
    const response: ResponseMessage = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}
