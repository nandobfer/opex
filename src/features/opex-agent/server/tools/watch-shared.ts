import { z } from "zod"
import { OPEX_WATCH_EVENTS, OPEX_WATCH_FILTERS, OPEX_WATCH_MAX_HOURS, OPEX_WATCH_NOTE_MAX, type OpexWatchDto, type OpexWatchTargetKind } from "../../watches"

/**
 * Entradas e conversões compartilhadas pelas ferramentas de observação do dono e do portal (módulo puro:
 * não importa os serviços), pelo mesmo motivo do `job-shared.ts` — evitar o ciclo com o registro do portal.
 */

export const watchIdField = z
    .string()
    .regex(/^[a-f0-9]{24}$/i, "Id inválido")
    .describe("Id da observação (de list_watches)")

const EVENT_HELP =
    "Evento por alvo — task: done (coluna de conclusão do projeto), column_in (values = chaves de coluna), column_changed (qualquer mudança), archived; workbench: waiting_user (plano, prévia, PR, conclusão…), stage_in (values = etapas), failed, done; routine_run: finished, status_in (values: completed, error, canceled, expired, awaiting_confirmation); job: finished, status_in (values: done, error, awaiting_confirmation, canceled); environment: deploy_finished, status_in (values: success, failed)."

/** Entrada de `watch_event`, com os alvos que o escopo alcança. */
export function watchEventInput(kinds: readonly [OpexWatchTargetKind, ...OpexWatchTargetKind[]], refHelp: string) {
    return z.object({
        target: z.object({
            kind: z.enum(kinds).describe("Tipo do alvo"),
            ref: z.string().trim().min(1).max(120).describe(refHelp),
        }),
        event: z.enum(OPEX_WATCH_EVENTS).describe(EVENT_HELP),
        values: z.array(z.string()).max(20).optional().describe("Com column_in, stage_in e status_in: os valores esperados"),
        note: z.string().min(1).max(OPEX_WATCH_NOTE_MAX).describe("O que você combinou fazer quando acordar (você recebe este texto de volta na notificação, sem precisar lembrar do contexto)"),
        expiresInHours: z.number().int().min(1).max(OPEX_WATCH_MAX_HOURS).optional().describe(`Prazo da observação em horas (padrão 24, até ${OPEX_WATCH_MAX_HOURS}); ao vencer você também é acordado`),
    })
}

export const watchListInput = z.object({
    filter: z.enum(OPEX_WATCH_FILTERS).optional().describe("active (padrão) = observando ou acordando; finished = encerradas; all"),
    scope: z.enum(["session", "all"]).optional().describe("session (padrão) = só as desta conversa; all = todas do escopo"),
})

const short = (value: string) => (value.length > 80 ? `${value.slice(0, 79)}…` : value)

export const summarizeWatch = (input: { target: { kind: string; ref: string }; event: string }) => short(`Observar ${input.target.kind} ${input.target.ref} (${input.event})`)

export function watchView(watch: OpexWatchDto) {
    return {
        id: watch.id,
        target: watch.target,
        condition: watch.conditionText,
        status: watch.status,
        outcome: watch.outcome,
        note: watch.note,
        event: watch.event,
        expiresAt: watch.expiresAt,
        sessionId: watch.sessionId,
        error: watch.error,
        createdAt: watch.createdAt,
    }
}
