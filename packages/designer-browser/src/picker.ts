import { describeElement, type DesignerElementReference } from "./element-reference"

// A `window` key used to hand a running pick's cancel handle to the next
// `executeJavaScript` call in the same guest, so re-arming or an explicit
// cancel always settles the previous pick's promise instead of leaking it.
const PICKER_STATE_KEY = "__opencodeDesignerPicker__"

/**
 * Installs pick mode in the guest page and resolves once a designer commits
 * to an element (click) or backs out (Escape, or a subsequent call to this
 * same bootstrap via the re-arm check below).
 *
 * IMPORTANT: like `describeElement` (passed in as a parameter rather than
 * imported), this function is serialised via `Function.prototype.toString()`
 * and evaluated inside the guest's main world. It must stay self-contained —
 * no imports, no references to bindings outside its own parameters — but
 * `window`, `document`, and `Element` are fine since they exist in that
 * realm too.
 */
function pickerBootstrap(
  describeElement: (element: Element) => unknown,
  stateKey: string,
): Promise<unknown> {
  return new Promise((resolve) => {
    const globalState = window as unknown as Record<string, { cancel: () => void } | undefined>
    globalState[stateKey]?.cancel()

    const outline = document.createElement("div")
    outline.style.position = "fixed"
    outline.style.zIndex = "2147483647"
    outline.style.pointerEvents = "none"
    outline.style.border = "2px solid #2563eb"
    outline.style.background = "rgba(37, 99, 235, 0.15)"
    outline.style.borderRadius = "2px"
    outline.style.display = "none"
    ;(document.body ?? document.documentElement).appendChild(outline)

    let hovered: Element | null = null

    const updateOutline = (element: Element | null) => {
      hovered = element
      if (!element) {
        outline.style.display = "none"
        return
      }
      const rect = element.getBoundingClientRect()
      outline.style.display = "block"
      outline.style.left = `${rect.left}px`
      outline.style.top = `${rect.top}px`
      outline.style.width = `${rect.width}px`
      outline.style.height = `${rect.height}px`
    }

    // The event's own target/composed path is the browser's already-resolved
    // topmost hit at the pointer, so there is no need to re-derive it via
    // point-based hit testing (and no coordinate-space conversion needed).
    const resolveTarget = (event: Event): Element | null => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : []
      const fromPath = path.find((node) => node instanceof Element && node !== outline) as Element | undefined
      if (fromPath) return fromPath
      return event.target instanceof Element && event.target !== outline ? event.target : null
    }

    const onMouseMove = (event: Event) => updateOutline(resolveTarget(event))

    const cleanup = () => {
      window.removeEventListener("mousemove", onMouseMove, true)
      window.removeEventListener("click", onClick, true)
      window.removeEventListener("keydown", onKeyDown, true)
      outline.remove()
      delete globalState[stateKey]
    }

    const onClick = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      const target = hovered ?? resolveTarget(event)
      cleanup()
      resolve(target ? describeElement(target) : null)
    }

    const onKeyDown = (event: Event) => {
      if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      cleanup()
      resolve(null)
    }

    globalState[stateKey] = {
      cancel: () => {
        cleanup()
        resolve(null)
      },
    }

    window.addEventListener("mousemove", onMouseMove, true)
    window.addEventListener("click", onClick, true)
    window.addEventListener("keydown", onKeyDown, true)
  })
}

/** Injectable source that arms pick mode and resolves with a picked element's descriptor, or `null` if cancelled. */
export function buildPickerSource(): string {
  return `(() => {
    const describeElement = ${describeElement.toString()};
    return (${pickerBootstrap.toString()})(describeElement, ${JSON.stringify(PICKER_STATE_KEY)});
  })()`
}

/** Injectable source that resolves any pending pick in the guest with `null`, without arming a new one. */
export function buildCancelSource(): string {
  return `(() => {
    const state = window[${JSON.stringify(PICKER_STATE_KEY)}];
    if (state) state.cancel();
  })()`
}

/** The narrow slice of Electron's `<webview>` element that the picker driver needs. */
export type ElectronWebviewLike = {
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
}

/**
 * Arms pick mode in `webview`'s guest and waits for a pick or cancellation.
 * A mid-pick navigation (or a destroyed guest) rejects `executeJavaScript`;
 * that is treated the same as an explicit cancel rather than an error.
 */
export async function pickElement(webview: ElectronWebviewLike): Promise<DesignerElementReference | undefined> {
  const result = await webview.executeJavaScript(buildPickerSource(), true).catch(() => undefined)
  return (result ?? undefined) as DesignerElementReference | undefined
}

/** Cancels any pick currently running in `webview`'s guest. */
export async function cancelPick(webview: ElectronWebviewLike): Promise<void> {
  await webview.executeJavaScript(buildCancelSource()).catch(() => undefined)
}
