// 「家族(世帯)」の仕組み。
//
// 【設計方針】各自のGoogleアカウントでログインする方式ではなく、
// 「家族コード」という合言葉のような文字列を家族内で共有する方式にした
// (SOTAさんとの相談の上で決定。以前使ったFirebaseアプリでも個人の
// Googleアカウントログインはしていなかったとのこと)。
// 端末の認証自体はFirebaseの「匿名認証」を使う(ユーザー登録なしで
// 使える認証)。データの読み書きは、この家族コードをドキュメントの
// パスに含めることで区切っている。つまり「家族コードを知っている端末
// だけが、そのデータを見られる」という、合言葉に近い仕組み。
//
// 【セキュリティ上の注意点】これは本格的なアクセス制御ではなく、
// 家族コードという文字列を知っているかどうかだけで判断する簡易的な
// 仕組み。買い物データ(金額・商品名)という重要度がそこまで高くない
// 情報を扱うためこの割り切った設計にしている。家族コードは十分に
// 長いランダムな文字列にしてあり、他人が偶然当てることは事実上ない。

import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './config'

const STORAGE_KEY = 'costco-app-household-id'

/** ランダムな家族コードを生成する(例: "K3F9-7QXP-2MRT") */
export function generateHouseholdCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 紛らわしい文字(0/O, 1/I)は除外
  const randomPart = (length: number) =>
    Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `${randomPart(4)}-${randomPart(4)}-${randomPart(4)}`
}

/** 端末に保存されている家族コードを取得する(未設定ならnull) */
export function getSavedHouseholdId(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

function saveHouseholdId(id: string) {
  localStorage.setItem(STORAGE_KEY, id)
}

/** Firebaseへの匿名サインインを行う(まだの場合)。完了を待ってからDB操作すること */
export function ensureSignedIn(): Promise<User> {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe()
          resolve(user)
        }
      },
      reject,
    )
    if (!auth.currentUser) {
      signInAnonymously(auth).catch(reject)
    }
  })
}

/** 新しい家族を作る(コードを新規生成して保存する) */
export async function createNewHousehold(): Promise<string> {
  await ensureSignedIn()
  const code = generateHouseholdCode()
  await setDoc(doc(db, 'households', code), {
    createdAt: serverTimestamp(),
  })
  saveHouseholdId(code)
  return code
}

/** 既存の家族コードで参加する。コードが存在しない場合はエラーを投げる */
export async function joinHousehold(code: string): Promise<void> {
  await ensureSignedIn()
  const normalized = code.trim().toUpperCase()
  const snapshot = await getDoc(doc(db, 'households', normalized))
  if (!snapshot.exists()) {
    throw new Error('その家族コードが見つかりませんでした。入力内容を確認してください。')
  }
  saveHouseholdId(normalized)
}

/** この端末を家族コードの登録から外す(別の家族に切り替えたい時などに使う) */
export function forgetHousehold(): void {
  localStorage.removeItem(STORAGE_KEY)
}
