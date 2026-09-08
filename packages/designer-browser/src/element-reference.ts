// Describes an element picked in the designer browser preview, and formats
// that description into composer-ready text.

export type DesignerElementReference = {
  tag: string
  text?: string
  rect: { x: number; y: number; width: number; height: number }
  match:
    | { kind: "source"; file: string; line: number; column?: number }
    | { kind: "identifier"; attribute: string; value: string }
    | { kind: "selector"; value: string }
}

/**
 * Resolves a layered reference for `element`: a source location (walking
 * ancestors, since instrumentation tools often hoist it onto a wrapping
 * component), else a stable identifier attribute on the element itself, else
 * a depth-capped CSS path anchored on the nearest ancestor id/data attribute.
 *
 * IMPORTANT: this function is serialised into the designer browser's guest
 * page verbatim via `Function.prototype.toString()` (see `picker.ts`) and
 * re-evaluated there. It must stay entirely self-contained — no imports, no
 * references to module-level bindings, no calls to helpers declared outside
 * its own body. Everything it needs must be declared inside this function or
 * be a DOM/JS global (`Element`, `document`, etc.) that also exists in the
 * guest realm. A future refactor that extracts a "shared" helper above this
 * function will silently break picking, because only this function's source
 * text travels into the guest.
 */
export function describeElement(element: Element): DesignerElementReference {
  const MAX_WALK_DEPTH = 12
  const MAX_SELECTOR_DEPTH = 5

  const rect = element.getBoundingClientRect()
  const text = element.textContent?.trim().slice(0, 80) || undefined
  const base = {
    tag: element.tagName.toLowerCase(),
    text,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  }

  const chain: Element[] = []
  for (let node: Element | null = element; node && chain.length < MAX_WALK_DEPTH; node = node.parentElement) {
    chain.push(node)
  }

  const parseSourceValue = (value: string) => {
    const match = /^(?<file>.+?):(?<line>\d+)(?::(?<column>\d+))?$/.exec(value)
    const groups = match?.groups
    if (!groups?.file || !groups.line) return undefined
    const line = Number(groups.line)
    if (!Number.isFinite(line)) return undefined
    const column = groups.column ? Number(groups.column) : undefined
    return { file: groups.file, line, column }
  }

  const COMBINED_SOURCE_ATTRIBUTES = ["data-source-loc", "data-source", "data-v-inspector"]
  const SPLIT_SOURCE_ATTRIBUTES: Array<[file: string, line: string, column: string]> = [
    ["data-inspector-file", "data-inspector-line", "data-inspector-column"],
    ["data-source-file", "data-source-line", "data-source-column"],
  ]

  for (const node of chain) {
    for (const attribute of COMBINED_SOURCE_ATTRIBUTES) {
      const raw = node.getAttribute(attribute)
      if (!raw) continue
      const parsed = parseSourceValue(raw)
      if (parsed) return { ...base, match: { kind: "source", ...parsed } }
    }

    for (const [fileAttr, lineAttr, columnAttr] of SPLIT_SOURCE_ATTRIBUTES) {
      const file = node.getAttribute(fileAttr)
      const lineRaw = node.getAttribute(lineAttr)
      if (!file || !lineRaw) continue
      const line = Number(lineRaw)
      if (!Number.isFinite(line)) continue
      const columnRaw = node.getAttribute(columnAttr)
      const column = columnRaw ? Number(columnRaw) : undefined
      return { ...base, match: { kind: "source", file, line, column } }
    }
  }

  // Element-local only: an ancestor's id/testid identifies the ancestor, not
  // the picked element, so it belongs to the CSS-path anchor below instead.
  const IDENTIFIER_ATTRIBUTES = ["id", "data-testid", "data-component", "name", "aria-label"]
  for (const attribute of IDENTIFIER_ATTRIBUTES) {
    const value = element.getAttribute(attribute)
    if (value) return { ...base, match: { kind: "identifier", attribute, value } }
  }

  const buildSelector = () => {
    const segments: string[] = []
    let node: Element | null = element
    for (let depth = 0; node && depth < MAX_SELECTOR_DEPTH; depth++) {
      const id = node.getAttribute("id")
      if (id) {
        segments.unshift(`#${id}`)
        break
      }

      const dataAttribute = node.getAttributeNames().find((name) => name.startsWith("data-"))
      if (dataAttribute) {
        const value = node.getAttribute(dataAttribute)
        segments.unshift(value ? `[${dataAttribute}="${value}"]` : `[${dataAttribute}]`)
        break
      }

      const tag = node.tagName.toLowerCase()
      const parent: Element | null = node.parentElement
      if (!parent) {
        segments.unshift(tag)
        break
      }

      const siblings = Array.from(parent.children).filter((child) => child.tagName === node?.tagName)
      segments.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag)
      node = parent
    }
    return segments.join(" > ")
  }

  return { ...base, match: { kind: "selector", value: buildSelector() } }
}

/**
 * Formats a picked element's reference as a self-closing, self-describing
 * XML-ish tag: `<picked-element tag="..." match="..." .../>`. Chosen over
 * inline prose because match values (especially `selector`, e.g.
 * `[data-hp="1"] > svg`) can contain quotes and angle brackets that would be
 * ambiguous in free text; chosen over a fenced JSON block because it stays
 * a single line and models (this one included) parse XML-style attributes
 * for structured data very reliably. Deliberately not prefixed with `@`,
 * which the composer parses as a mention trigger.
 */
export function formatElementReference(descriptor: DesignerElementReference): string {
  const attributes: Array<[string, string]> = [["tag", descriptor.tag]]

  switch (descriptor.match.kind) {
    case "source":
      attributes.push(["match", "source"], ["file", descriptor.match.file], ["line", String(descriptor.match.line)])
      if (descriptor.match.column !== undefined) attributes.push(["column", String(descriptor.match.column)])
      break
    case "identifier":
      attributes.push(
        ["match", "identifier"],
        ["attribute", descriptor.match.attribute],
        ["value", descriptor.match.value],
      )
      break
    case "selector":
      attributes.push(["match", "selector"], ["value", descriptor.match.value])
      break
  }

  if (descriptor.text) attributes.push(["text", descriptor.text])

  attributes.push(
    ["x", String(Math.round(descriptor.rect.x))],
    ["y", String(Math.round(descriptor.rect.y))],
    ["w", String(Math.round(descriptor.rect.width))],
    ["h", String(Math.round(descriptor.rect.height))],
  )

  const escapeXmlAttribute = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/[\r\n\t]/g, " ")

  const body = attributes.map(([name, value]) => `${name}="${escapeXmlAttribute(value)}"`).join(" ")
  return `<picked-element ${body}/>`
}
