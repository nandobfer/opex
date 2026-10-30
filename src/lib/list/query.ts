import { z } from "zod"

/**
 * Peças das listas paginadas por filtro (`GET` com listas em CSV, datas ISO e busca em regex):
 * usadas pelas páginas Agente Revisor, Agente Adversário e Agente Mentor. Módulo puro.
 */

/** Lista CSV da query (`a,b`) → itens; vazio = sem recorte. */
export const csvList = z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").map((part) => part.trim()).filter(Boolean) : []))

/** Ids do Mongo em CSV (ex.: centrais), no máximo `max`. */
export const objectIdCsv = (label: string, max = 100) => csvList.pipe(z.array(z.string().regex(/^[a-f\d]{24}$/i, `${label} inválida`)).max(max))

export const isoDate = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "Data inválida")

/** Página (1+) e tamanho da página com o padrão e o máximo da lista. */
export const pageQuery = (limitDefault: number, limitMax: number) => ({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(limitMax).default(limitDefault),
})

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Busca sem diferenciar maiúsculas (texto escapado: `.` e `(` valem literalmente). */
export const searchPattern = (q: string) => ({ $regex: escapeRegex(q), $options: "i" })

/** Recorte de `createdAt` pelo período (`from`/`to` ISO); `null` sem período. */
export function createdAtRange(from?: string, to?: string): Record<string, Date> | null {
    const range: Record<string, Date> = {}
    if (from) range.$gte = new Date(from)
    if (to) range.$lte = new Date(to)
    return Object.keys(range).length ? range : null
}

/** Partes do filtro combinadas em `$and` quando há mais de uma condição do mesmo nível. */
export function mergeAnd(filter: Record<string, unknown>, and: Record<string, unknown>[]): Record<string, unknown> {
    if (and.length === 1) Object.assign(filter, and[0])
    else if (and.length > 1) filter.$and = and
    return filter
}

/** Envelope das listas paginadas: página, tamanho e total no recorte. */
export function pageInfo(page: number, limit: number, total: number) {
    return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
}
