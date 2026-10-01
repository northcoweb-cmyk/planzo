import type { OcrResult } from '../types/models'

/**
 * OCR-ready seam. No paid service is required: the default provider does nothing and the manual
 * receipt fields stay the source of truth. A later provider (on-device Tesseract.js, Apple Vision via
 * a wrapper, or a server) only needs to implement this interface and return suggestions.
 */
export interface ReceiptOcrProvider {
  readonly name: string
  available(): boolean
  extract(image: Blob): Promise<OcrResult>
}

export const NoOcrProvider: ReceiptOcrProvider = {
  name: 'none',
  available: () => false,
  extract: async () => ({ status: 'none' })
}

let provider: ReceiptOcrProvider = NoOcrProvider
export const getOcrProvider = () => provider
export const setOcrProvider = (p: ReceiptOcrProvider) => { provider = p }
