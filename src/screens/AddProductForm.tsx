import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'

// 「マイ定番棚」に新しい商品を登録するための簡易フォーム。
// STEP1(フェーズ1-a)時点では、商品名と価格だけを入力する最小構成。
// 内容量(g/ml)やJANコードなどはフェーズ1-b以降で扱う。

type Props = {
  onClose: () => void
  onSubmit: (name: string, price: number) => Promise<void>
}

export function AddProductForm({ onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const canSubmit = name.trim().length > 0 && Number(price) > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setIsSaving(true)
    try {
      await onSubmit(name.trim(), Number(price))
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">定番棚に商品を追加</h2>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">商品名</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例:トイレットペーパー"
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-blue-600 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-slate-500">価格(円)</label>
        <input
          type="number"
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="例:1580"
          className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-blue-600 focus:outline-none"
        />

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-bold text-white shadow disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          追加する
        </button>
      </div>
    </div>
  )
}
