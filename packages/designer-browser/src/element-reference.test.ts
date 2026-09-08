import { describe, expect, test } from "bun:test"
import { describeElement, formatElementReference } from "./element-reference"

function el(html: string): Element {
  const container = document.createElement("div")
  container.innerHTML = html
  document.body.appendChild(container)
  return container.firstElementChild!
}

describe("describeElement", () => {
  test("prefers a combined source-location attribute over identifiers and selectors", () => {
    const target = el(`<button id="submit" data-source-loc="src/App.tsx:42:5">Go</button>`)
    expect(describeElement(target).match).toEqual({ kind: "source", file: "src/App.tsx", line: 42, column: 5 })
  })

  test("reads a combined source attribute without a column", () => {
    const target = el(`<button data-source="src/App.tsx:10">Go</button>`)
    expect(describeElement(target).match).toEqual({ kind: "source", file: "src/App.tsx", line: 10, column: undefined })
  })

  test("reads split file/line/column source attributes", () => {
    const target = el(
      `<div data-inspector-file="src/Widget.tsx" data-inspector-line="7" data-inspector-column="3"><span>hi</span></div>`,
    )
    const inner = target.firstElementChild!
    expect(describeElement(inner).match).toEqual({ kind: "source", file: "src/Widget.tsx", line: 7, column: 3 })
  })

  test("walks ancestors to find a source attribute", () => {
    const target = el(`<div data-source="src/Outer.tsx:1"><span><em>deep</em></span></div>`)
    const deep = target.querySelector("em")!
    expect(describeElement(deep).match).toEqual({ kind: "source", file: "src/Outer.tsx", line: 1, column: undefined })
  })

  test("falls back to a stable identifier when no source attribute exists", () => {
    const target = el(`<button data-testid="submit-button">Go</button>`)
    expect(describeElement(target).match).toEqual({ kind: "identifier", attribute: "data-testid", value: "submit-button" })
  })

  test("prefers id over other identifier attributes", () => {
    const target = el(`<button id="submit" data-testid="submit-button" name="submit">Go</button>`)
    expect(describeElement(target).match).toEqual({ kind: "identifier", attribute: "id", value: "submit" })
  })

  test("falls back to a CSS path anchored on the nearest id", () => {
    const target = el(`<div id="panel"><ul><li>one</li><li>two</li></ul></div>`)
    const secondItem = target.querySelectorAll("li")[1]
    expect(describeElement(secondItem).match).toEqual({
      kind: "selector",
      value: "#panel > ul > li:nth-of-type(2)",
    })
  })

  test("falls back to a CSS path anchored on a data attribute", () => {
    const target = el(`<section data-component="Panel"><button>Go</button></section>`)
    const button = target.querySelector("button")!
    expect(describeElement(button).match).toEqual({ kind: "selector", value: '[data-component="Panel"] > button' })
  })

  test("caps the CSS path depth when no anchor is found", () => {
    const target = el(`<div><div><div><div><div><div><span>deep</span></div></div></div></div></div></div>`)
    const deep = target.querySelector("span")!
    const descriptor = describeElement(deep)
    expect(descriptor.match.kind).toBe("selector")
    expect((descriptor.match as { value: string }).value.split(" > ")).toHaveLength(5)
  })

  test("includes the tag, trimmed text snippet, and bounding rect", () => {
    const target = el(`<button id="go">  Go now  </button>`)
    const descriptor = describeElement(target)
    expect(descriptor.tag).toBe("button")
    expect(descriptor.text).toBe("Go now")
    expect(descriptor.rect).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  test("omits text for elements with no text content", () => {
    const target = el(`<img id="hero" />`)
    expect(describeElement(target).text).toBeUndefined()
  })
})

describe("formatElementReference", () => {
  test("formats a source match", () => {
    expect(
      formatElementReference({
        tag: "button",
        text: "Go",
        rect: { x: 1, y: 2, width: 10.4, height: 10.6 },
        match: { kind: "source", file: "src/App.tsx", line: 42, column: 5 },
      }),
    ).toBe(
      '<picked-element tag="button" match="source" file="src/App.tsx" line="42" column="5" text="Go" x="1" y="2" w="10" h="11"/>',
    )
  })

  test("formats a source match without a column", () => {
    expect(
      formatElementReference({
        tag: "button",
        rect: { x: 0, y: 0, width: 10, height: 10 },
        match: { kind: "source", file: "src/App.tsx", line: 42 },
      }),
    ).toBe('<picked-element tag="button" match="source" file="src/App.tsx" line="42" x="0" y="0" w="10" h="10"/>')
  })

  test("formats an identifier match", () => {
    expect(
      formatElementReference({
        tag: "button",
        rect: { x: 0, y: 0, width: 10, height: 10 },
        match: { kind: "identifier", attribute: "data-testid", value: "submit" },
      }),
    ).toBe(
      '<picked-element tag="button" match="identifier" attribute="data-testid" value="submit" x="0" y="0" w="10" h="10"/>',
    )
  })

  test("formats a selector match", () => {
    expect(
      formatElementReference({
        tag: "li",
        rect: { x: 0, y: 0, width: 10, height: 10 },
        match: { kind: "selector", value: "#panel > ul > li:nth-of-type(2)" },
      }),
    ).toBe(
      '<picked-element tag="li" match="selector" value="#panel &gt; ul &gt; li:nth-of-type(2)" x="0" y="0" w="10" h="10"/>',
    )
  })

  test("escapes quotes and angle brackets in attribute values so the tag stays well-formed", () => {
    expect(
      formatElementReference({
        tag: "svg",
        rect: { x: 0, y: 0, width: 10, height: 10 },
        match: { kind: "selector", value: '[data-hp="1"] > svg' },
      }),
    ).toBe('<picked-element tag="svg" match="selector" value="[data-hp=&quot;1&quot;] &gt; svg" x="0" y="0" w="10" h="10"/>')
  })

  test("escapes ampersands and angle brackets in a text snippet", () => {
    expect(
      formatElementReference({
        tag: "a",
        text: `Ben & Jerry's <special>`,
        rect: { x: 0, y: 0, width: 10, height: 10 },
        match: { kind: "identifier", attribute: "id", value: "link" },
      }),
    ).toBe(
      '<picked-element tag="a" match="identifier" attribute="id" value="link" text="Ben &amp; Jerry\'s &lt;special&gt;" x="0" y="0" w="10" h="10"/>',
    )
  })

  test("never emits a leading @", () => {
    const text = formatElementReference({
      tag: "div",
      rect: { x: 0, y: 0, width: 10, height: 10 },
      match: { kind: "selector", value: "div" },
    })
    expect(text.startsWith("@")).toBe(false)
  })
})
