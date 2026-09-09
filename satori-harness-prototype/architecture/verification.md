# Verification playbook

How to run this thing and prove a change works. Cross-cutting: it applies to
every feature, and the techniques here were arrived at because the obvious
approaches did not work.

## Running the app

`bun dev:desktop` from the repo root gives HMR and is the most faithful to what
a developer sees. Alternatively build with `bun run electron-vite build` in
`packages/desktop` and run `./node_modules/.bin/electron out/main/index.js`.

Two operational notes: **kill the previous instance after rebuilding** or you
will verify stale code, and backgrounded instances in this environment tend to
exit on their own after a few minutes, so gather evidence promptly after
launch.

## Tests and checks

- `bun test src` and `bun typecheck` from `packages/designer-browser`
- `bun typecheck` from `packages/desktop`
- `bun run electron-vite build`

Never run tests from the repo root — there is a guard.

**Known pre-existing failure, unrelated to this work:** the `packages/desktop`
test suite fails with `error: No such built-in module: node:sqlite` regardless
of these changes.

## Driving the running app over CDP

Launch with `--remote-debugging-port=9222`, enumerate targets with
`curl -s http://127.0.0.1:9222/json/list`, then connect a raw WebSocket from a
`bun` script and issue `Runtime.evaluate` (with `returnByValue`) and
`Page.captureScreenshot`.

This sidesteps macOS screen-recording and window-focus permissions entirely,
which blocked both `screencapture` and `osascript` attempts.

The guest is its own target. `/json/list` shows a `page` entry for the app and
a `webview` entry for the preview guest, so cross-boundary checks mean
connecting to both.

## Techniques worth reusing

**Screenshots beat hit-testing for layering checks.** An `elementFromPoint`
probe over the pane returned a non-dialog element even with the settings dialog
open, which reads like a failure but is not: the dialog layer sets
`pointer-events: none`, so hit-testing skips it by design.
`Page.captureScreenshot` showed the dimmed backdrop covering the preview and
settled the question immediately.

**Synthetic keyboard events can trigger app commands.** Dispatching a
`KeyboardEvent` for `mod+comma` on `window` and `document` opened the settings
dialog, which is how the layering check was automated.

**Assert the `main` element's height** as a regression canary. It catches an
entire class of "wrapped the app in something new" mistakes — see the layout
bug in [split-view.md](split-view.md).

**Exercise features against real, uninstrumented pages, not just fixtures.**
The element picker was verified this way: connect to both the `page` and
`webview` targets, click "Pick element" via `Runtime.evaluate` on the page
target, confirm one `pointer-events: none` outline node exists on the guest
target, dispatch a real `mousemove`/`click` on a guest element, then read
`[contenteditable="true"]`'s `textContent` back on the page target.

Clicking Google's logo image — which carries an `id` but no source attribute —
produced exactly
`<picked-element tag="img" match="identifier" attribute="id" value="hplogo" x="144" y="60" w="112" h="150"/>`
in the composer (real captured values, not illustrative ones), exercising the
identifier tier against a page nobody instrumented for this feature. Clicking a
link with only an `aria-label` (Gmail) landed the `attribute="aria-label"` case
the same way. `Page.captureScreenshot` confirmed the toggle renders in the
pane's corner without disturbing overlay layering — Google's own cookie consent
dialog and logo doodle both still painted above the pane.

That run is also what surfaced the "picking requires a mounted composer" gap
recorded in [element-picker.md](element-picker.md).
