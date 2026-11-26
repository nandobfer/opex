import { z } from "zod"
import { WORKBENCH_STAGES, WORKBENCH_STAGE_LABELS, type WorkbenchStage } from "@/features/agentic/constants"
import { ROUTINE_RUN_STATUS_LABELS, type RoutineRunStatus } from "@/features/routine-agents/status"
import { OPEX_JOB_STATUS_LABELS, type OpexJobOriginDto, type OpexJobStatus } from "./jobs"

/**
 * Observação de eventos do Agente Opex (OPE-194, módulo puro: tela e servidor). O agente assina um evento
 * (tarefa, mesa, execução de rotineiro, job ou deploy de ambiente), encerra o turno e é acordado UMA vez
 * pelo sistema quando o evento acontece (ou quando a observação vence ou o alvo é excluído), com uma
 * mensagem de sistema (`kind: "event"`). Ver `aicontext/modules/opex-agent.md`, "Observação de eventos".
 */

export const OPEX_WATCH_TARGET_KINDS = ["task", "workbench", "routine_run", "job", "environment"] as const
export type OpexWatchTargetKind = (typeof OPEX_WATCH_TARGET_KINDS)[number]

/** Alvos que o portal do cliente alcança (mesas e rotineiros são só do dono). */
export const OPEX_CLIENT_WATCH_TARGET_KINDS = ["task", "job", "environment"] as const satisfies readonly OpexWatchTargetKind[]

export const OPEX_WATCH_TARGET_LABELS: Record<OpexWatchTargetKind, string> = {
    task: "Tarefa",
    workbench: "Mesa de trabalho",
    routine_run: "Execução de rotineiro",
    job: "Job do agente",
    environment: "Ambiente",
}

export const OPEX_WATCH_EVENTS = ["done", "column_in", "column_changed", "archived", "waiting_user", "stage_in", "failed", "finished", "status_in", "deploy_finished"] as const
export type OpexWatchEventName = (typeof OPEX_WATCH_EVENTS)[number]

/** Eventos aceitos por alvo. */
export const OPEX_WATCH_EVENTS_BY_TARGET: Record<OpexWatchTargetKind, readonly OpexWatchEventName[]> = {
    task: ["done", "column_in", "column_changed", "archived"],
    workbench: ["waiting_user", "stage_in", "failed", "done"],
    routine_run: ["finished", "status_in"],
    job: ["finished", "status_in"],
    environment: ["deploy_finished", "status_in"],
}

/** Eventos que exigem `values` (colunas, etapas ou status). */
export const OPEX_WATCH_EVENTS_WITH_VALUES: readonly OpexWatchEventName[] = ["column_in", "stage_in", "status_in"]

/** Etapas em que a mesa espera o usuário (ou o PR): o padrão de `waiting_user`. */
export const OPEX_WATCH_WAITING_STAGES: readonly WorkbenchStage[] = ["plan_review", "spec_ready", "preview", "pr_open", "changes_requested", "adversarial_blocked", "done"]
export const OPEX_WATCH_FAILED_RUN_STATES = ["failed", "interrupted"] as const

export const OPEX_WATCH_ROUTINE_STATUSES = ["completed", "error", "canceled", "expired", "awaiting_confirmation"] as const satisfies readonly RoutineRunStatus[]
export const OPEX_WATCH_ROUTINE_FINAL: readonly string[] = ["completed", "error", "canceled", "expired"]
export const OPEX_WATCH_JOB_STATUSES = ["done", "error", "awaiting_confirmation", "canceled"] as const satisfies readonly OpexJobStatus[]
export const OPEX_WATCH_DEPLOY_STATUSES = ["success", "failed"] as const
const DEPLOY_STATUS_LABELS: Record<string, string> = { success: "Concluído", failed: "Falhou" }

