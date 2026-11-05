import { z } from "zod"
import { defineTool, type OpexTool } from "@/features/opex-agent/server/tools/define"
import { LIVE_WAIT_OVERFLOW_HIBERNATE_MINUTES, MIN_HIBERNATE_MINUTES } from "../../constants"
import { remainingLiveWaitMs } from "../../limits"
import type { RoutineLimits } from "../../schemas"
import type { Activation } from "../hub"

/**
 * Ferramentas internas da execução (OPE-130), sempre liberadas nos dois motores: espera viva
 * (`wait`), hibernação (`hibernate`), confirmação (`request_confirmation`, só com o switch ligado) e
 * conclusão (`finish`). As três últimas **encerram o turno**: no motor Opex o loop para no fim do
 * passo; no OpenCode o agente é instruído a encerrar a resposta.
 */

export interface RoutineToolEnv {
    activation: Activation
    limits: RoutineLimits
    confirmIrreversible: boolean
    /** Troca o status entre Executando e Esperando (grava e publica). */
    setPhase: (phase: "running" | "waiting") => Promise<void>
    now?: () => Date
}

const STOP = "Encerre a resposta agora, sem chamar outras ferramentas."

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) return resolve()
        const timer = setTimeout(done, ms)
        function done() {
            clearTimeout(timer)
            signal.removeEventListener("abort", done)
            resolve()
        }
        signal.addEventListener("abort", done, { once: true })
    })
}

const hhmm = (date: Date) => date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })

export function routineControlTools(env: RoutineToolEnv): OpexTool[] {
    const now = () => env.now?.() ?? new Date()
    const exceeded = () => {
        env.activation.outcome = { kind: "live-wait-exceeded" }
        return {
            status: "live_wait_exhausted",
            instruction: `A espera viva máxima acabou: a execução vai hibernar e será retomada em ${LIVE_WAIT_OVERFLOW_HIBERNATE_MINUTES} min, com o contexto do que você esperava. ${STOP}`,
        }
    }
    const tools: OpexTool[] = [
        defineTool({
            name: "wait",
            group: "routine-agents",
            label: "Espera viva",
            risk: "read",
            description:
                "Espera viva: mantém o turno aberto por alguns segundos/minutos e devolve o controle para você verificar de novo a condição. Use para esperas curtas; para esperas longas (minutos a horas), use hibernate.",
            input: z.object({ seconds: z.number().int().min(1).max(3_600).describe("Quanto esperar, em segundos"), reason: z.string().trim().min(1).max(500).describe("O que você está esperando") }),
            execute: async (input) => {
                const budget = remainingLiveWaitMs(env.activation.liveWaitMs, env.limits)
                if (budget <= 0) return exceeded()
                const ms = Math.min(input.seconds * 1000, budget)
                await env.setPhase("waiting")
                const startedAt = Date.now()
                try {
                    await sleep(ms, env.activation.controller.signal)
                } finally {
                    env.activation.liveWaitMs += Date.now() - startedAt
                    if (!env.activation.controller.signal.aborted) await env.setPhase("running")
                }
                if (remainingLiveWaitMs(env.activation.liveWaitMs, env.limits) <= 0 && ms < input.seconds * 1000) return exceeded()
                return { status: "waited", waitedSeconds: Math.round(ms / 1000), instruction: "Verifique de novo a condição. Se ainda não aconteceu, espere de novo ou hiberne." }
            },
        }),
        defineTool({
            name: "hibernate",
            group: "routine-agents",
            label: "Hibernar",
            risk: "read",
            description: `Encerra o turno e agenda a retomada desta mesma execução (mínimo de ${MIN_HIBERNATE_MINUTES} min), com o motivo. Na retomada você recebe o motivo e pode reagendar até a condição acontecer. Informe minutes OU at (ISO 8601).`,
            input: z.object({
                minutes: z.number().int().min(MIN_HIBERNATE_MINUTES).max(60 * 24 * 30).optional().describe("Daqui a quantos minutos verificar de novo"),
                at: z.string().datetime({ offset: true }).optional().describe("Data e hora ISO 8601 da próxima verificação"),
                reason: z.string().trim().min(1).max(1_000).describe("O que será verificado na retomada"),
            }),
            execute: async (input) => {
                const min = now().getTime() + MIN_HIBERNATE_MINUTES * 60_000
                const wanted = input.at ? new Date(input.at).getTime() : now().getTime() + (input.minutes ?? MIN_HIBERNATE_MINUTES) * 60_000
                const at = new Date(Math.max(min, Number.isFinite(wanted) ? wanted : min))
                env.activation.outcome = { kind: "hibernate", at, reason: input.reason }
                return { status: "hibernating", nextCheckAt: at.toISOString(), instruction: `Próxima verificação às ${hhmm(at)}. ${STOP}` }
            },
        }),
        defineTool({
            name: "finish",
            group: "routine-agents",
            label: "Concluir",
            risk: "read",
            description: "Conclui a execução com o relato final para o dono (o que foi feito, o resultado e pendências). Chame uma única vez, no fim.",
            input: z.object({ report: z.string().trim().min(1).max(20_000).describe("Relato final em pt-BR (markdown)") }),
            execute: async (input) => {
                env.activation.outcome = { kind: "finish", report: input.report }
                return { status: "finished", instruction: STOP }
            },
        }),
    ]
    if (env.confirmIrreversible) {
        tools.push(
            defineTool({
                name: "request_confirmation",
                group: "routine-agents",
                label: "Pedir confirmação",
                risk: "read",
                description:
                    "OBRIGATÓRIO antes de qualquer ação irreversível (enviar candidatura, formulário, mensagem, pagamento, exclusão): pausa a execução até o dono confirmar ou recusar. Descreva a ação exata no resumo. Na retomada você recebe a decisão.",
                input: z.object({ summary: z.string().trim().min(1).max(2_000).describe("A ação exata que será feita se o dono confirmar") }),
                execute: async (input) => {
                    env.activation.outcome = { kind: "confirmation", action: { summary: input.summary, kind: "request", toolName: null, toolLabel: null, input: null, displayInput: null } }
                    return { status: "awaiting_confirmation", instruction: `A ação NÃO foi feita: aguarda o dono. ${STOP}` }
                },
            }),
        )
    }
    return tools
}

/** Nomes das ferramentas que encerram o turno. */
export const TURN_ENDING_TOOLS = ["hibernate", "finish", "request_confirmation"] as const
