import { describe, expect, test } from "bun:test"
import { createDesignerBrowserRegistry } from "./registry"

function createFakeWindow() {
  const listeners: (() => void)[] = []
  return {
    once(_event: "closed", listener: () => void) {
      listeners.push(listener)
    },
    close() {
      listeners.forEach((listener) => listener())
    },
  }
}

describe("createDesignerBrowserRegistry", () => {
  test("creates and tracks one controller per window", () => {
    const created: unknown[] = []
    const registry = createDesignerBrowserRegistry((win: ReturnType<typeof createFakeWindow>) => {
      created.push(win)
      return { destroy: () => {} }
    })

    const winA = createFakeWindow()
    const winB = createFakeWindow()
    const controllerA = registry.attach(winA)
    registry.attach(winB)

    expect(created).toEqual([winA, winB])
    expect(registry.get(winA)).toBe(controllerA)
    expect(registry.size()).toBe(2)
  })

  test("destroys and forgets the controller when its window closes", () => {
    let destroyed = false
    const registry = createDesignerBrowserRegistry((_win: ReturnType<typeof createFakeWindow>) => ({
      destroy: () => {
        destroyed = true
      },
    }))

    const win = createFakeWindow()
    registry.attach(win)
    win.close()

    expect(destroyed).toBe(true)
    expect(registry.get(win)).toBeUndefined()
    expect(registry.size()).toBe(0)
  })

  test("closing one window leaves other controllers attached", () => {
    const destroyedWindows: string[] = []
    const registry = createDesignerBrowserRegistry((win: { name: string } & ReturnType<typeof createFakeWindow>) => ({
      destroy: () => destroyedWindows.push(win.name),
    }))

    const winA = Object.assign(createFakeWindow(), { name: "a" })
    const winB = Object.assign(createFakeWindow(), { name: "b" })
    registry.attach(winA)
    const controllerB = registry.attach(winB)
    winA.close()

    expect(destroyedWindows).toEqual(["a"])
    expect(registry.get(winA)).toBeUndefined()
    expect(registry.get(winB)).toBe(controllerB)
    expect(registry.size()).toBe(1)
  })
})