/** Status aceitos em `status_in`, por alvo. */
export const OPEX_WATCH_STATUS_VALUES: Partial<Record<OpexWatchTargetKind, readonly string[]>> = {
    routine_run: OPEX_WATCH_ROUTINE_STATUSES,
    job: OPEX_WATCH_JOB_STATUSES,
    environment: OPEX_WATCH_DEPLOY_STATUSES,
}

export const OPEX_WATCH_STATUSES = ["watching", "triggered", "delivering", "woken", "expired", "canceled", "error"] as const
export type OpexWatchStatus = (typeof OPEX_WATCH_STATUSES)[number]
export const OPEX_WATCH_STATUS_LABELS: Record<OpexWatchStatus, string> = {
    watching: "Observando",
    triggered: "Disparada",
    delivering: "Acordando o agente",
    woken: "Acordou o agente",
    expired: "Expirada",
    canceled: "Cancelada",
    error: "Falhou",
}
/** Ainda vai acordar o agente (conta no limite e protege a sessão da limpeza). */
export const OPEX_WATCH_ACTIVE_STATUSES = ["watching", "triggered", "delivering"] as const satisfies readonly OpexWatchStatus[]
export const isActiveWatchStatus = (status: OpexWatchStatus) => (OPEX_WATCH_ACTIVE_STATUSES as readonly OpexWatchStatus[]).includes(status)

export const OPEX_WATCH_OUTCOMES = ["event", "expired", "target_deleted"] as const
export type OpexWatchOutcome = (typeof OPEX_WATCH_OUTCOMES)[number]

export const OPEX_WATCH_DEFAULT_HOURS = 24
export const OPEX_WATCH_MAX_HOURS = 720
export const OPEX_WATCH_MAX_PER_SESSION = 10
export const OPEX_WATCH_MAX_PER_OWNER = 50
export const OPEX_WATCH_NOTE_MAX = 2000
/** Histórico: a observação encerrada é apagada depois disto (índice TTL em `purgeAt`). */
export const OPEX_WATCH_RETENTION_MS = 30 * 86_400_000
export const OPEX_WATCH_LIST_LIMIT = 200

export const OPEX_WATCH_UPDATED_EVENT = "opex-watch-updated"
export const OPEX_WATCH_AUDIT_ENTITY = "ObservacaoAgenteOpex"
/** Aba de `/integracoes/crons` com as observações. */
export const OPEX_WATCHES_TAB = "observacoes" as const

export const OPEX_WATCH_FILTERS = ["active", "finished", "all"] as const
export type OpexWatchFilter = (typeof OPEX_WATCH_FILTERS)[number]
export const OPEX_WATCH_ORIGIN_FILTERS = ["all", "owner", "client"] as const

const OBJECT_ID = /^[a-f0-9]{24}$/i

export const opexWatchInputSchema = z
    .object({
        target: z.object({
            kind: z.enum(OPEX_WATCH_TARGET_KINDS),
            ref: z.string().trim().min(1, "Informe o alvo").max(120),
        }),
        event: z.enum(OPEX_WATCH_EVENTS),
        values: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
        note: z.string().trim().min(1, "Diga o que fazer ao acordar").max(OPEX_WATCH_NOTE_MAX, `Até ${OPEX_WATCH_NOTE_MAX} caracteres`),
        expiresInHours: z.number().int().min(1).max(OPEX_WATCH_MAX_HOURS).optional(),
    })
    .superRefine((value, ctx) => {
        if (!OPEX_WATCH_EVENTS_BY_TARGET[value.target.kind].includes(value.event))
            ctx.addIssue({ code: "custom", path: ["event"], message: `Evento inválido para ${OPEX_WATCH_TARGET_LABELS[value.target.kind].toLowerCase()}: use ${OPEX_WATCH_EVENTS_BY_TARGET[value.target.kind].join(", ")}` })
        const needs = OPEX_WATCH_EVENTS_WITH_VALUES.includes(value.event)
        if (needs && !value.values?.length) ctx.addIssue({ code: "custom", path: ["values"], message: "Informe os valores esperados (colunas, etapas ou status)" })
        if (value.event === "stage_in") {
            const invalid = (value.values ?? []).filter((stage) => !(WORKBENCH_STAGES as readonly string[]).includes(stage))
            if (invalid.length) ctx.addIssue({ code: "custom", path: ["values"], message: `Etapas inválidas: ${invalid.join(", ")}` })
        }
        if (value.event === "status_in") {
            const allowed = OPEX_WATCH_STATUS_VALUES[value.target.kind] ?? []
            const invalid = (value.values ?? []).filter((status) => !allowed.includes(status))
            if (invalid.length) ctx.addIssue({ code: "custom", path: ["values"], message: `Status inválidos: ${invalid.join(", ")} (aceitos: ${allowed.join(", ")})` })
        }
    })
