/**
 * Liga o contêiner do editor Vim ao `<textarea>` escondido que guarda o valor do campo. Sem
 * dependência do CodeMirror: os atalhos globais (Ctrl+Enter, Ctrl+J, Ctrl+E) resolvem o campo por
 * aqui.
 */

export const VIM_HOST_ATTR = "data-vim-host"

const hosts = new WeakMap<Element, HTMLTextAreaElement>()

export function registerVimHost(host: Element, textarea: HTMLTextAreaElement): () => void {
    hosts.set(host, textarea)
    return () => {
        if (hosts.get(host) === textarea) hosts.delete(host)
    }
}

/** O `<textarea>` do campo quando o elemento está dentro de um editor Vim; senão `null`. */
export function vimHostTextarea(element: Element | null): HTMLTextAreaElement | null {
    const host = element?.closest(`[${VIM_HOST_ATTR}]`)
    return host ? (hosts.get(host) ?? null) : null
}
