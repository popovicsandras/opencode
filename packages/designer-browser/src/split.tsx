import { createEffect, createSignal, onCleanup, onMount, Show, type Accessor, type JSX } from "solid-js"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import {
  DESIGNER_BROWSER_HOME_URL,
  DESIGNER_BROWSER_MODE,
  DESIGNER_BROWSER_PARTITION,
  type DesignerBrowserBounds,
  type DesignerBrowserBridge,
} from "./contract"
import { clampSplitWidth, readPersistedSplitWidth, writePersistedSplitWidth } from "./layout"
import { formatElementReference } from "./element-reference"
import { cancelPick, pickElement, type ElectronWebviewLike } from "./picker"

// Minimal structural typing for Electron's `<webview>` element, avoiding a
// dependency on Electron's renderer-process types from this DOM-facing file.
type DesignerBrowserWebviewElement = HTMLElement & ElectronWebviewLike

const DEFAULT_STORAGE_KEY = "opencode.desktop.designer-browser.split-width"
const DEFAULT_INITIAL_WIDTH = 480
const DEFAULT_MIN_WIDTH = 320

export type DesignerBrowserSplitProps = {
  /**
   * IPC-backed controls for the native browser pane owned by the main
   * process. Only used in native mode (`DESIGNER_BROWSER_MODE === "native"`);
   * webview mode needs neither this nor `zoomFactor`.
   */
  bridge?: DesignerBrowserBridge
  /**
   * Current renderer page zoom factor. `WebContentsView` bounds live in the
   * window's zoom-independent content coordinate space, while DOM
   * measurements are taken in this renderer's zoomed CSS pixels, so the
   * measured rect must be rescaled by this value before it is sent over IPC.
   * Native mode only.
   */
  zoomFactor?: Accessor<number>
  /**
   * Bumped by the host to force a remeasure for host-specific triggers (for
   * example fullscreen toggling) that don't always resize the pane's own DOM
   * node and so wouldn't otherwise be observed.
   */
  remeasureOn?: Accessor<unknown>
  storageKey?: string
  minWidth?: number
  maxWidth?: number
  initialWidth?: number
  /**
   * Whether the right-hand pane is shown at all. Fully controlled by the
   * host — this component has no internal show/hide state, only width.
   * Defaults to `true` so existing callers keep the current always-on
   * behavior.
   */
  visible?: boolean
  /**
   * Called with a formatted text reference (source location, stable
   * identifier, or CSS path) when a designer picks an element in the
   * preview. Webview mode only — native mode has no picking IPC surface.
   */
  onElementPicked?: (text: string) => void
  /** Left pane content, rendered unmodified (the existing OpenCode app). */
  children: JSX.Element
}

export function DesignerBrowserSplit(props: DesignerBrowserSplitProps) {
  const storageKey = props.storageKey ?? DEFAULT_STORAGE_KEY
  const minWidth = props.minWidth ?? DEFAULT_MIN_WIDTH
  const maxWidth = () => props.maxWidth ?? (typeof window === "undefined" ? 1000 : window.innerWidth * 0.7)
  const storage = typeof localStorage === "undefined" ? undefined : localStorage

  const [width, setWidth] = createSignal(
    clampSplitWidth(
      readPersistedSplitWidth(storage, storageKey, props.initialWidth ?? DEFAULT_INITIAL_WIDTH),
      minWidth,
      maxWidth(),
    ),
  )

  // Native-mode-only: the DOM node the `WebContentsView` is measured against
  // and positioned over via IPC. Webview mode renders a `<webview>` in this
  // spot directly and never touches this ref or the measurement below.
  let pane: HTMLDivElement | undefined

  const measure = () => {
    if (DESIGNER_BROWSER_MODE !== "native" || !pane || !props.bridge) return
    const rect = pane.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const zoom = props.zoomFactor?.() || 1
    const bounds: DesignerBrowserBounds = {
      x: Math.round(rect.left * zoom),
      y: Math.round(rect.top * zoom),
      width: Math.round(rect.width * zoom),
      height: Math.round(rect.height * zoom),
    }
    void props.bridge.setBounds(bounds)
  }

  const resize = (next: number) => setWidth(clampSplitWidth(next, minWidth, maxWidth()))

  // Webview-mode-only: the guest element the picker drives, and whether it
  // has finished its initial load (picking before then throws in the guest).
  let webview: DesignerBrowserWebviewElement | undefined
  const [guestReady, setGuestReady] = createSignal(false)
  const [picking, setPicking] = createSignal(false)
  const handleDomReady = () => setGuestReady(true)

  const togglePick = () => {
    if (!webview || !guestReady()) return
    if (picking()) {
      void cancelPick(webview)
      return
    }
    setPicking(true)
    void pickElement(webview)
      .then((descriptor) => {
        if (descriptor) props.onElementPicked?.(formatElementReference(descriptor))
      })
      .finally(() => setPicking(false))
  }

  onMount(() => {
    if (DESIGNER_BROWSER_MODE !== "native") return

    measure()
    void props.bridge?.show()

    const observer = new ResizeObserver(measure)
    if (pane) observer.observe(pane)

    // Covers window resize and fullscreen toggling, which shift this pane's
    // position without necessarily changing its own observed size.
    window.addEventListener("resize", measure)

    onCleanup(() => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
      void props.bridge?.hide()
    })
  })

  onCleanup(() => {
    webview?.removeEventListener("dom-ready", handleDomReady)
    if (webview && picking()) void cancelPick(webview)
  })

  createEffect(() => {
    if (DESIGNER_BROWSER_MODE !== "native") return
    props.zoomFactor?.()
    props.remeasureOn?.()
    queueMicrotask(measure)
  })

  createEffect(() => {
    const value = width()
    writePersistedSplitWidth(storage, storageKey, value)
    if (DESIGNER_BROWSER_MODE === "native") queueMicrotask(measure)
  })

  return (
    <div class="relative flex h-full w-full min-w-0 overflow-hidden">
      <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">{props.children}</div>
      <Show when={props.visible ?? true}>
        <div
          class="relative h-full shrink-0 border-l border-border-weaker-base bg-background-base"
          style={{ width: `${width()}px` }}
        >
          <Show when={DESIGNER_BROWSER_MODE === "webview"} fallback={<div ref={pane} class="absolute inset-0" />}>
            <webview
              ref={(el: HTMLElement) => {
                webview = el as DesignerBrowserWebviewElement
                el.addEventListener("dom-ready", handleDomReady)
              }}
              class="absolute inset-0 h-full w-full"
              src={DESIGNER_BROWSER_HOME_URL}
              partition={DESIGNER_BROWSER_PARTITION}
            />
            <button
              type="button"
              class="absolute right-2 top-2 z-10 rounded-md border border-border-weaker-base bg-background-base px-2 py-1 text-xs font-medium text-text-base shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              classList={{ "border-border-interactive-base text-text-interactive-base": picking() }}
              disabled={!guestReady()}
              onClick={togglePick}
            >
              {picking() ? "Cancel pick" : "Pick element"}
            </button>
          </Show>
          <ResizeHandle direction="horizontal" edge="start" size={width()} min={minWidth} max={maxWidth()} onResize={resize} />
        </div>
      </Show>
    </div>
  )
}