export type OpexWatchInput = z.infer<typeof opexWatchInputSchema>

export const opexWatchListQuerySchema = z.object({
    filter: z.enum(OPEX_WATCH_FILTERS).default("active"),
    origin: z.enum(OPEX_WATCH_ORIGIN_FILTERS).default("all"),
    clientId: z.string().regex(OBJECT_ID, "Cliente inválido").optional(),
    userId: z.string().trim().min(1).max(40).optional(),
    sessionId: z.string().regex(OBJECT_ID, "Sessão inválida").optional(),
})
export type OpexWatchListQuery = z.infer<typeof opexWatchListQuerySchema>

export interface OpexWatchCondition {
    event: OpexWatchEventName
    values: string[]
    /** Rótulos dos valores no momento da assinatura (nomes das colunas, etapas ou status). */
    labels: string[]
}

export interface OpexWatchTarget {
    kind: OpexWatchTargetKind
    id: string
    /** Foto do momento: código da tarefa, nome do agente, título do job, nome do ambiente. */
    label: string
}

/**
 * Fato que aconteceu num alvo (montado no ponto de transição). `deleted` vale para qualquer alvo.
 * Os campos opcionais dependem do alvo: tarefa (`from`/`to`/`done`/`archived`), mesa (`stage`/
 * `previousStage`/`runState`), execução, job e deploy (`status`).
 */
export interface OpexWatchEvent {
    kind: OpexWatchTargetKind
    id: string
    label: string
    deleted?: boolean
    from?: { key: string; name: string } | null
    to?: { key: string; name: string } | null
    done?: boolean
    archived?: boolean
    stage?: string | null
    previousStage?: string | null
    runState?: string | null
    status?: string | null
    error?: string | null
    /** Instante da transição (gravado no fato): o prazo da observação é conferido contra ele, não contra a entrega. */
    at?: Date
}

/** Estado atual de um alvo (lido UMA vez na assinatura, para não esperar algo que já aconteceu). */
export interface OpexWatchTargetState {
    columnKey?: string | null
    done?: boolean
    archived?: boolean
    stage?: string | null
    runState?: string | null
    status?: string | null
}

const changedColumn = (event: OpexWatchEvent) => Boolean(event.to && event.to.key !== event.from?.key)
const enteredStage = (event: OpexWatchEvent) => Boolean(event.stage && event.stage !== event.previousStage)

