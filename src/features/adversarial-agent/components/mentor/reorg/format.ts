/** Formatação dos números da reorganização (custo, duração e data), em pt-BR. */

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

export const formatReorgCost = (value: number) => (value ? `US$ ${value.toFixed(value < 0.01 ? 4 : 2)}` : "—")

export const formatReorgDuration = (ms: number | null) => {
    if (ms === null) return "—"
    const seconds = Math.round(ms / 1000)
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min ${seconds % 60}s`
}

export const formatReorgDate = (value: string) => formatDistanceToNow(new Date(value), { addSuffix: true, locale: ptBR })
