export interface ProcessedImage { blob: Blob; width: number; height: number; name: string }

/**
 * Downscale + re-encode a photo so receipts stay small in IndexedDB (an iPhone photo is 3-5 MB;
 * 1600px JPEG ~ 250 KB and is still very legible for receipts).
 */
export async function processImage(file: File, maxEdge = 1600, quality = 0.82): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  } catch {
    bitmap = null
  }
  const src: { w: number; h: number; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void } = bitmap
    ? { w: bitmap.width, h: bitmap.height, draw: (c, w, h) => c.drawImage(bitmap!, 0, 0, w, h) }
    : await loadViaImg(file)
  const scale = Math.min(1, maxEdge / Math.max(src.w, src.h))
  const w = Math.max(1, Math.round(src.w * scale))
  const h = Math.max(1, Math.round(src.h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  src.draw(ctx, w, h)
  bitmap?.close?.()
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not encode image'))), 'image/jpeg', quality)
  )
  const base = (file.name || 'photo').replace(/\.[^.]+$/, '')
  return { blob, width: w, height: h, name: base + '.jpg' }
}

function loadViaImg(file: File): Promise<{ w: number; h: number; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight, draw: (c, w, h) => { c.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url) } })
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')) }
    img.src = url
  })
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`
}

export function dataUrlToBlob(url: string): Blob {
  const [head, b64] = url.split(',')
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
