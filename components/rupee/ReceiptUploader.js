'use client';
import { useRef, useState } from 'react';
import { Upload, Camera, X, Loader2, FileImage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SecurityAlertBanner } from './SecurityAlertBanner';

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX = 10 * 1024 * 1024;

// Reads an image to a data URL client-side, validates type/size, and hands it to onScan.
export function ReceiptUploader({ onScan, scanning }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  const handleFile = (file) => {
    setError('');
    if (!file) return;
    if (!ALLOWED.includes(file.type)) { setError('Please choose a JPG, PNG or WebP image.'); return; }
    if (file.size > MAX) { setError('Image must be under 10 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      // Downscale to a JPEG (<= ~1600px). This keeps it under OCR limits and strips EXIF metadata.
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1600;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          setPreview(canvas.toDataURL('image/jpeg', 0.72));
        } catch (e) {
          setPreview(reader.result);
        }
      };
      img.onerror = () => setPreview(reader.result);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${drag ? 'border-primary bg-secondary' : 'border-border'}`}
      >
        {preview ? (
          <div className="space-y-3">
            <div className="relative inline-block">
              <img src={preview} alt="Receipt preview" className="max-h-56 rounded-lg border mx-auto" />
              <button onClick={() => setPreview(null)} className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-rose-500 text-white flex items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex justify-center gap-2">
              <Button onClick={() => onScan(preview)} disabled={scanning}>
                {scanning ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Scanning…</> : <><Camera className="h-4 w-4 mr-1" /> Scan receipt</>}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center mx-auto"><FileImage className="h-7 w-7 text-primary" /></div>
            <div>
              <p className="font-medium">Drop a receipt image here</p>
              <p className="text-sm text-muted-foreground">or choose a file (JPG, PNG, WebP · max 10 MB)</p>
            </div>
            <Button variant="outline" onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4 mr-1" /> Choose image</Button>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
      <div className="mt-3"><SecurityAlertBanner variant="info">Your original image stays private. Sensitive details like phone numbers are masked before saving, and you can delete it anytime.</SecurityAlertBanner></div>
    </div>
  );
}

export default ReceiptUploader;
