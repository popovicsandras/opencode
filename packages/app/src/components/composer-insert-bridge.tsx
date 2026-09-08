import { makeEventListener } from "@solid-primitives/event-listener"
import { usePrompt, type ContentPart, type Prompt } from "@/context/prompt"
import { COMPOSER_INSERT_EVENT, readComposerInsertDetail } from "./composer-events"

/**
 * Bridges the generic `opencode:composer-insert` window event into the
 * active session's composer. Mounted once per `PromptProvider` instance (see
 * `SessionProviders` in `pages/session.tsx` and `DraftProviders` in
 * `app.tsx`), so any embedder — including forks that cannot reach Solid
 * context, like the designer browser's element picker — can insert text via
 * `notifyComposerInsert` without any Solid context of their own.
 *
 * `detail.scope` is only meaningful when it matches the `PromptProvider`'s
 * own route-scoped session, since readiness is read from the provider's
 * top-level `ready`, not from the captured scope. Every current caller omits
 * `scope`, which always matches; a future scoped caller would need `usePrompt`
 * to expose per-scope readiness instead.
 */
export function ComposerInsertBridge() {
  const prompt = usePrompt()

  makeEventListener(window, COMPOSER_INSERT_EVENT, (event) => {
    const detail = readComposerInsertDetail(event)
    if (!detail) return

    const store = prompt.capture(detail.scope)
    const insert = () => {
      const { prompt: next, cursor } = appendPromptText(store.current(), detail.text)
      store.set(next, cursor)
    }

    const promise = prompt.ready.promise
    if (promise) void promise.then(insert)
    else insert()
  })

  return null
}

/**
 * Appends `text` to `prompt`, extending a trailing text part rather than
 * adding a second one right after it. Returns the resulting cursor position
 * alongside the prompt since `ImageAttachmentPart` (a possible last part)
 * carries no offsets of its own.
 */
export function appendPromptText(prompt: Prompt, text: string): { prompt: Prompt; cursor: number } {
  const last = prompt.at(-1)
  if (last?.type === "text") {
    const end = last.end + text.length
    const extended: ContentPart = { ...last, content: last.content + text, end }
    return { prompt: [...prompt.slice(0, -1), extended], cursor: end }
  }

  const start = last && last.type !== "image" ? last.end : 0
  const end = start + text.length
  const part: ContentPart = { type: "text", content: text, start, end }
  return { prompt: [...prompt, part], cursor: end }
}
