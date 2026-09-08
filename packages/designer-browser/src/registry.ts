// Generic, Electron-free per-window controller lifecycle. Mirrors the
// desktop package's `createWindowRegistry` shape so the same window
// (`BrowserWindow`) can own one designer-browser controller that is created
// lazily and destroyed automatically when the window closes.

type ClosableWindow = {
  once(event: "closed", listener: () => void): void
}

type DestroyableController = {
  destroy(): void
}

export function createDesignerBrowserRegistry<Win extends ClosableWindow, Controller extends DestroyableController>(
  createController: (win: Win) => Controller,
) {
  const controllers = new Map<Win, Controller>()

  return {
    attach(win: Win) {
      const controller = createController(win)
      controllers.set(win, controller)
      win.once("closed", () => {
        controller.destroy()
        controllers.delete(win)
      })
      return controller
    },
    get(win: Win) {
      return controllers.get(win)
    },
    size() {
      return controllers.size
    },
  }
}
