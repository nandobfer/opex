/**
 * Ponte com a área de transferência do sistema para o modo Vim (sem dependência do CodeMirror).
 * A escrita é livre; a leitura exige permissão do navegador, pedida uma única vez ao ligar o modo
 * Vim (o atalho é um gesto do usuário). Sem permissão, o `p` usa só os registradores internos.
 */

let readAllowed = false
let accessRequested = false

function clipboard(): Clipboard | null {
    return typeof navigator !== "undefined" && navigator.clipboard ? navigator.clipboard : null
}

/** Lê a área de transferência; `null` quando não há permissão ou suporte. */
export async function readSystemClipboard(): Promise<string | null> {
    const api = clipboard()
    if (!api?.readText) return null
    if (!readAllowed) {
        try {
            const status = await navigator.permissions?.query({ name: "clipboard-read" as PermissionName })
            if (status?.state !== "granted") return null
        } catch {
            return null
        }
    }
    try {
        const text = await api.readText()
        readAllowed = true
        return text
    } catch {
        return null
    }
}

/**
 * Pede a permissão de leitura (deve rodar dentro de um gesto do usuário). O pedido acontece uma vez
 * por sessão da página: repetir a cada alternância abriria o prompt várias vezes.
 */
export function requestClipboardAccess(): void {
    if (accessRequested) return
    const api = clipboard()
    if (!api?.readText) return
    accessRequested = true
    api.readText().then(
        () => {
            readAllowed = true
        },
        () => undefined,
    )
}

/** Escreve na área de transferência, ignorando falhas (aba sem foco, permissão negada). */
export function writeSystemClipboard(text: string): void {
    clipboard()
        ?.writeText(text)
        .catch(() => undefined)
}
