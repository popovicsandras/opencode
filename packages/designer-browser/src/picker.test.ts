import { describe, expect, test } from "bun:test"
import { buildCancelSource, buildPickerSource, cancelPick, pickElement, type ElectronWebviewLike } from "./picker"

function evaluate(source: string): unknown {
  return new Function(`return ${source}`)()
}

function outlineCount() {
  return document.querySelectorAll('div[style*="pointer-events"]').length
}

describe("buildPickerSource", () => {
  test("resolves with the hovered element's descriptor on click", async () => {
    document.body.innerHTML = `<button id="submit">Go</button>`
    const button = document.getElementById("submit")!

    const pending = evaluate(buildPickerSource()) as Promise<unknown>
    button.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    expect(await pending).toEqual({
      tag: "button",
      text: "Go",
      rect: { x: 0, y: 0, width: 0, height: 0 },
      match: { kind: "identifier", attribute: "id", value: "submit" },
    })
    expect(outlineCount()).toBe(0)
  })

  test("resolves using the click's own target when there was no prior hover", async () => {
    document.body.innerHTML = `<button data-testid="go">Go</button>`
    const button = document.querySelector('[data-testid="go"]')!

    const pending = evaluate(buildPickerSource()) as Promise<unknown>
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    expect(await pending).toEqual({
      tag: "button",
      text: "Go",
      rect: { x: 0, y: 0, width: 0, height: 0 },
      match: { kind: "identifier", attribute: "data-testid", value: "go" },
    })
  })

  test("prevents and stops the click so the guest page never sees it", async () => {
    document.body.innerHTML = `<button id="submit">Go</button>`
    const button = document.getElementById("submit")!
    let guestClicked = false
    button.addEventListener("click", () => {
      guestClicked = true
    })

    const pending = evaluate(buildPickerSource()) as Promise<unknown>
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    button.dispatchEvent(event)
    await pending

    expect(guestClicked).toBe(false)
    expect(event.defaultPrevented).toBe(true)
  })

  test("resolves null on Escape without picking anything", async () => {
    document.body.innerHTML = `<button id="submit">Go</button>`

    const pending = evaluate(buildPickerSource()) as Promise<unknown>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))

    expect(await pending).toBeNull()
    expect(outlineCount()).toBe(0)
  })

  test("re-arming cancels the previous pending pick with null", async () => {
    document.body.innerHTML = `<button id="submit">Go</button>`
    const button = document.getElementById("submit")!

    const first = evaluate(buildPickerSource()) as Promise<unknown>
    const second = evaluate(buildPickerSource()) as Promise<unknown>
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    expect(await first).toBeNull()
    expect(await second).toEqual({
      tag: "button",
      text: "Go",
      rect: { x: 0, y: 0, width: 0, height: 0 },
      match: { kind: "identifier", attribute: "id", value: "submit" },
    })
    // Only the second pick's outline should have been left behind mid-flight, and it too is now cleaned up.
    expect(outlineCount()).toBe(0)
  })
})

describe("buildCancelSource", () => {
  test("resolves a pending pick with null without arming a new one", async () => {
    document.body.innerHTML = `<button id="submit">Go</button>`

    const pending = evaluate(buildPickerSource()) as Promise<unknown>
    evaluate(buildCancelSource())

    expect(await pending).toBeNull()
    expect(outlineCount()).toBe(0)
  })

  test("is a no-op when nothing is picking", () => {
    expect(() => evaluate(buildCancelSource())).not.toThrow()
  })
})

function fakeWebview(executeJavaScript: ElectronWebviewLike["executeJavaScript"]): ElectronWebviewLike {
  return { executeJavaScript }
}

describe("pickElement", () => {
  test("returns the descriptor the guest resolved with", async () => {
    const descriptor = { tag: "button", rect: { x: 0, y: 0, width: 1, height: 1 }, match: { kind: "selector" as const, value: "button" } }
    const webview = fakeWebview(async () => descriptor)
    expect(await pickElement(webview)).toEqual(descriptor)
  })

  test("returns undefined when the guest resolves null (cancelled)", async () => {
    const webview = fakeWebview(async () => null)
    expect(await pickElement(webview)).toBeUndefined()
  })

  test("returns undefined instead of throwing when a mid-pick navigation rejects executeJavaScript", async () => {
    const webview = fakeWebview(async () => {
      throw new Error("navigated away")
    })
    expect(await pickElement(webview)).toBeUndefined()
  })
})

describe("cancelPick", () => {
  test("tolerates a rejection from a destroyed guest", async () => {
    const webview = fakeWebview(async () => {
      throw new Error("destroyed")
    })
    await expect(cancelPick(webview)).resolves.toBeUndefined()
  })
})