/** O fato casa com a condição? (`deleted` casa com tudo: o desfecho é `target_deleted`.) */
export function matchesWatch(target: Pick<OpexWatchTarget, "kind" | "id">, condition: Pick<OpexWatchCondition, "event" | "values">, event: OpexWatchEvent): boolean {
    if (event.kind !== target.kind || event.id !== target.id) return false
    if (event.deleted) return true
    const values = condition.values ?? []
    switch (condition.event) {
        case "done":
            if (target.kind === "task") return changedColumn(event) && event.done === true
            return enteredStage(event) && event.stage === "done"
        case "column_in":
            return changedColumn(event) && values.includes(event.to!.key)
        case "column_changed":
            return changedColumn(event)
        case "archived":
            return event.archived === true
        case "waiting_user":
            return enteredStage(event) && (OPEX_WATCH_WAITING_STAGES as readonly string[]).includes(event.stage!)
        case "stage_in":
            return enteredStage(event) && values.includes(event.stage!)
        case "failed":
            return Boolean(event.runState && (OPEX_WATCH_FAILED_RUN_STATES as readonly string[]).includes(event.runState))
        case "finished":
            if (!event.status) return false
            return target.kind === "routine_run" ? OPEX_WATCH_ROUTINE_FINAL.includes(event.status) : (OPEX_WATCH_JOB_STATUSES as readonly string[]).includes(event.status)
        case "status_in":
            return Boolean(event.status && values.includes(event.status))
        case "deploy_finished":
            return Boolean(event.status && (OPEX_WATCH_DEPLOY_STATUSES as readonly string[]).includes(event.status))
    }
}

/** A condição já está satisfeita no estado atual? (Deploy e "qualquer mudança" sempre esperam o próximo.) */
export function currentSatisfies(kind: OpexWatchTargetKind, condition: Pick<OpexWatchCondition, "event" | "values">, state: OpexWatchTargetState): boolean {
    const values = condition.values ?? []
    switch (condition.event) {
        case "done":
            return kind === "task" ? state.done === true : state.stage === "done"
        case "column_in":
            return Boolean(state.columnKey && values.includes(state.columnKey))
        case "archived":
            return state.archived === true
        case "waiting_user":
            return Boolean(state.stage && (OPEX_WATCH_WAITING_STAGES as readonly string[]).includes(state.stage))
        case "stage_in":
            return Boolean(state.stage && values.includes(state.stage))
        case "failed":
            return Boolean(state.runState && (OPEX_WATCH_FAILED_RUN_STATES as readonly string[]).includes(state.runState))
        case "finished":
            if (kind === "environment" || !state.status) return false
            return kind === "routine_run" ? OPEX_WATCH_ROUTINE_FINAL.includes(state.status) : (OPEX_WATCH_JOB_STATUSES as readonly string[]).includes(state.status)
        case "status_in":
            return kind !== "environment" && Boolean(state.status && values.includes(state.status))
        case "column_changed":
        case "deploy_finished":
            return false
    }
}

/**
 * O estado mudou entre duas leituras do alvo de um jeito que a condição pegaria? Usado na janela da
 * assinatura (entre a leitura inicial e a gravação), para "qualquer mudança" e eventos de transição
 * que `currentSatisfies` não enxerga.
 */
export function changedInto(target: Pick<OpexWatchTarget, "kind" | "id" | "label">, condition: Pick<OpexWatchCondition, "event" | "values">, before: OpexWatchTargetState, after: OpexWatchTargetState): boolean {
    const base = { kind: target.kind, id: target.id, label: target.label }
    const event: OpexWatchEvent =
        target.kind === "task"
            ? {
                  ...base,
                  from: before.columnKey ? { key: before.columnKey, name: before.columnKey } : null,
                  to: after.columnKey ? { key: after.columnKey, name: after.columnKey } : null,
                  done: after.done === true,
                  archived: !before.archived && after.archived === true,
              }
            : target.kind === "workbench"
              ? { ...base, stage: after.stage ?? null, previousStage: before.stage ?? null, runState: after.runState !== before.runState ? (after.runState ?? null) : null }
              : { ...base, status: after.status !== before.status ? (after.status ?? null) : null }
    return matchesWatch(target, condition, event)
}

/** Rótulo de um status/etapa para os textos. */
export function statusLabel(kind: OpexWatchTargetKind, value: string): string {
    if (kind === "workbench") return WORKBENCH_STAGE_LABELS[value as WorkbenchStage] ?? value
    if (kind === "routine_run") return ROUTINE_RUN_STATUS_LABELS[value as RoutineRunStatus] ?? value
    if (kind === "job") return OPEX_JOB_STATUS_LABELS[value as OpexJobStatus] ?? value
    if (kind === "environment") return DEPLOY_STATUS_LABELS[value] ?? value
    return value
}

