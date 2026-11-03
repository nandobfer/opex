/**
 * Destino direto dos arquivos colados/arrastados no editor Vim. O editor esconde o `<textarea>` do
 * campo, então os handlers `onPaste`/`onDrop` dele não recebem o evento original; repetir o evento
 * no `<textarea>` (`new ClipboardEvent`) não leva os arquivos de forma confiável no navegador (o
 * `DataTransfer` da colagem é protegido). O campo que aceita arquivos (ex.: `MarkdownField`)
 * registra aqui o seu handler, e o editor o chama com os arquivos lidos do evento original. Sem
 * dependência do CodeMirror: o campo importa este módulo sem carregar o editor.
 */

/** Recebe os arquivos e a posição do cursor; `true` quando o campo assumiu os arquivos. */
export type FileTargetHandler = (files: File[], position: number) => boolean

const targets = new WeakMap<HTMLTextAreaElement, FileTargetHandler>()

export function registerFileTarget(textarea: HTMLTextAreaElement, handler: FileTargetHandler): () => void {
    targets.set(textarea, handler)
    return () => {
        if (targets.get(textarea) === handler) targets.delete(textarea)
    }
}

/** O handler registrado para o `<textarea>`, ou `null`. */
export function fileTargetOf(textarea: HTMLTextAreaElement): FileTargetHandler | null {
    return targets.get(textarea) ?? null
}
