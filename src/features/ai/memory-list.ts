import { firstSentence } from "./memory-text"
import type { MemoryDto } from "./types"

/**
 * Lista de memórias (módulo PURO: tela e servidor): ordem de exibição e as mudanças otimistas dos
 * cards. Ativas primeiro (as fixadas no topo), depois as inativas; cada grupo da mais recente para a
 * mais antiga.
 */

const timeOf = (iso: string) => new Date(iso).getTime() || 0

export function sortMemories(list: readonly MemoryDto[]): MemoryDto[] {
    const rank = (item: MemoryDto) => (!item.ativa ? 2 : item.fixada ? 0 : 1)
    return [...list].sort((a, b) => rank(a) - rank(b) || timeOf(b.criadaEm) - timeOf(a.criadaEm))
}

/** Marca de memória ainda não confirmada pelo servidor (criação otimista). */
export const PENDING_PREFIX = "pendente-"

export type MemoryAction =
    | { type: "create"; texto: string; categoria: string }
    | { type: "update"; id: string; texto?: string; categoria?: string; versao?: number }
    | { type: "pin"; id: string; fixada: boolean }
    | { type: "active"; id: string; ativa: boolean }
    | { type: "delete"; id: string }

export function memoryCounts(list: readonly MemoryDto[]): { active: number; inactive: number } {
    const active = list.filter((item) => item.ativa).length
    return { active, inactive: list.length - active }
}

/** Texto do total ao lado de "Nova memória" ("3 ativas · 1 inativa"). */
export function memoryCountLabel(list: readonly MemoryDto[]): string {
    const { active, inactive } = memoryCounts(list)
    return `${active} ${active === 1 ? "ativa" : "ativas"} · ${inactive} ${inactive === 1 ? "inativa" : "inativas"}`
}

export function optimisticMemories(list: readonly MemoryDto[], action: MemoryAction, now = new Date().toISOString()): MemoryDto[] {
    switch (action.type) {
        case "create":
            return sortMemories([
                {
                    id: `${PENDING_PREFIX}${Date.now()}`,
                    texto: action.texto,
                    resumo: firstSentence(action.texto),
                    resumoPendente: true,
                    categoria: action.categoria,
                    fixada: false,
                    ativa: true,
                    versao: 0,
                    autor: null,
                    doDono: true,
                    origin: null,
                    criadaEm: now,
                    atualizadaEm: now,
                },
                ...list,
            ])
        case "update":
            return list.map((item) =>
                item.id === action.id
                    ? {
                          ...item,
                          ...(action.texto !== undefined && action.texto !== item.texto ? { texto: action.texto, resumo: firstSentence(action.texto), resumoPendente: true } : {}),
                          ...(action.categoria !== undefined ? { categoria: action.categoria } : {}),
                          atualizadaEm: now,
                      }
                    : item,
            )
        case "pin":
            return sortMemories(list.map((item) => (item.id === action.id ? { ...item, fixada: action.fixada, ativa: action.fixada ? true : item.ativa, atualizadaEm: now } : item)))
        case "active":
            // Inativar uma fixada também a desafixa (reativada, volta como ativa).
            return sortMemories(list.map((item) => (item.id === action.id ? { ...item, ativa: action.ativa, fixada: action.ativa ? item.fixada : false, atualizadaEm: now } : item)))
        case "delete":
            return list.filter((item) => item.id !== action.id)
    }
}
