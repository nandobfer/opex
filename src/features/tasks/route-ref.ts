/**
 * Endereço da página da tarefa (módulo PURO, cliente e servidor). A URL canônica usa o **código** da
 * tarefa em minúsculas (`/tarefas/ope-145`); o id do MongoDB continua aceito como fallback e é
 * redirecionado para o código (OPE-146).
 */

const OBJECT_ID = /^[a-f0-9]{24}$/i
/** Código `{SIGLA}-{n}` (a sigla sai de `siglaFromRepo`: só letras e números). */
const TASK_CODE = /^[a-z0-9]+-\d+$/i

export type TaskRouteRef = { kind: "id"; id: string } | { kind: "code"; code: string } | { kind: "invalid" }

/** Classifica o segmento da URL: id do MongoDB, código da tarefa (normalizado em maiúsculas) ou inválido. */
export function parseTaskRouteRef(ref: string): TaskRouteRef {
    const value = ref.trim()
    if (OBJECT_ID.test(value)) return { kind: "id", id: value }
    if (TASK_CODE.test(value)) return { kind: "code", code: value.toUpperCase() }
    return { kind: "invalid" }
}

/** Segmento canônico da URL para o código da tarefa (`OPE-145` → `ope-145`). */
export const taskCodeSlug = (code: string) => code.trim().toLowerCase()

/** Acrescenta a query string original ao caminho do redirecionamento. */
export function withSearchParams(path: string, searchParams?: Record<string, string | string[] | undefined>): string {
    if (!searchParams) return path
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams)) {
        if (Array.isArray(value)) value.forEach((item) => query.append(key, item))
        else if (value !== undefined) query.append(key, value)
    }
    const text = query.toString()
    return text ? `${path}?${text}` : path
}
