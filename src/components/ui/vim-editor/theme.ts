import { EditorView } from "@codemirror/view"

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"

/** Tema do editor Vim pelos tokens do tema escuro (mesma aparência do `<textarea>`). */
export const vimTheme = EditorView.theme(
    {
        "&": { flex: "1 1 auto", minWidth: "0", maxHeight: "60vh", color: "hsl(var(--foreground))", backgroundColor: "transparent", fontSize: "0.875rem" },
        "&.cm-focused": { outline: "none" },
        ".cm-scroller": { fontFamily: MONO, lineHeight: "1.25rem", overflow: "auto" },
        ".cm-content": { padding: "0", caretColor: "hsl(var(--primary))" },
        ".cm-line": { padding: "0" },
        ".cm-placeholder": { color: "hsl(var(--muted-foreground))" },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--primary))" },
        "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
            backgroundColor: "hsl(var(--primary) / 0.35)",
        },
        ".cm-fat-cursor": { background: "hsl(var(--primary) / 0.75)", border: "none", outline: "none" },
        "&:not(.cm-focused) .cm-fat-cursor": { background: "none", outline: "solid 1px hsl(var(--primary) / 0.75)" },
        ".cm-panels": { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--foreground))", borderRadius: "0.25rem", marginTop: "0.25rem" },
        ".cm-panels-bottom": { borderTop: "none" },
        ".cm-vim-panel": { padding: "0.125rem 0.375rem", fontFamily: MONO, fontSize: "0.75rem" },
        ".cm-vim-panel input": { color: "hsl(var(--foreground))", backgroundColor: "transparent", fontFamily: MONO, outline: "none" },
        ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "hsl(var(--muted-foreground) / 0.6)", fontFamily: MONO, lineHeight: "1.25rem" },
        ".cm-lineNumbers .cm-gutterElement": { minWidth: "2ch", padding: "0 0.75rem 0 0", textAlign: "right" },
        ".cm-activeLineGutter": { backgroundColor: "transparent", color: "hsl(var(--primary))", fontWeight: "600" },
        ".cm-searchMatch": { backgroundColor: "hsl(var(--primary) / 0.25)" },
    },
    { dark: true },
)
