import { describe, expect, test } from "bun:test"
import {
  clampDesignerBrowserBounds,
  DESIGNER_BROWSER_PARTITION,
  isAllowedDesignerBrowserUrl,
  isTrustedDesignerBrowserSender,
  isValidDesignerBrowserBounds,
  sanitizeDesignerBrowserWebviewParams,
} from "./contract"

describe("isValidDesignerBrowserBounds", () => {
  test("accepts a finite numeric rectangle", () => {
    expect(isValidDesignerBrowserBounds({ x: 0, y: 0, width: 100, height: 200 })).toBe(true)
  })

  test("rejects missing, non-numeric, or non-finite fields", () => {
    expect(isValidDesignerBrowserBounds({ x: 0, y: 0, width: 100 })).toBe(false)
    expect(isValidDesignerBrowserBounds({ x: "0", y: 0, width: 100, height: 200 })).toBe(false)
    expect(isValidDesignerBrowserBounds({ x: 0, y: 0, width: Infinity, height: 200 })).toBe(false)
    expect(isValidDesignerBrowserBounds(null)).toBe(false)
    expect(isValidDesignerBrowserBounds("bounds")).toBe(false)
  })
})

describe("clampDesignerBrowserBounds", () => {
  test("passes through bounds that already fit the container", () => {
    expect(clampDesignerBrowserBounds({ x: 10, y: 20, width: 300, height: 400 }, { width: 800, height: 600 })).toEqual(
      { x: 10, y: 20, width: 300, height: 400 },
    )
  })

  test("clips width and height that overflow the container", () => {
    expect(clampDesignerBrowserBounds({ x: 0, y: 0, width: 900, height: 700 }, { width: 800, height: 600 })).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    })
  })

  test("pulls a positive origin back so the pane stays inside the container", () => {
    expect(clampDesignerBrowserBounds({ x: 700, y: 500, width: 300, height: 300 }, { width: 800, height: 600 })).toEqual(
      { x: 500, y: 300, width: 300, height: 300 },
    )
  })

  test("clamps a negative origin to zero", () => {
    expect(clampDesignerBrowserBounds({ x: -50, y: -20, width: 100, height: 100 }, { width: 800, height: 600 })).toEqual(
      { x: 0, y: 0, width: 100, height: 100 },
    )
  })

  test("rounds fractional pixel values", () => {
    expect(clampDesignerBrowserBounds({ x: 1.4, y: 2.6, width: 100.5, height: 99.5 }, { width: 800, height: 600 })).toEqual(
      { x: 1, y: 3, width: 101, height: 100 },
    )
  })

  test("degrades to a zero-size pane inside a zero-size container", () => {
    expect(clampDesignerBrowserBounds({ x: 10, y: 10, width: 100, height: 100 }, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    })
  })
})

describe("isAllowedDesignerBrowserUrl", () => {
  test("allows http and https navigation", () => {
    expect(isAllowedDesignerBrowserUrl("https://www.google.com/")).toBe(true)
    expect(isAllowedDesignerBrowserUrl("http://example.com")).toBe(true)
  })

  test("rejects non-http(s) schemes and unparsable values", () => {
    expect(isAllowedDesignerBrowserUrl("file:///etc/passwd")).toBe(false)
    expect(isAllowedDesignerBrowserUrl("javascript:alert(1)")).toBe(false)
    expect(isAllowedDesignerBrowserUrl("chrome://settings")).toBe(false)
    expect(isAllowedDesignerBrowserUrl("data:text/html,hi")).toBe(false)
    expect(isAllowedDesignerBrowserUrl("not a url")).toBe(false)
  })
})

describe("isTrustedDesignerBrowserSender", () => {
  test("trusts calls from the sender's own main frame", () => {
    const mainFrame = { id: 1 }
    expect(isTrustedDesignerBrowserSender({ senderFrame: mainFrame, sender: { mainFrame } })).toBe(true)
  })

  test("rejects calls from a subframe of the sender", () => {
    const mainFrame = { id: 1 }
    const subFrame = { id: 2 }
    expect(isTrustedDesignerBrowserSender({ senderFrame: subFrame, sender: { mainFrame } })).toBe(false)
  })
})

describe("sanitizeDesignerBrowserWebviewParams", () => {
  test("forces node integration off and drops any preload script", () => {
    const result = sanitizeDesignerBrowserWebviewParams(
      { nodeIntegration: true, nodeIntegrationInSubFrames: true, contextIsolation: false, sandbox: false, preload: "/evil.js" },
      { src: DESIGNER_BROWSER_PARTITION },
    )
    expect(result.webPreferences).toEqual({
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
    })
    expect(result.webPreferences).not.toHaveProperty("preload")
  })

  test("pins the partition regardless of what the guest requested", () => {
    const result = sanitizeDesignerBrowserWebviewParams({}, { partition: "persist:untrusted", src: "https://example.com" })
    expect(result.params.partition).toBe(DESIGNER_BROWSER_PARTITION)
    expect(result.params.src).toBe("https://example.com")
  })

  test("leaves webPreferences fields that were already safe untouched", () => {
    const result = sanitizeDesignerBrowserWebviewParams({ nodeIntegration: false, contextIsolation: true, sandbox: true }, {})
    expect(result.webPreferences).toEqual({ nodeIntegration: false, nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true })
  })
})
