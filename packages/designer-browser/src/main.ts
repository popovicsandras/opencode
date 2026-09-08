import { app, BrowserWindow, ipcMain, session, WebContentsView } from "electron"
import type { IpcMainInvokeEvent } from "electron"
import {
  clampDesignerBrowserBounds,
  DESIGNER_BROWSER_CHANNELS,
  DESIGNER_BROWSER_HOME_URL,
  DESIGNER_BROWSER_MODE,
  DESIGNER_BROWSER_PARTITION,
  isAllowedDesignerBrowserUrl,
  isTrustedDesignerBrowserSender,
  isValidDesignerBrowserBounds,
  sanitizeDesignerBrowserWebviewParams,
  type DesignerBrowserBounds,
} from "./contract"
import { createDesignerBrowserRegistry } from "./registry"

export type DesignerBrowserController = {
  show(): void
  hide(): void
  setBounds(bounds: DesignerBrowserBounds): void
  destroy(): void
}

export function createDesignerBrowserController(win: BrowserWindow): DesignerBrowserController {
  const view = new WebContentsView({
    webPreferences: {
      session: session.fromPartition(DESIGNER_BROWSER_PARTITION),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // The pane only ever shows a single untrusted page with no Electron
  // capabilities: deny popups/new windows and every permission prompt.
  view.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  view.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  view.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedDesignerBrowserUrl(url)) event.preventDefault()
  })

  win.contentView.addChildView(view)
  view.setVisible(false)
  void view.webContents.loadURL(DESIGNER_BROWSER_HOME_URL)

  return {
    show() {
      if (win.isDestroyed()) return
      view.setVisible(true)
    },
    hide() {
      if (win.isDestroyed() || view.webContents.isDestroyed()) return
      view.setVisible(false)
    },
    setBounds(bounds) {
      if (win.isDestroyed()) return
      const [width = 0, height = 0] = win.getContentSize()
      view.setBounds(clampDesignerBrowserBounds(bounds, { width, height }))
    },
    destroy() {
      if (!win.isDestroyed()) win.contentView.removeChildView(view)
      if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false })
    },
  }
}

export const designerBrowserRegistry = createDesignerBrowserRegistry(createDesignerBrowserController)

/**
 * Wires up the designer browser pane in the main process for whichever mode
 * `DESIGNER_BROWSER_MODE` selects:
 *
 * - `"webview"` (default): hardens the guest `<webview>` that the renderer
 *   embeds directly in the DOM — its dedicated partition denies every
 *   permission prompt, its `WebContents` deny popups and non-`http(s)`
 *   navigation, and any attempt to attach it with different
 *   `webPreferences`/`params` (e.g. a compromised renderer requesting Node
 *   access or a different partition) is overwritten before Electron honors
 *   it. The native `WebContentsView` IPC channels are not registered.
 * - `"native"`: only registers the existing IPC bridge; the controller
 *   itself is attached per-window via `designerBrowserRegistry.attach(win)`.
 */
export function setupDesignerBrowser() {
  if (DESIGNER_BROWSER_MODE === "native") {
    registerDesignerBrowserIpc()
    return
  }

  session.fromPartition(DESIGNER_BROWSER_PARTITION).setPermissionRequestHandler((_contents, _permission, callback) => callback(false))

  app.on("web-contents-created", (_event, contents) => {
    // The guest page itself: deny popups/new windows and restrict
    // navigation to http(s), mirroring the native controller's policy.
    if (contents.getType() === "webview") {
      contents.setWindowOpenHandler(() => ({ action: "deny" }))
      contents.on("will-navigate", (event, url) => {
        if (!isAllowedDesignerBrowserUrl(url)) event.preventDefault()
      })
      return
    }

    // A potential embedder (the app window): sanitize whatever
    // webPreferences/params it tries to attach the guest with, regardless of
    // what the `<webview>` element's attributes in the DOM say.
    contents.on("will-attach-webview", (_event, webPreferences, params) => {
      const sanitized = sanitizeDesignerBrowserWebviewParams(webPreferences, params)
      // `sanitizeDesignerBrowserWebviewParams` drops `preload` from its
      // returned copy; `Object.assign` alone wouldn't remove it from this
      // (mutable) event object, so delete it explicitly before reapplying.
      delete webPreferences.preload
      Object.assign(webPreferences, sanitized.webPreferences)
      Object.assign(params, sanitized.params)
    })
  })
}

export function registerDesignerBrowserIpc() {
  const controllerFor = (event: IpcMainInvokeEvent) => {
    if (!isTrustedDesignerBrowserSender(event)) return undefined
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return undefined
    return designerBrowserRegistry.get(win)
  }

  ipcMain.handle(DESIGNER_BROWSER_CHANNELS.show, (event: IpcMainInvokeEvent) => {
    controllerFor(event)?.show()
  })
  ipcMain.handle(DESIGNER_BROWSER_CHANNELS.hide, (event: IpcMainInvokeEvent) => {
    controllerFor(event)?.hide()
  })
  ipcMain.handle(DESIGNER_BROWSER_CHANNELS.setBounds, (event: IpcMainInvokeEvent, bounds: unknown) => {
    if (!isValidDesignerBrowserBounds(bounds)) return
    controllerFor(event)?.setBounds(bounds)
  })
}
