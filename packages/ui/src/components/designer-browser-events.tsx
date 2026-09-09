export const DESIGNER_BROWSER_TOGGLE_EVENT = "opencode:designer-browser-toggle"
export const DESIGNER_BROWSER_VISIBILITY_EVENT = "opencode:designer-browser-visibility"

export function notifyDesignerBrowserToggle(): void {
  window.dispatchEvent(new CustomEvent(DESIGNER_BROWSER_TOGGLE_EVENT))
}

export type DesignerBrowserVisibilityDetail = {
  visible: boolean
}

export function notifyDesignerBrowserVisibility(detail: DesignerBrowserVisibilityDetail): void {
  window.dispatchEvent(new CustomEvent(DESIGNER_BROWSER_VISIBILITY_EVENT, { detail }))
}

export function readDesignerBrowserVisibilityDetail(event: Event): DesignerBrowserVisibilityDetail | undefined {
  if (!(event instanceof CustomEvent)) return undefined

  const detail: unknown = event.detail
  if (!detail || typeof detail !== "object") return undefined
  if (!("visible" in detail) || typeof detail.visible !== "boolean") return undefined

  return { visible: detail.visible }
}
