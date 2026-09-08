import { describe, expect, test } from "bun:test"
import type { Prompt } from "@/context/prompt-state"
import { appendPromptText } from "./composer-insert-bridge"

describe("appendPromptText", () => {
  test("extends an empty trailing text part instead of adding a second one", () => {
    const prompt: Prompt = [{ type: "text", content: "", start: 0, end: 0 }]
    expect(appendPromptText(prompt, "hello")).toEqual({
      prompt: [{ type: "text", content: "hello", start: 0, end: 5 }],
      cursor: 5,
    })
  })

  test("extends a non-empty trailing text part, keeping contiguous offsets", () => {
    const prompt: Prompt = [{ type: "text", content: "look at ", start: 0, end: 8 }]
    expect(appendPromptText(prompt, "this")).toEqual({
      prompt: [{ type: "text", content: "look at this", start: 0, end: 12 }],
      cursor: 12,
    })
  })

  test("pushes a new text part after a non-text trailing part", () => {
    const prompt: Prompt = [{ type: "file", path: "/tmp/a.png", content: "@a.png", start: 0, end: 6 }]
    expect(appendPromptText(prompt, "hello")).toEqual({
      prompt: [
        { type: "file", path: "/tmp/a.png", content: "@a.png", start: 0, end: 6 },
        { type: "text", content: "hello", start: 6, end: 11 },
      ],
      cursor: 11,
    })
  })

  test("starts at zero after a trailing image part, which carries no offsets", () => {
    const blob = { id: "blob_1", url: "blob:img_1" }
    const prompt: Prompt = [{ type: "image", id: "img_1", filename: "a.png", mime: "image/png", blob }]
    expect(appendPromptText(prompt, "hello")).toEqual({
      prompt: [
        { type: "image", id: "img_1", filename: "a.png", mime: "image/png", blob },
        { type: "text", content: "hello", start: 0, end: 5 },
      ],
      cursor: 5,
    })
  })

  test("starts at zero for an empty prompt", () => {
    expect(appendPromptText([], "hello")).toEqual({
      prompt: [{ type: "text", content: "hello", start: 0, end: 5 }],
      cursor: 5,
    })
  })

  test("repeated appends keep extending the same trailing text part", () => {
    const first = appendPromptText([{ type: "text", content: "", start: 0, end: 0 }], "one ")
    const second = appendPromptText(first.prompt, "two")
    expect(second).toEqual({ prompt: [{ type: "text", content: "one two", start: 0, end: 7 }], cursor: 7 })
  })
})