const quoteList = (items: readonly string[]) => items.map((item) => `"${item}"`).join(", ")

export function watchTargetText(target: Pick<OpexWatchTarget, "kind" | "label">): string {
    switch (target.kind) {
        case "task":
            return `tarefa ${target.label}`
        case "workbench":
            return `mesa ${target.label}`
        case "routine_run":
            return `execução do rotineiro ${target.label}`
        case "job":
            return `job "${target.label}"`
        case "environment":
            return `ambiente ${target.label}`
    }
}

/** Condição em texto curto ("chegar na coluna de conclusão"). */
export function watchConditionText(kind: OpexWatchTargetKind, condition: OpexWatchCondition): string {
    const labels = condition.labels.length ? condition.labels : condition.values.map((value) => statusLabel(kind, value))
    switch (condition.event) {
        case "done":
            return kind === "task" ? "chegar na coluna de conclusão" : "ser concluída"
        case "column_in":
            return `chegar em ${quoteList(labels)}`
        case "column_changed":
            return "mudar de coluna"
        case "archived":
            return "ser arquivada"
        case "waiting_user":
            return "parar para o usuário (plano, prévia, PR ou conclusão)"
        case "stage_in":
            return `entrar em ${quoteList(labels)}`
        case "failed":
            return "falhar ou ser interrompida"
        case "finished":
            return "terminar"
        case "status_in":
            return `terminar com ${quoteList(labels)}`
        case "deploy_finished":
            return "o próximo deploy terminar"
    }
}

/** Texto da pílula "Observando…" do chat. */
export function watchPillText(target: Pick<OpexWatchTarget, "kind" | "label">, condition: OpexWatchCondition): string {
    return `Observando ${watchTargetText(target)} · ${watchConditionText(target.kind, condition)}`
}

/** O que aconteceu, em uma frase (vai para o modelo e para a lista). */
export function watchEventSummary(event: OpexWatchEvent): string {
    const target = watchTargetText(event)
    if (event.deleted) return `A ${target} foi excluída.`
    const error = event.error ? `: ${event.error.slice(0, 400)}` : ""
    switch (event.kind) {
        case "task":
            if (event.to) return `A ${target} mudou de coluna: "${event.from?.name ?? "?"}" → "${event.to.name}"${event.done ? " (coluna de conclusão)" : ""}.`
            if (event.archived) return `A ${target} foi arquivada.`
            return `A ${target} mudou.`
        case "workbench":
            if (event.runState && (OPEX_WATCH_FAILED_RUN_STATES as readonly string[]).includes(event.runState) && !enteredStage(event))
                return `A ${target} ${event.runState === "failed" ? "falhou" : "foi interrompida"}${error}.`
            return `A ${target} entrou na etapa "${statusLabel("workbench", event.stage ?? "")}"${event.previousStage ? ` (antes: "${statusLabel("workbench", event.previousStage)}")` : ""}.`
        case "routine_run":
            return `A ${target} ficou "${statusLabel("routine_run", event.status ?? "")}"${error}.`
        case "job":
            return `O ${target} terminou como "${statusLabel("job", event.status ?? "")}"${error}.`
        case "environment":
            return `O deploy do ${target} terminou: "${statusLabel("environment", event.status ?? "")}"${error}.`
    }
}

