import { useState } from 'react'
import {
  X,
  ListChecks,
  ShoppingCart,
  Camera,
  CheckCircle2,
  ReceiptJapaneseYen,
  ChevronDown,
  Users,
  Wifi,
} from 'lucide-react'

// 設定画面から開く「使い方・よくある質問」画面。
// 基本の使い方(ステップ形式)・主な機能・FAQ(アコーディオン形式)の
// 3部構成。非エンジニアのSOTAさんや、初めてこのアプリに触れる
// パートナーの方が、迷った時に読み返せる場所として用意した

type Props = {
  onClose: () => void
}

const STEPS = [
  {
    icon: Users,
    title: '家族の設定(初回だけ)',
    body: '「新しく家族を作る」を押すと家族コードが発行されます。パートナーの端末では「家族コードを入力して参加する」から同じコードを入力すると、以降のデータがリアルタイムで共有されます。',
  },
  {
    icon: ListChecks,
    title: '計画を立てる',
    body: '定番商品リストから今回買うものにチェックを入れ、予算・行く予定日・店舗を入力します。行く予定日と店舗は、買い物を始める前に必ず入力する必要があります。',
  },
  {
    icon: ShoppingCart,
    title: '買い物を始める',
    body: '「買い物を始める」を押すと店内モードに切り替わります。チェックした商品をカートへ入れると、カート画面のイラストに商品が積み上がっていきます。',
  },
  {
    icon: Camera,
    title: '計画に無い商品を追加',
    body: 'カート画面の「バーコードで追加」から、その場でスキャンして商品を追加できます。過去のスキャン履歴や商品データベースから、商品名が自動で入力される場合があります。',
  },
  {
    icon: CheckCircle2,
    title: '会計する',
    body: '「購入する」を押すと確認画面を経て会計が完了します。カートが空になった様子を確認した後、レシート画面が表示されます。',
  },
  {
    icon: ReceiptJapaneseYen,
    title: '振り返る',
    body: '購入履歴画面(ヘッダーの「購入履歴」)から、年間利用額・買い物ごとの推移・カテゴリ別の支出割合を確認できます。商品名をタップすると、その商品の値上がり/値下がりも見られます。',
  },
]

const FAQS: { question: string; answer: string }[] = [
  {
    question: 'パートナーと共有するにはどうすればいいですか?',
    answer:
      '設定画面でこの端末の家族コードを確認し、パートナーの端末の初回起動画面(または設定画面の「家族コードを切り替える」)で同じコードを入力してもらってください。個人のGoogleアカウントなどのログインは不要です。',
  },
  {
    question: '新しい機能が出てこない・画面がおかしいです',
    answer:
      'オフラインでも使えるように内容を端末に保存しているため、更新がすぐには反映されないことがあります。設定画面の「アプリを最新の状態に更新する」をお試しください。',
  },
  {
    question: '買い物中の表示(経過時間など)がおかしいまま元に戻りません',
    answer:
      '設定画面の「今回買うものリストの進行状態をリセット」で、今の買い物の進行状態(チェック中の商品・カートの中身)だけを初期化できます。定番商品リストや購入履歴は消えません。',
  },
  {
    question: '行きたい店舗が一覧に無い場合はどうすればいいですか?',
    answer:
      '「行く予定日・店舗」の入力画面で、店舗の選択肢から「その他(自由入力)」を選ぶと、好きな店舗名を直接入力できます。',
  },
  {
    question: '電波が悪い場所でも使えますか?',
    answer:
      'はい。オフライン中でも今まで通り操作でき、内容は端末に一時保存されます。電波が戻ると、自動でクラウド(Firestore)と同期されます。',
  },
  {
    question: '無料で使い続けられますか?',
    answer:
      'はい。このアプリは無料での運用を前提に作られており、今後も有料化の予定はありません。',
  },
  {
    question: 'レシートはどこに保存されますか?',
    answer:
      '会計完了後に表示されるレシート画面の「保存する」から、画像として端末の共有機能(写真に保存・家族に送るなど)を使って保存できます。アプリの中には保存されません。',
  },
  {
    question: '購入した後に金額や数量を間違えたことに気づきました',
    answer:
      '購入履歴画面で該当の商品名をタップすると、単価比較シートが開きます。そこに表示される過去の購入記録から、訂正・削除ができます。',
  },
  {
    question: '定番商品リストを空にしても大丈夫ですか?',
    answer:
      '購入履歴は別の場所に保存されているため消えません。ただし、商品を登録し直す際に商品名を変えると、過去の記録とは別の商品として扱われる場合があります。',
  },
]

export function HelpModal({ onClose }: Props) {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">使い方・よくある質問</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <section className="mb-6">
          <h3 className="mb-2.5 text-xs font-semibold text-slate-500">基本の使い方</h3>
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-2.5 rounded-xl bg-slate-50 p-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-costco-blue-600 text-white">
                  <step.icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {i + 1}. {step.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-2">
          <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Wifi className="h-3.5 w-3.5" />
            よくある質問
          </h3>
          <ul className="space-y-1.5">
            {FAQS.map((faq, i) => {
              const isOpen = openFaqIndex === i
              return (
                <li key={i} className="rounded-xl border border-slate-100 bg-white">
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="text-sm text-slate-700">{faq.question}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <p className="border-t border-slate-100 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
                      {faq.answer}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
