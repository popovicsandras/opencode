# Foundations

The constraints that shape every technical decision in this project, and the
shape of the code that resulted. Read this before touching anything; the
feature documents assume it.

Product counterpart: [intent/foundations.md](../intent/foundations.md).

## Constraints

This repository is a fork of OpenCode that we intend to keep rebasing on
upstream `dev`. Two rules follow from that, and they drove nearly every
technical decision:

1. **All feature logic lives in a fork-owned workspace package**
   (`packages/designer-browser`). Upstream commits never touch it, so it never
   needs conflict resolution.
2. **Upstream files may only be touched additively, minimally, and with a
   documented reason.** Each touch point should be a new import plus one call
   or one field, never a structural change to a surrounding function, so that a
   conflicting rebase is a re-placement rather than a re-derivation.

OpenCode has no renderer UI plugin/slot system, no main-process extension
hooks, and no preload bridge extension point. There is no way to add this
feature as a pure add-on. The question was never "can we avoid touching
upstream" but "what is the smallest set of touches, and can each one be
described in a sentence".

## Repo conventions

Conventions for writing code in this repository are in the repo-root
[AGENTS.md](../../AGENTS.md) — not to be confused with
[satori-harness-prototype/AGENTS.md](../AGENTS.md), which is the documentation
working agreement for this project.

The ones that actually came up: no star imports and no aliased imports, prefer
inlining single-use values, avoid `else`, run `bun typecheck` from a package
directory rather than invoking `tsc`, and never run tests from the repo root
(there is a guard).

## The fork-owned package

`packages/designer-browser` is a private workspace package with subpath exports
per module, so consumers import exactly what they need and the Electron-only
modules never leak into the renderer bundle.

| Module | Role | Electron dependency |
| --- | --- | --- |
| `src/contract.ts` | Shared constants, types, and pure validation/sanitisation logic | None (deliberately) |
| `src/layout.ts` | Split-width clamping and persistence helpers | None |
| `src/registry.ts` | Generic per-window controller lifecycle | None |
| `src/main.ts` | Main-process setup: guest hardening, native controller, IPC | Yes |
| `src/preload.ts` | The `contextBridge`-safe API | Yes |
| `src/split.tsx` | The SolidJS split shell | No (renderer) |
| `src/element-reference.ts` | Element description and reference formatting | No (renderer) |
| `src/picker.ts` | Injected picker script construction | No (renderer) |
| `src/custom-elements.d.ts` | `<webview>` JSX intrinsic declaration | Ambient types only |

`contract.ts`, `layout.ts`, and `registry.ts` are kept free of runtime
`electron` imports specifically so their logic can be exercised under plain
`bun:test` without mocking Electron. This paid off — the entire security-
relevant surface (bounds clamping, URL allow-listing, sender trust, webview
param sanitisation) is unit tested with no mocks. **Keep that property.**

## Upstream touch points

All additive. The maintained table with per-file reasoning is in
[docs/DEVIATION-FROM-CORE.md](../../docs/DEVIATION-FROM-CORE.md), which is the
authoritative list; the feature documents here explain the reasoning behind
those deviations rather than cataloguing them.

In short: the desktop package's `package.json` and `tsconfig.json` for wiring,
`main/windows.ts` for `webviewTag: true` and the native-mode registry attach,
`main/ipc.ts` for a single `setupDesignerBrowser()` call, the two preload files
for the bridge type and implementation, and `renderer/index.tsx` to wrap
`AppInterface` in the split shell and wire the element picker's output to the
composer.

`packages/app` is *not* untouched, unlike the initial split-view work: the
split shell wraps `AppInterface` from the outside, which is a virtue for
rebasing, but the element picker's composer integration could not stay purely
fork-owned. See [element-picker.md](element-picker.md) for why, and what the
(small, generic) touch ended up being.
