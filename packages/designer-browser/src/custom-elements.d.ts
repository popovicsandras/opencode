/**
 * TypeScript declaration for Electron's `<webview>` tag.
 * This tells TypeScript that `<webview>` is a valid JSX element in SolidJS.
 * Required for using `<webview>` in the designer browser split (webview mode).
 */

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      webview: HTMLAttributes<HTMLElement> & {
        src?: string
        partition?: string
        allowpopups?: string
        webpreferences?: string
      }
    }
  }
}

export {}
