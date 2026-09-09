# Split view

**Status:** built (prototype).

Product counterpart: [intent/split-view.md](../intent/split-view.md).

## What exists

`packages/designer-browser/src/split.tsx` is a SolidJS shell that wraps
`AppInterface` from the outside. It owns the pane width, clamps it between a
minimum and a viewport-relative maximum, and persists it to `localStorage`. The
clamping and persistence helpers live in `src/layout.ts`, deliberately free of
Electron imports so they are unit tested without mocks.

Resizing uses the existing `ResizeHandle` primitive from `@opencode-ai/ui`, so
the interaction matches the rest of the app rather than reimplementing drag
behaviour.

Wrapping `AppInterface` from the outside is the reason this feature costs
almost nothing upstream: the only touch is `renderer/index.tsx`.

## The layout bug, and the lesson in it

Before the layering problem, the split shipped with the entire chat pane
rendering black. The cause was mundane and worth recording because it will
recur: the wrapper `div` around `props.children` defaulted to `display: block`,
so `AppInterface`'s `flex-1` child had no flex parent to size against and
collapsed to zero height. The `main` element measured `height: 0`.

The fix was adding `flex flex-col` to that wrapper. The lesson is that
**`AppInterface` assumes an unbroken flex-column chain from its mount point**,
and that **the height of the `main` element is an excellent regression canary**
— cheap to assert over CDP and it catches an entire class of "wrapped the app
in something new" mistakes. Both verification passes in this project checked
it; see [verification.md](verification.md).

## Interaction with pane hosting

In webview mode the pane is laid out by CSS like any other element, so the
split shell needs no measurement logic at all.

Native mode is the exception: it needs continuous measurement of a placeholder
element, plus zoom rescaling and fullscreen re-triggering, because the native
view is positioned in window coordinates rather than by CSS. That machinery,
and the three now-optional props it requires on the split component (`bridge`,
`zoomFactor`, `remeasureOn`), is described in
[preview-pane.md](preview-pane.md). It is one of the quieter arguments for
dropping native mode.

## Open decisions

None specific to the split. Whether the three native-mode props survive depends
on the keep-or-drop-native-mode decision in [preview-pane.md](preview-pane.md).
