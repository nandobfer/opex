import { formatDistanceStrict } from "date-fns"
import { ptBR } from "date-fns/locale"
import { describeTrigger } from "./recurrence"
import type { RoutineTriggerKind } from "./schemas"
import type { RoutineAgentDto } from "./types"
import { formatDateTime } from "./format"

/**
 * Gatilhos e próxima execução de um agente rotineiro (OPE-213, módulo PURO). Pedido do dono (27/11/2026): a lista
 * `/agentes-rotineiros` e a página do agente mostram os gatilhos ligados, quando será a próxima execução e o botão
 * Pausar/Retomar. Usado por `RoutineScheduleIndicators`.
 */
export interface RoutineScheduleChip {
    id: string
    kind: RoutineTriggerKind | "manual"
    label: string
    /** Dica: o próximo horário daquele gatilho, quando houver. */
    title: string
}

export interface RoutineScheduleSummary {
    chips: RoutineScheduleChip[]
    next: { tone: "scheduled" | "paused" | "none"; label: string }
}

const relative = (at: Date, now: number) => formatDistanceStrict(at, new Date(now), { addSuffix: true, locale: ptBR })

export function routineScheduleSummary(agent: Pick<RoutineAgentDto, "status" | "schedule" | "nextFireAt">, now: number): RoutineScheduleSummary {
    const enabled = agent.schedule.filter((item) => item.trigger.enabled)
    const chips: RoutineScheduleChip[] = enabled.length
        ? enabled.map((item) => ({
              id: item.trigger.id,
              kind: item.trigger.kind,
              label: describeTrigger(item.trigger),
              title: item.trigger.kind === "webhook" ? "Dispara quando o webhook é chamado" : item.nextAt && agent.status === "active" ? `Próximo disparo ${formatDateTime(item.nextAt)}` : "Sem próximo disparo",
          }))
        : [{ id: "manual", kind: "manual", label: "Só manual", title: "Sem gatilhos ligados: executa por \"Executar agora\", pelo Agente Opex ou pela API" }]
    if (agent.status !== "active") return { chips, next: { tone: "paused", label: agent.status === "archived" ? "Arquivado: sem disparos" : "Pausado: sem disparos" } }
    if (!agent.nextFireAt) return { chips, next: { tone: "none", label: "Sem disparo agendado" } }
    const at = new Date(agent.nextFireAt)
    return { chips, next: { tone: "scheduled", label: `Próxima execução ${formatDateTime(agent.nextFireAt)} (${relative(at, now)})` } }
}
