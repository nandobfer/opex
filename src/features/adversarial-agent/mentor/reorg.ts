/**
 * Reorganização do acervo do Agente Mentor (OPE-132), módulo PURO: as opções de destino, a decisão
 * por memória (manter, reescrever, mover, fundir), a conciliação do plano e o alcance do token do
 * Mentor nos canais. A tela e o servidor usam as mesmas funções.
 */

import { MEMORY_SUBSCRIPTION_TARGETS, memoryChannelOf } from "@/features/ai/agents"
import { MENTOR_TARGETS, type MentorReorgAction, type MentorTarget } from "./constants"

/** Lista de uma memória: o agente e, na lista por central, a central. */
export interface ReorgDestination {
    target: MentorTarget
    centralId: string | null
}

/** Retrato da memória revisada (o que o plano mostra e o que a aplicação confere). */
export interface ReorgMemorySnapshot extends ReorgDestination {
    memoryId: string
    resumo: string
    texto: string
    /** Versão lida no Engramind (vai em `expected_version` ao reescrever). */
    versao: number
    /** Escrita pelo dono: arquivar numa fusão exige confirmação explícita. */
    owner: boolean
}

/** Ação proposta do redator, já interpretada. */
export interface ReorgWriterDecision {
    action: "keep" | "rewrite" | "merge"
    text?: string
    memoryId?: string
}

/** Item do plano (módulo puro; o servidor acrescenta id, status e erro). */
export interface ReorgPlanItem {
    memoryId: string
    origin: ReorgMemorySnapshot
    action: MentorReorgAction
    target: MentorTarget
    centralId: string | null
    /** Texto novo (reescrever, mover com ajuste ou a regra fundida). */
    text: string | null
    mergeInto: string | null
    mergeIntoResumo: string | null
    reason: string
    /** Ajuste da conciliação (por que a proposta virou outra ação). */
    note: string | null
    routerConfidence: number | null
    routerReason: string | null
    sanitizerReason: string | null
    /** O token do Mentor não alcança a origem ou o destino (o item não pode ser aprovado). */
    moveBlocked: boolean
    /** A memória (ou a que a absorve) é do dono. */
    ownerMemory: boolean
}

/** Chave estável de uma opção de destino (`developer-central:<centralId>`). */
export function reorgTargetValue(target: MentorTarget, centralId: string | null): string {
    return target === "developer-central" ? `developer-central:${centralId ?? ""}` : target
}

/** Volta da chave para a lista; `null` para chave inválida (destino desconhecido ou central vazia). */
export function parseReorgTargetValue(value: string): ReorgDestination | null {
    const [rawTarget, ...rest] = value.split(":")
    if (!(MENTOR_TARGETS as readonly string[]).includes(rawTarget ?? "")) return null
    if (rawTarget === "developer-central") {
        const centralId = rest.join(":").trim()
        return centralId ? { target: "developer-central", centralId } : null
    }
    return { target: rawTarget as MentorTarget, centralId: null }
}

export function sameList(a: ReorgDestination, b: ReorgDestination): boolean {
    return a.target === b.target && a.centralId === b.centralId
}

/** O token do Mentor alcança o canal (assinatura exata ou por prefixo)? */
export function mentorReachesChannel(channel: string | null): boolean {
    if (!channel) return false
    return MEMORY_SUBSCRIPTION_TARGETS.mentor.some((pattern) => (pattern.endsWith("*") ? channel.startsWith(pattern.slice(0, -1)) : channel === pattern))
}

/** `move_memory` exige `write` na origem e no destino: as duas listas precisam estar no alcance. */
export function moveAllowed(from: ReorgDestination, to: ReorgDestination): boolean {
    return mentorReachesChannel(memoryChannelOf(from.target, { centralId: from.centralId })) && mentorReachesChannel(memoryChannelOf(to.target, { centralId: to.centralId }))
}

/**
 * A ação final de uma memória: o Triador decide a lista e o redator, o texto. Manter numa lista
 * diferente vira `move`; reescrever noutra lista vira `move` com o texto novo; a fusão leva o texto
 * fundido para a memória que fica na lista de destino.
 */
export function planItemAction(input: { origin: ReorgDestination; destination: ReorgDestination; writer: ReorgWriterDecision; mergeExists: boolean }): Pick<ReorgPlanItem, "action" | "target" | "centralId" | "text" | "mergeInto" | "note"> {
    const origin = { target: input.origin.target, centralId: input.origin.centralId }
    const destination = { target: input.destination.target, centralId: input.destination.centralId }
    const moved = !sameList(origin, destination)
    if (input.writer.action === "merge") {
        if (!input.writer.memoryId || !input.mergeExists) {
            return { action: "keep", ...origin, text: null, mergeInto: null, note: "A memória indicada para fusão não está mais na lista de destino: nada será alterado." }
        }
        return {
            action: "merge",
            ...destination,
            text: input.writer.text ?? null,
            mergeInto: input.writer.memoryId,
            note: moved ? "Fundida numa memória da lista de destino; esta é arquivada depois da fusão." : null,
        }
    }
    if (input.writer.action === "rewrite" && input.writer.text) return { action: moved ? "move" : "rewrite", ...destination, text: input.writer.text, mergeInto: null, note: null }
    if (moved) return { action: "move", ...destination, text: null, mergeInto: null, note: null }
    return { action: "keep", ...origin, text: null, mergeInto: null, note: null }
}

const keepWithNote = (item: ReorgPlanItem, note: string): ReorgPlanItem => ({
    ...item,
    action: "keep",
    target: item.origin.target,
    centralId: item.origin.centralId,
    text: null,
    mergeInto: null,
    mergeIntoResumo: null,
    note: [item.note, note].filter(Boolean).join(" "),
})

/**
 * Conciliação do plano: sem fusões cruzadas (A→B e B→A), em cadeia (A→B e B→C) nem duas fusões no
 * mesmo destino (a segunda sobrescreveria o texto da primeira). A primeira fusão vence; a outra vira
 * `keep` com o motivo. Quem recebe uma fusão também fica (não pode mudar de lista).
 */
export function reconcileReorgPlan(items: readonly ReorgPlanItem[]): ReorgPlanItem[] {
    const targets = new Set<string>()
    const absorbed = new Set<string>()
    const rejected = new Map<string, string>()
    for (const item of items) {
        if (item.action !== "merge") continue
        if (!item.mergeInto) {
            rejected.set(item.memoryId, "Fusão sem memória de destino: nada será alterado.")
            continue
        }
        if (targets.has(item.memoryId)) {
            rejected.set(item.memoryId, "Esta memória recebe outra fusão: ela precisa ficar como está.")
            continue
        }
        if (absorbed.has(item.memoryId)) {
            rejected.set(item.memoryId, "Esta memória já será absorvida por outra fusão: nada será alterado.")
            continue
        }
        if (targets.has(item.mergeInto)) {
            rejected.set(item.memoryId, "Outra memória já foi fundida nesta: nada será alterado.")
            continue
        }
        if (absorbed.has(item.mergeInto)) {
            rejected.set(item.memoryId, "A memória de destino desta fusão também será absorvida: nada será alterado.")
            continue
        }
        targets.add(item.mergeInto)
        absorbed.add(item.memoryId)
    }
    return items.map((item) => {
        const reason = rejected.get(item.memoryId)
        if (reason) return keepWithNote(item, reason)
        if (item.action !== "merge" && targets.has(item.memoryId)) return keepWithNote(item, "Esta memória recebe outra fusão: ela precisa ficar como está.")
        return item
    })
}
