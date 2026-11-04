import { useState } from 'react'
import MediaLibraryModal from './MediaLibraryModal'

// ── Image picker ────────────────────────────────────────────────────────────────

export default function ImagePicker({ label, value, onChange, testId }: {
  label: string
  value: string
  onChange: (url: string) => void
  testId?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)

  const handleUpload = async (file: File) => {
    setUploading(true); setUploadError('')
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Imaginea depășește limita de 5 MB.')
      setUploading(false)
      return
    }
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/media', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('betel-admin-token')}` },
        body: fd,
      })
      if (!res.ok) {
        let msg = `Eroare la upload (${res.status})`
        try { const j = await res.json(); msg = j.error ?? msg } catch {}
        throw new Error(msg)
      }
      const json = await res.json()
      onChange(json.url)
    } catch (e: any) { setUploadError(e.message) } finally { setUploading(false) }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  return (
    <div>
      <label className="block text-xs tracking-widest uppercase text-[var(--muted)] font-content mb-1">
        {label}
      </label>

      {value ? (
        <div className="space-y-2">
          <img src={value} alt="" data-testid={testId} className="max-h-32 object-cover opacity-80" />
          <div className="flex gap-2">
            <label className="px-3 py-1.5 border border-[var(--border)] text-xs tracking-widest uppercase font-content cursor-pointer hover:border-[var(--accent)] transition-colors"
                   data-testid="upload-btn">
              {uploading ? '…' : 'Înlocuiește'}
              <input type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
            </label>
            <button type="button" onClick={() => setShowLibrary(true)}
              className="px-3 py-1.5 border border-[var(--border)] text-xs tracking-widest uppercase font-content hover:border-[var(--accent)] transition-colors">
              Librărie
            </button>
            <button type="button" onClick={() => onChange('')}
              className="px-3 py-1.5 text-xs tracking-widest uppercase font-content text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              Șterge
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label
            className={`flex flex-col items-center justify-center gap-1 border-2 border-dashed h-28 cursor-pointer transition-colors ${
              dragging ? 'border-[var(--accent)] bg-[var(--surface)]' : 'border-[var(--border)] hover:border-[var(--accent)]'
            }`}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            data-testid="upload-btn"
          >
            {uploading
              ? <span className="text-sm font-content text-[var(--muted)]">Se încarcă…</span>
              : <>
                  <span className="text-sm font-content text-[var(--muted)]">Trage imaginea aici</span>
                  <span className="text-xs font-content text-[var(--muted)] opacity-60">sau click pentru upload</span>
                </>
            }
            <input type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
          </label>
          <button type="button" onClick={() => setShowLibrary(true)}
            className="w-full px-3 py-1.5 border border-[var(--border)] text-xs tracking-widest uppercase font-content hover:border-[var(--accent)] transition-colors">
            Alege din librărie
          </button>
        </div>
      )}

      {uploadError && <p className="text-[var(--danger)] text-xs font-content mt-1">{uploadError}</p>}
      {showLibrary && (
        <MediaLibraryModal
          onSelect={url => { onChange(url); setShowLibrary(false) }}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  )
}

