import { endOfDay, isValid, parseISO, startOfDay } from "date-fns"
import type { UrlFilterCodec } from "@/hooks/useUrlFilters"

/** Período das listas com filtros na URL (`yyyy-MM-dd`), usado pelas páginas dos agentes. Módulo puro. */

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Dia válido (`yyyy-MM-dd`) ou nada: link antigo, truncado ou editado à mão não derruba a página. */
export function validDay(value: string): string {
    return DAY.test(value) && isValid(parseISO(value)) ? value : ""
}

export const dayCodec: UrlFilterCodec<string> = {
    parse: (raw, fallback) => (raw === null ? fallback : validDay(raw.trim())),
    serialize: (value) => value,
}

/** Período do dia inteiro no fuso do navegador, em ISO (ausente = sem recorte). */
export function dayRangeParams(fromDay: string, toDay: string): { from?: string; to?: string } {
    const params: { from?: string; to?: string } = {}
    const from = validDay(fromDay)
    const to = validDay(toDay)
    if (from) params.from = startOfDay(parseISO(from)).toISOString()
    if (to) params.to = endOfDay(parseISO(to)).toISOString()
    return params
}
