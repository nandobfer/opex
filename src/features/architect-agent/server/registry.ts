/**
 * Gerações do Agente Arquiteto vivas NESTE processo (SOMENTE servidor). O `runAfterResponse` só
 * dispara o trabalho; o controle (abortar quando o plano é substituído ou a mesa é excluída) e a
 * detecção de órfãos depois de um reinício passam por aqui.
 */

export type AbortReason = "superseded" | "deleted"

interface LiveDiagram {
    workbenchId: string
    controller: AbortController
    reason: AbortReason | null
}

const globalLive = globalThis as unknown as { __architectLiveDiagrams?: Map<string, LiveDiagram> }
const live = (globalLive.__architectLiveDiagrams ??= new Map())

export function registerDiagram(diagramId: string, workbenchId: string): AbortController {
    const controller = new AbortController()
    live.set(diagramId, { workbenchId, controller, reason: null })
    return controller
}

/** Libera a entrada SÓ se ainda for desta execução (uma nova tentativa pode ter registrado outra). */
export function releaseDiagram(diagramId: string, controller: AbortController): void {
    if (live.get(diagramId)?.controller === controller) live.delete(diagramId)
}

export const isDiagramLive = (diagramId: string): boolean => live.has(diagramId)

export const liveDiagramIds = (): string[] => [...live.keys()]

/** Por que a geração foi abortada (`null` = não foi, ou foi pelo tempo/desligamento). */
export const abortReasonOf = (diagramId: string): AbortReason | null => live.get(diagramId)?.reason ?? null

/** Aborta as gerações vivas da mesa (exceto `except`); devolve os ids abortados. */
export function abortWorkbenchDiagrams(workbenchId: string, reason: AbortReason, except?: string): string[] {
    const aborted: string[] = []
    for (const [id, entry] of live) {
        if (entry.workbenchId !== workbenchId || id === except) continue
        entry.reason = reason
        entry.controller.abort()
        aborted.push(id)
    }
    return aborted
}
