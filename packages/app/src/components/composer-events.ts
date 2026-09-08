import type { PromptScope } from "@/context/prompt-state"

export const COMPOSER_INSERT_EVENT = "opencode:composer-insert"

export type ComposerInsertDetail = {
  text: string
  scope?: PromptScope
}

export function notifyComposerInsert(input: ComposerInsertDetail) {
  window.dispatchEvent(new CustomEvent(COMPOSER_INSERT_EVENT, { detail: input }))
}

export function readComposerInsertDetail(event: Event): ComposerInsertDetail | undefined {
  if (!(event instanceof CustomEvent)) return undefined

  const detail: unknown = event.detail
  if (!detail || typeof detail !== "object") return undefined
  if (!("text" in detail)) return undefined
  if (typeof detail.text !== "string" || !detail.text) return undefined

  if (!("scope" in detail) || detail.scope === undefined) return { text: detail.text }

  const scope = detail.scope
  if (!scope || typeof scope !== "object") return undefined
  if ("draftID" in scope && typeof scope.draftID === "string") {
    return { text: detail.text, scope: { draftID: scope.draftID } }
  }
  if ("dir" in scope && typeof scope.dir === "string") {
    const id = "id" in scope && typeof scope.id === "string" ? scope.id : undefined
    return { text: detail.text, scope: { dir: scope.dir, id } }
  }

  return undefined
}
