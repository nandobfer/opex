/**
 * Sincronização entre o editor Vim e o `<textarea>` escondido, que continua sendo a fonte do valor
 * do campo (react-hook-form `register`, `value`/`onChange` controlados e atalhos globais).
 */

const valueDescriptor = (): PropertyDescriptor | undefined => Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")

/**
 * Grava o texto do editor no `<textarea>` e dispara `input`. Usa o setter do protótipo para o
 * rastreador de valor do React notar a diferença e chamar o `onChange` (campos controlados e
 * `register`). Não notifica o observador de `watchExternalValue` (a mudança veio do editor).
 */
export function writeTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
    if (textarea.value === value) return
    valueDescriptor()?.set?.call(textarea, value)
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

/** Espelha a seleção do editor no `<textarea>` (barra de formatação, colar arquivos na posição). */
export function mirrorSelection(textarea: HTMLTextAreaElement, from: number, to: number): void {
    const length = textarea.value.length
    const start = Math.max(0, Math.min(from, length))
    const end = Math.max(start, Math.min(to, length))
    if (textarea.selectionStart === start && textarea.selectionEnd === end) return
    try {
        textarea.setSelectionRange(start, end)
    } catch {
        // Alguns navegadores recusam seleção em campo fora do layout; o valor segue certo.
    }
}

/**
 * Observa atribuições a `textarea.value` vindas de fora do editor (re-render de campo controlado,
 * `reset` do formulário, barra de formatação). Encadeia com o descritor que o React instala na
 * instância (rastreador de valor) e o restaura na limpeza.
 */
export function watchExternalValue(textarea: HTMLTextAreaElement, onChange: (value: string) => void): () => void {
    const own = Object.getOwnPropertyDescriptor(textarea, "value")
    const base = own ?? valueDescriptor()
    if (!base?.get || !base.set) return () => undefined
    const get = base.get
    const set = base.set
    Object.defineProperty(textarea, "value", {
        configurable: true,
        enumerable: base.enumerable ?? false,
        get() {
            return get.call(this)
        },
        set(next: string) {
            set.call(this, next)
            onChange(get.call(this))
        },
    })
    return () => {
        if (own) Object.defineProperty(textarea, "value", own)
        else delete (textarea as { value?: string }).value
    }
}

/**
 * Menor troca que transforma `prev` em `next` (prefixo e sufixo comuns preservados), para aplicar
 * mudanças externas sem mover o cursor de quem está editando longe do trecho alterado.
 */
export function minimalChange(prev: string, next: string): { from: number; to: number; insert: string } | null {
    if (prev === next) return null
    let start = 0
    const max = Math.min(prev.length, next.length)
    while (start < max && prev.charCodeAt(start) === next.charCodeAt(start)) start++
    let endPrev = prev.length
    let endNext = next.length
    while (endPrev > start && endNext > start && prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)) {
        endPrev--
        endNext--
    }
    return { from: start, to: endPrev, insert: next.slice(start, endNext) }
}
