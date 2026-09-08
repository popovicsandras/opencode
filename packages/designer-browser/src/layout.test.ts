import { describe, expect, test } from "bun:test"
import { clampSplitWidth, readPersistedSplitWidth, writePersistedSplitWidth } from "./layout"

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    dump: () => Object.fromEntries(store),
  }
}

describe("clampSplitWidth", () => {
  test("keeps widths already within range", () => {
    expect(clampSplitWidth(500, 320, 900)).toBe(500)
  })

  test("clamps to the minimum and maximum", () => {
    expect(clampSplitWidth(10, 320, 900)).toBe(320)
    expect(clampSplitWidth(2000, 320, 900)).toBe(900)
  })

  test("falls back to the minimum for non-finite input", () => {
    expect(clampSplitWidth(Number.NaN, 320, 900)).toBe(320)
    expect(clampSplitWidth(Infinity, 320, 900)).toBe(320)
  })
})

describe("split width persistence", () => {
  test("returns the fallback when nothing is stored", () => {
    const storage = createMemoryStorage()
    expect(readPersistedSplitWidth(storage, "designer-browser.width", 480)).toBe(480)
  })

  test("returns the fallback for malformed or non-positive stored values", () => {
    const storage = createMemoryStorage({ "designer-browser.width": "not-a-number" })
    expect(readPersistedSplitWidth(storage, "designer-browser.width", 480)).toBe(480)
    storage.setItem("designer-browser.width", "-10")
    expect(readPersistedSplitWidth(storage, "designer-browser.width", 480)).toBe(480)
  })

  test("round-trips a written width", () => {
    const storage = createMemoryStorage()
    writePersistedSplitWidth(storage, "designer-browser.width", 512)
    expect(readPersistedSplitWidth(storage, "designer-browser.width", 480)).toBe(512)
    expect(storage.dump()).toEqual({ "designer-browser.width": "512" })
  })

  test("tolerates a missing storage object", () => {
    expect(readPersistedSplitWidth(undefined, "designer-browser.width", 480)).toBe(480)
    expect(() => writePersistedSplitWidth(undefined, "designer-browser.width", 512)).not.toThrow()
  })
})
