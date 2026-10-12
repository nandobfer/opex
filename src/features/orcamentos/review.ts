import { withBasePath } from "@/lib/base-path"
import type { DraftEstimateDto, DraftPreviewDto, DraftTagDto, OrcamentoDraftDto } from "./types"

/**
 * Revisão da prévia (módulo compartilhado, cliente): o estado do stream das DUAS fases de IA, a
 * decisão do que a tela exibe e o leitor NDJSON. Usado pelo **portal do cliente** e pela **prévia do
 * dono** (`/tarefas/previa`), que diferem só no caminho dos endpoints e na autenticação.
 */

export interface BudgetReviewState {
    /** Fase 1 (prévia) em andamento. */
    generatingPreview: boolean
    preview: DraftPreviewDto | null
    /** Fase 2 (estimativa de horas/custo) em andamento. */
    estimating: boolean
    estimate: DraftEstimateDto | null
    /** Tags da prévia já resolvidas (chegam ao fim da estimativa). */
    tags: DraftTagDto[]
    /** Progresso corrente (ex.: ferramenta do agente em execução) — prévia ou estimativa. */
    notice: string | null
    error: string | null
}

export const INITIAL_REVIEW_STATE: BudgetReviewState = { generatingPreview: false, preview: null, estimating: false, estimate: null, tags: [], notice: null, error: null }

/** O que a tela de revisão exibe: enquanto a IA regenera (prévia ou estimativa, ou correção enviada),
 * ignora o cache do rascunho e mostra só o que esta geração já produziu (skeleton até chegar). */
export interface ReviewView {
    running: boolean
    preview: DraftPreviewDto | null
    estimate: DraftEstimateDto | null
    tags: DraftTagDto[]
}

export function selectReviewView(state: BudgetReviewState, data: OrcamentoDraftDto | undefined, correcting: boolean): ReviewView {
    const running = state.generatingPreview || state.estimating || correcting
    return {
        running,
        preview: running ? state.preview : (state.preview ?? data?.preview ?? null),
        estimate: running ? state.estimate : (state.estimate ?? data?.estimate ?? null),
        tags: running ? (state.tags ?? []) : (state.tags?.length ? state.tags : (data?.tags ?? [])),
    }
}

export interface StreamEvent<TEstimate = DraftEstimateDto> {
    type: string
    message?: string
    name?: string
    state?: string
    preview?: DraftPreviewDto
    estimate?: TEstimate
    tags?: DraftTagDto[]
}

/**
 * Lê o NDJSON de um endpoint de revisão e chama `onEvent` linha a linha. `headers` carrega a
 * autenticação quando houver (portal: o token do cliente); `body` é o JSON enviado (`{}` por padrão,
 * `{ clientId }` na estimativa do dono).
 */
export async function readNdjson<TEstimate = DraftEstimateDto>(path: string, options: { headers?: Record<string, string>; body?: unknown }, onEvent: (event: StreamEvent<TEstimate>) => void): Promise<void> {
    const res = await fetch(withBasePath(path), { method: "POST", headers: { "Content-Type": "application/json", ...(options.headers ?? {}) }, body: JSON.stringify(options.body ?? {}) })
    if (!res.ok || !res.body) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? "Não foi possível concluir a requisição")
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
            if (!line.trim()) continue
            try {
                onEvent(JSON.parse(line) as StreamEvent<TEstimate>)
            } catch {
                // Linha parcial/inválida: ignora.
            }
        }
    }
}
