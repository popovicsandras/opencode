// Shared, Electron-free contract between the main, preload, and renderer
// pieces of the designer browser pane. Keeping this module free of runtime
// `electron` imports lets its validation logic run under plain `bun:test`.

export type DesignerBrowserBounds = {
  x: number
  y: number
  width: number
  height: number
}

/** The narrow renderer-facing surface exposed through the preload bridge. */
export type DesignerBrowserBridge = {
  show: () => Promise<void>
  hide: () => Promise<void>
  setBounds: (bounds: DesignerBrowserBounds) => Promise<void>
}

export const DESIGNER_BROWSER_CHANNELS = {
  show: "designer-browser-show",
  hide: "designer-browser-hide",
  setBounds: "designer-browser-set-bounds",
} as const

export const DESIGNER_BROWSER_HOME_URL = "https://www.google.com/"

/**
 * Selects how the pane is hosted. `"webview"` (default) puts it in the page
 * DOM as an Electron `<webview>`, so app overlays (dialogs, menus, toasts)
 * paint above it through normal stacking. `"native"` is the original
 * `WebContentsView` implementation, kept as a fallback since Electron
 * discourages `<webview>` for production use.
 */
export const DESIGNER_BROWSER_MODE: "webview" | "native" = "webview"

// Dedicated, in-memory (non-persist) partition: the pane shows an untrusted
// remote page and must never share cookies/storage with the main app session
// or survive across relaunches. Shared between the main-process session
// policy and the renderer's `<webview partition=...>` attribute so both
// target the same session.
export const DESIGNER_BROWSER_PARTITION = "designer-browser"

export function isValidDesignerBrowserBounds(value: unknown): value is DesignerBrowserBounds {
  if (!value || typeof value !== "object") return false
  const bounds = value as Record<string, unknown>
  return (["x", "y", "width", "height"] as const).every(
    (key) => typeof bounds[key] === "number" && Number.isFinite(bounds[key]),
  )
}

/** Clamps requested bounds to the owning window's content area. */
export function clampDesignerBrowserBounds(
  bounds: DesignerBrowserBounds,
  container: { width: number; height: number },
): DesignerBrowserBounds {
  const containerWidth = Math.max(0, Math.round(container.width))
  const containerHeight = Math.max(0, Math.round(container.height))
  const width = Math.max(0, Math.min(Math.round(bounds.width), containerWidth))
  const height = Math.max(0, Math.min(Math.round(bounds.height), containerHeight))
  const x = Math.max(0, Math.min(Math.round(bounds.x), containerWidth - width))
  const y = Math.max(0, Math.min(Math.round(bounds.y), containerHeight - height))
  return { x, y, width, height }
}

/** Only HTTP(S) navigation is allowed inside the sandboxed browser pane. */
export function isAllowedDesignerBrowserUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  const protocol = new URL(value).protocol
  return protocol === "https:" || protocol === "http:"
}

/**
 * Structural shape of an Electron `IpcMainInvokeEvent`, narrowed to what's
 * needed to reject calls that don't originate from the owning window's main
 * frame (e.g. a compromised or unexpected subframe).
 */
export type DesignerBrowserIpcSenderContext = {
  senderFrame: unknown
  sender: { mainFrame: unknown }
}

export function isTrustedDesignerBrowserSender(event: DesignerBrowserIpcSenderContext): boolean {
  return event.senderFrame === event.sender.mainFrame
}

/**
 * Structural shape of the `webPreferences` object Electron passes into the
 * `will-attach-webview` event on the embedder's `WebContents`. Only the
 * fields this package cares about are declared (no index signature), so an
 * actual Electron `WebPreferences` object can be passed in directly.
 */
export type DesignerBrowserWebviewPreferences = {
  nodeIntegration?: boolean
  nodeIntegrationInSubFrames?: boolean
  contextIsolation?: boolean
  sandbox?: boolean
  preload?: string
}

/** The `<webview>` element's HTML attributes, as received by `will-attach-webview`. */
export type DesignerBrowserWebviewParams = Record<string, string>

/**
 * Forces safe defaults onto a guest `<webview>`'s `webPreferences`/`params`
 * pair before Electron attaches it, so a compromised or unexpected renderer
 * cannot request Node access or a different session partition. Returns new
 * objects; the caller is responsible for applying them back onto the
 * `will-attach-webview` event's (mutable) arguments.
 */
export function sanitizeDesignerBrowserWebviewParams(
  webPreferences: DesignerBrowserWebviewPreferences,
  params: DesignerBrowserWebviewParams,
): { webPreferences: DesignerBrowserWebviewPreferences; params: DesignerBrowserWebviewParams } {
  const { preload: _preload, ...restPreferences } = webPreferences
  return {
    webPreferences: {
      ...restPreferences,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
    },
    params: {
      ...params,
      partition: DESIGNER_BROWSER_PARTITION,
    },
  }
}
