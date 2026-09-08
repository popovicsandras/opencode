// Pure split-width helpers used by the renderer shell. Kept dependency-free
// (a plain `Storage`-shaped object is injected) so persistence logic can be
// exercised with a real in-memory object under `bun:test`, without a DOM.

export type DesignerBrowserWidthStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function clampSplitWidth(width: number, min: number, max: number): number {
  if (!Number.isFinite(width)) return min
  return Math.min(Math.max(width, min), Math.max(min, max))
}

export function readPersistedSplitWidth(
  storage: DesignerBrowserWidthStorage | undefined,
  key: string,
  fallback: number,
): number {
  const raw = storage?.getItem(key)
  const parsed = raw === null || raw === undefined ? NaN : Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function writePersistedSplitWidth(
  storage: DesignerBrowserWidthStorage | undefined,
  key: string,
  width: number,
): void {
  storage?.setItem(key, String(width))
}
