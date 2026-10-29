/**
 * Sanitizador do Agente Mentor (módulo puro, determinístico): a memória do adversário precisa ser uma
 * regra genérica, sem nada que identifique o projeto ou o caso — código de tarefa, issue, URL, rota,
 * nome do produto, do repositório ou o título da tarefa — e que não copie trechos do caso (mensagem
 * do usuário, respostas do agente, pedidos do desenvolvedor): o texto do caso nunca entra literal nas
 * instruções do revisor, o que também barra uma instrução injetada repassada pelo redator.
 */

export interface SanitizeContext {
    taskCode?: string | null
    taskTitle?: string | null
    projectName?: string | null
    repo?: string | null
    /** Textos do caso que a regra não pode copiar (sequências de `COPY_NGRAM` palavras). */
    sources?: readonly (string | null | undefined)[]
}

/** Quantas palavras seguidas iguais a um texto do caso caracterizam cópia. */
export const COPY_NGRAM = 6

const TASK_CODE = /\b[A-Z]{2,}(?:-[A-Z]+)*-\d+\b/
const ISSUE = /(^|[\s(])#\d+\b/
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/i
const ROUTE = /(^|[\s`'"(])\/(?:api|\(app\)|app)\/[\w\-/[\]().]+/

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const containsTerm = (text: string, term: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, "iu").test(text)

/** Termos do caso que não podem aparecer (só os com 4+ caracteres, para não pegar palavras comuns). */
function caseTerms(context: SanitizeContext): { term: string; label: string }[] {
    const terms: { term: string; label: string }[] = []
    const add = (value: string | null | undefined, label: string) => {
        const term = value?.trim()
        if (term && term.length >= 4) terms.push({ term, label })
    }
    add(context.taskCode, "o código da tarefa")
    add(context.projectName, "o nome do projeto")
    if (context.repo) {
        add(context.repo, "o repositório")
        add(context.repo.split("/").at(-1), "o repositório")
    }
    if (context.taskTitle && context.taskTitle.trim().length >= 8) add(context.taskTitle, "o título da tarefa")
    return terms
}

/** Palavras normalizadas (minúsculas, sem acento nem pontuação). */
function words(text: string): string[] {
    return text
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
}

function ngrams(list: string[], size: number): string[] {
    const result: string[] = []
    for (let index = 0; index + size <= list.length; index++) result.push(list.slice(index, index + size).join(" "))
    return result
}

/** Primeiro trecho da regra (`COPY_NGRAM` palavras seguidas) que aparece num texto do caso. */
export function copiedExcerpt(text: string, sources: readonly (string | null | undefined)[]): string | null {
    const own = ngrams(words(text), COPY_NGRAM)
    if (!own.length) return null
    const seen = new Set(sources.flatMap((source) => (source ? ngrams(words(source), COPY_NGRAM) : [])))
    return own.find((gram) => seen.has(gram)) ?? null
}

/** `null` quando a regra pode ser gravada; senão o motivo da recusa (pt-BR, para o redator reescrever). */
export function sanitizeMemoryText(text: string, context: SanitizeContext = {}): string | null {
    const value = text.trim()
    if (value.length < 3) return "A regra está vazia"
    if (TASK_CODE.test(value)) return "A regra cita um código de tarefa"
    if (ISSUE.test(value)) return "A regra cita uma issue ou PR (#N)"
    if (URL.test(value)) return "A regra cita uma URL"
    if (ROUTE.test(value)) return "A regra cita uma rota ou tela específica"
    for (const { term, label } of caseTerms(context)) {
        if (containsTerm(value, term)) return `A regra cita ${label} ("${term}")`
    }
    const copied = context.sources ? copiedExcerpt(value, context.sources) : null
    if (copied) return `A regra copia um trecho do caso ("${copied}"); reescreva com as suas palavras`
    return null
}
