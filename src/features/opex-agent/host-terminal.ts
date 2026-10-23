/**
 * Terminal do host (módulo PURO): diretórios de trabalho dos comandos que o agente executa na máquina
 * do OpenCode. Lista vazia de diretórios permitidos = qualquer diretório.
 */

/** Caminho absoluto da máquina do OpenCode (Linux/macOS), sem `~` nem variáveis. */
export function isAbsoluteHostPath(value: string): boolean {
    return value.startsWith("/")
}

/** Normaliza caminho absoluto (`/a/b/../c/./` → `/a/c`), sem barra no fim (salvo a raiz). */
export function normalizeHostDirectory(value: string): string {
    const parts: string[] = []
    for (const segment of value.trim().split("/")) {
        if (!segment || segment === ".") continue
        if (segment === "..") parts.pop()
        else parts.push(segment)
    }
    return `/${parts.join("/")}`
}

/** O diretório é um dos permitidos ou fica dentro de um deles? Lista vazia = livre. */
export function isHostDirectoryAllowed(directory: string, allowed: readonly string[]): boolean {
    if (allowed.length === 0) return true
    const target = normalizeHostDirectory(directory)
    return allowed.some((entry) => {
        const root = normalizeHostDirectory(entry)
        return root === "/" || target === root || target.startsWith(`${root}/`)
    })
}

export type HostDirectoryResolution = { ok: true; directory: string | null } | { ok: false; message: string }

/**
 * Diretório onde o comando roda: o pedido; senão o primeiro permitido; senão o diretório das sessões
 * do OpenCode (`null` = o padrão do próprio servidor).
 */
export function resolveHostDirectory(requested: string | undefined, allowed: readonly string[], fallback?: string | null): HostDirectoryResolution {
    const raw = requested?.trim()
    if (raw) {
        if (!isAbsoluteHostPath(raw)) return { ok: false, message: `Use um caminho absoluto (ex.: /home/usuario/projeto), não "${raw}".` }
        const directory = normalizeHostDirectory(raw)
        if (!isHostDirectoryAllowed(directory, allowed)) return { ok: false, message: `O diretório ${directory} não está entre os permitidos: ${allowed.map(normalizeHostDirectory).join(", ")}.` }
        return { ok: true, directory }
    }
    if (allowed.length > 0) return { ok: true, directory: normalizeHostDirectory(allowed[0]!) }
    const base = fallback?.trim()
    return { ok: true, directory: base ? normalizeHostDirectory(base) : null }
}

/** Lista salva: normalizada, sem repetição, na ordem informada. */
export function normalizeHostDirectories(list: readonly string[]): string[] {
    return [...new Set(list.map(normalizeHostDirectory).filter(Boolean))]
}
