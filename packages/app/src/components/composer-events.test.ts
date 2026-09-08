import { describe, expect, test } from "bun:test"
import { COMPOSER_INSERT_EVENT, readComposerInsertDetail } from "./composer-events"

describe("composer insert events", () => {
  test("reads a text-only detail", () => {
    expect(readComposerInsertDetail(new CustomEvent(COMPOSER_INSERT_EVENT, { detail: { text: "hello" } }))).toEqual({
      text: "hello",
    })
  })

  test("reads a detail scoped to a draft", () => {
    expect(
      readComposerInsertDetail(
        new CustomEvent(COMPOSER_INSERT_EVENT, { detail: { text: "hello", scope: { draftID: "draft_1" } } }),
      ),
    ).toEqual({ text: "hello", scope: { draftID: "draft_1" } })
  })

  test("reads a detail scoped to a session directory", () => {
    expect(
      readComposerInsertDetail(
        new CustomEvent(COMPOSER_INSERT_EVENT, { detail: { text: "hello", scope: { dir: "/tmp/project", id: "ses_1" } } }),
      ),
    ).toEqual({ text: "hello", scope: { dir: "/tmp/project", id: "ses_1" } })
  })

  test("ignores invalid details", () => {
    expect(readComposerInsertDetail(new Event(COMPOSER_INSERT_EVENT))).toBeUndefined()
    expect(readComposerInsertDetail(new CustomEvent(COMPOSER_INSERT_EVENT, { detail: {} }))).toBeUndefined()
    expect(readComposerInsertDetail(new CustomEvent(COMPOSER_INSERT_EVENT, { detail: { text: "" } }))).toBeUndefined()
    expect(
      readComposerInsertDetail(new CustomEvent(COMPOSER_INSERT_EVENT, { detail: { text: "hello", scope: {} } })),
    ).toBeUndefined()
  })
})
