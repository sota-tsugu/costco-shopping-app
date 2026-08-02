// Firebase(Googleが提供する無料のクラウドサービス)の初期化。
//
// 【なぜこの値をコード内に直接書いているか(セキュリティ上問題ないか)】
// 通常、APIキーなどの秘匿情報はコードに直接書き込まない方針だが、
// このfirebaseConfigは例外。これは「サーバーの認証情報」ではなく
// 「このアプリがどのFirebaseプロジェクトと話すか」を示す公開情報で、
// Firebase公式のWebアプリでは最初からブラウザに埋め込む前提の値。
// 実際のデータ保護は、この値を隠すことではなく、Firestore側の
// セキュリティルール(誰が読み書きできるかのルール)で行う。
// 詳細: https://firebase.google.com/docs/projects/api-keys

import { initializeApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyATWKuu_wBUtgO1kdm_OWNG-m9fDBr91bY',
  authDomain: 'costco-shopping-app-39395.firebaseapp.com',
  projectId: 'costco-shopping-app-39395',
  storageBucket: 'costco-shopping-app-39395.firebasestorage.app',
  messagingSenderId: '23579128355',
  appId: '1:23579128355:web:1184f7d10512563ca9b796',
}

export const firebaseApp = initializeApp(firebaseConfig)

// persistentLocalCache: オフラインでもデータを読み書きできるようにする
// Firestore標準の仕組み。電波が悪いコストコ店内でも、直前に読み込んだ
// データを見たり、新しい操作(カートに追加など)を行ったりできる。
// 通信が回復すると、自動的にサーバー側と同期される。
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({}),
})

export const auth = getAuth(firebaseApp)
