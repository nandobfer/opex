import { applyTimelineLine, INITIAL_TIMELINE, type TimelineState } from "./timeline"
import type { WorkbenchStreamLine } from "./types"

/**
 * Saída exibida + carga em preparo (módulo puro, OPE-188). Com saída já exibida (guardada ou de antes da
 * reconexão), o `reset` abre uma carga nova por trás e a tela só troca no `ready`, de uma vez — sem
 * "Carregando a saída…" nem piscar o vazio. Sem nada exibido (primeira visita), a carga é progressiva:
 * o `reset` marca `loaded` e os itens aparecem conforme chegam.
 */
export interface StreamView {
    shown: TimelineState
    staging: TimelineState | null
}

export const streamViewFrom = (cached: TimelineState | null): StreamView => ({ shown: cached ?? INITIAL_TIMELINE, staging: null })

const hasContent = (state: TimelineState) => state.loaded && state.items.length > 0

export function applyStreamLine(view: StreamView, line: WorkbenchStreamLine): StreamView {
    if (line.type === "reset") {
        const fresh: TimelineState = { ...INITIAL_TIMELINE, loaded: true }
        return hasContent(view.shown) ? { shown: view.shown, staging: fresh } : { shown: fresh, staging: null }
    }
    if (line.type === "ready") return view.staging ? { shown: view.staging, staging: null } : view
    if (view.staging) {
        const staging = applyTimelineLine(view.staging, line)
        return staging === view.staging ? view : { shown: view.shown, staging }
    }
    const shown = applyTimelineLine(view.shown, line)
    return shown === view.shown ? view : { shown, staging: null }
}

export const applyStreamLines = (view: StreamView, lines: WorkbenchStreamLine[]): StreamView => lines.reduce(applyStreamLine, view)
