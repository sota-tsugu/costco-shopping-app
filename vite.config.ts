import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pagesは「https://ユーザー名.github.io/リポジトリ名/」という
// サブディレクトリ配下でアプリが公開されるため、base(基準パス)を
// リポジトリ名に合わせて設定する。これを忘れるとCSS/JSが読み込まれず
// 画面が真っ白になるので注意。
const REPO_NAME = 'costco-shopping-app'

export default defineConfig({
  base: `/${REPO_NAME}/`,
  plugins: [
    react(),
    VitePWA({
      // 'prompt': 新しいバージョンを見つけても勝手には切り替えず、
      // アプリ側(src/components/UpdateBanner.tsx)でユーザーに確認してから
      // 更新する。injectRegister: false と組み合わせ、Service Workerの
      // 登録もUpdateBanner側のuseRegisterSWフックで行う(二重登録防止)。
      registerType: 'prompt',
      injectRegister: false,
      workbox: {
        // jpgはカート追加アニメーション用の画像(src/assets/cart-icon.jpg)
        // のためにオフラインキャッシュ対象へ追加した
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
        // FirebaseのSDK+商品名候補データベースを含むため、通常の上限(2MB)
        // だとオフラインキャッシュの対象から漏れることがあるため広げておく
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: '我が家専用コストコ買い物リスト',
        short_name: 'コストコ買い物',
        description: '我が家専用のコストコ買い物リストアプリ(オフライン対応)',
        start_url: `/${REPO_NAME}/`,
        scope: `/${REPO_NAME}/`,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1e40af',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
