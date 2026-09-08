import { ipcRenderer } from "electron"
import { DESIGNER_BROWSER_CHANNELS, isValidDesignerBrowserBounds, type DesignerBrowserBridge } from "./contract"

/** Builds the `contextBridge`-safe API the desktop preload script exposes. */
export function createDesignerBrowserPreloadApi(): DesignerBrowserBridge {
  return {
    show: () => ipcRenderer.invoke(DESIGNER_BROWSER_CHANNELS.show),
    hide: () => ipcRenderer.invoke(DESIGNER_BROWSER_CHANNELS.hide),
    setBounds: (bounds) => {
      if (!isValidDesignerBrowserBounds(bounds)) return Promise.resolve()
      return ipcRenderer.invoke(DESIGNER_BROWSER_CHANNELS.setBounds, bounds)
    },
  }
}
