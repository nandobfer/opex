import { randomUUID } from "crypto"
import { logger } from "@/lib/logger"
import type { PrWatchLevel, PrWatchOutcome, PrWatchStep } from "../types"
import { dropIdlePrWatchEvents, prepareHub, publishWorkbenchEvent } from "./hub"

/**
 * Relato de uma verificação do PR na saída da mesa: cada passo vai ao vivo (`pr-watch-step`,
 * transitório) e, no fim, a verificação inteira é gravada (`pr-watch`). Uma verificação sem
 * novidade (`idle`) apaga as anteriores sem novidade — fica só a última. Falhas do relato nunca
 * interrompem o acompanhamento.
 */
export interface PrWatchReporter {
    step(text: string, level?: PrWatchLevel): void
    finish(outcome: PrWatchOutcome, summary: string): Promise<void>
    /** Falha da verificação: fecha o relato com erro (ou só avisa, se ele já tinha sido fechado). */
    fail(message: string): Promise<void>
    readonly finished: boolean
}

export async function startPrWatchReport(workbenchId: string, prNumber: number, nextCheckAt: string | null): Promise<PrWatchReporter> {
    const checkId = randomUUID()
    const startedAt = new Date().toISOString()
    const steps: PrWatchStep[] = []
    let finished = false
    let ready = true
    try {
        await prepareHub(workbenchId)
    } catch (error) {
        ready = false
        logger.warn({ err: error, workbenchId }, "[agentic] Acompanhamento do PR sem saída ao vivo")
    }

    const step = (text: string, level: PrWatchLevel = "info") => {
        if (finished) return
        steps.push({ ts: new Date().toISOString(), level, text })
        if (ready) publishWorkbenchEvent(workbenchId, { type: "pr-watch-step", checkId, prNumber, level, text })
    }

    const finish = async (outcome: PrWatchOutcome, summary: string) => {
        if (finished) return
        finished = true
        if (!ready) return
        try {
            if (outcome === "idle") await dropIdlePrWatchEvents(workbenchId)
            publishWorkbenchEvent(workbenchId, { type: "pr-watch", checkId, prNumber, startedAt, steps, outcome, summary, nextCheckAt })
        } catch (error) {
            logger.warn({ err: error, workbenchId }, "[agentic] Falha ao gravar a verificação do PR")
        }
    }

    return {
        step,
        finish,
        async fail(message) {
            if (!finished) {
                step(message, "error")
                await finish("error", "Falha na verificação do PR")
                return
            }
            if (ready) publishWorkbenchEvent(workbenchId, { type: "notice", level: "error", message: `Acompanhamento do PR #${prNumber}: ${message}` })
        },
        get finished() {
            return finished
        },
    }
}