/** Versão curta do fato, para a pílula ("OPE-12 foi para Concluído"). */
export function watchEventShort(event: OpexWatchEvent): string {
    if (event.deleted) return `${event.label} excluído`
    switch (event.kind) {
        case "task":
            return event.to ? `${event.label} foi para ${event.to.name}` : `${event.label} arquivada`
        case "workbench":
            return event.stage && enteredStage(event) ? `mesa ${event.label} em ${statusLabel("workbench", event.stage)}` : `mesa ${event.label} ${event.runState === "failed" ? "falhou" : "interrompida"}`
        default:
            return `${event.label}: ${statusLabel(event.kind, event.status ?? "")}`
    }
}

/** Observação pronta para acordar (dados que o texto precisa). */
export interface OpexWakeWatch {
    id: string
    target: OpexWatchTarget
    condition: OpexWatchCondition
    note: string
    outcome: OpexWatchOutcome
    event: { summary: string; short: string; at: Date } | null
    createdAt: Date
    expiresAt: Date
}

function wakeBlock(watch: OpexWakeWatch, format: (date: Date) => string): string {
    const target = watchTargetText(watch.target)
    const head =
        watch.outcome === "expired"
            ? `A observação venceu em ${format(watch.expiresAt)} sem o evento acontecer. Informe o usuário em poucas palavras e pergunte se quer continuar observando.`
            : watch.outcome === "target_deleted"
              ? `O alvo foi excluído (${target}); a observação foi encerrada. Informe o usuário.`
              : `Evento: ${watch.event?.summary ?? "o evento aconteceu."}${watch.event ? ` (${format(watch.event.at)})` : ""}`
    return [
        `[NOTIFICAÇÃO DO SISTEMA · observação ${watch.id}]`,
        head,
        `Alvo: ${target}. Condição: ${watchConditionText(watch.target.kind, watch.condition)}. Observando desde ${format(watch.createdAt)}.`,
        `O que você combinou fazer: ${watch.note}`,
    ].join("\n")
}

/**
 * Texto que acorda o agente: um bloco por observação (agrupadas por sessão), como o lembrete sintético
 * do OpenCode — vai como mensagem de usuário, mas marcada como do sistema.
 */
export function wakeModelText(watches: readonly OpexWakeWatch[], format: (date: Date) => string): string {
    return [
        "<system-reminder>",
        watches.map((watch) => wakeBlock(watch, format)).join("\n\n"),
        "Esta mensagem é do sistema, não do usuário. Continue o que foi combinado; não agende job para verificar estes alvos.",
        "</system-reminder>",
    ].join("\n")
}

function wakeLine(watch: OpexWakeWatch): string {
    if (watch.outcome === "expired") return `Observação expirada · ${watch.target.label}`
    if (watch.outcome === "target_deleted") return `Alvo excluído · ${watchTargetText(watch.target)}`
    return `Evento · ${watch.event?.short ?? watch.target.label}`
}

/** Texto curto da pílula do acordar. */
export function wakeDisplay(watches: readonly OpexWakeWatch[]): string {
    if (watches.length === 1) return wakeLine(watches[0]!)
    return `${watches.length} notificações do sistema · ${watches.map(wakeLine).join(" · ")}`
}

export interface OpexWatchDto {
    id: string
    sessionId: string
    target: OpexWatchTarget
    condition: OpexWatchCondition
    conditionText: string
    pillText: string
    note: string
    status: OpexWatchStatus
    outcome: OpexWatchOutcome | null
    event: { summary: string; at: string } | null
    expiresAt: string
    triggeredAt: string | null
    wokenAt: string | null
    error: string | null
    createdAt: string
    origin: OpexJobOriginDto
}

/** Tempo até vencer, curto ("23 h", "12 min", "3 dias"). */
export function formatWatchRemaining(expiresAt: string | Date, now: Date): string {
    const ms = new Date(expiresAt).getTime() - now.getTime()
    if (ms <= 60_000) return "menos de 1 min"
    const minutes = Math.round(ms / 60_000)
    if (minutes < 60) return `${minutes} min`
    const hours = Math.round(minutes / 60)
    if (hours < 48) return `${hours} h`
    return `${Math.round(hours / 24)} dias`
}
