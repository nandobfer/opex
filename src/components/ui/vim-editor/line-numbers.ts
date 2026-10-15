import type { Extension } from "@codemirror/state"
import { GutterMarker, gutter, highlightActiveLineGutter, type EditorView } from "@codemirror/view"
import { formatLineNumber, type LineNumbers } from "@/features/editor-mode/line-numbers"

class NumberMarker extends GutterMarker {
    constructor(readonly text: string) {
        super()
    }

    override eq(other: NumberMarker): boolean {
        return other.text === this.text
    }

    override toDOM(): Node {
        return document.createTextNode(this.text)
    }
}

/** Reserva a largura do maior número (mínimo de 2 dígitos) para a coluna não pular ao digitar. */
function spacer(view: EditorView): NumberMarker {
    return new NumberMarker("9".repeat(Math.max(2, String(view.state.doc.lines).length)))
}

/** Coluna de números de linha conforme `number`/`relativenumber`; nenhum dos dois = sem coluna. */
export function lineNumbersExtension(options: LineNumbers): Extension {
    if (!options.number && !options.relativenumber) return []
    return [
        gutter({
            class: "cm-lineNumbers",
            lineMarker(view, line) {
                const number = view.state.doc.lineAt(line.from).number
                const cursor = view.state.doc.lineAt(view.state.selection.main.head).number
                return new NumberMarker(formatLineNumber(number, cursor, options))
            },
            // Relativos mudam a cada movimento do cursor.
            lineMarkerChange: (update) => options.relativenumber && (update.selectionSet || update.docChanged),
            initialSpacer: spacer,
            updateSpacer: (current, update) => {
                const next = spacer(update.view)
                return (current as NumberMarker).text === next.text ? current : next
            },
        }),
        highlightActiveLineGutter(),
    ]
}
