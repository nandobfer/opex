import type { OpencodeClient } from "@/lib/ai/opencode-client"
import type { OpencodeFormDto, OpencodePermissionDto, OpencodeTokenUsage } from "@/lib/ai/opencode-events"
import { runAgentTurn as runTurn, type TurnResult } from "@/lib/ai/opencode-run"
import type { WorkbenchStage } from "../constants"
import type { AgentConfig } from "../schemas"
import type { WorkbenchEventPayload } from "../types"
import { publishWorkbenchEvent } from "./hub"

/**
 * Turno do agente na mesa de trabalho: adapta o runner genérico (`lib/ai/opencode-run.ts`) ao
 * barramento da mesa (`publishWorkbenchEvent`). A lógica do turno (SSE, heartbeat, interrupt) mora
 * no runner genérico e é compartilhada com o refinamento de tarefas.
 */

export interface TurnRequest {
    workbenchId: string
    sessionId: string
    stage: WorkbenchStage
    title: string
    agent: AgentConfig
    text: string
    timeoutMs: number
    /** Abortado = interromper (botão Parar, exclusão da mesa, desligamento). */
    signal: AbortSignal
    /** Reconexão: acompanha a sessão sem enviar prompt nem trocar agente/modelo. */
    attach?: boolean
    /** Instante (epoch ms) do início do turno; delimita a execução acompanhada na reconexão. */
    startedAt?: number
}

export interface TurnHooks {
    onPermission?: (permission: OpencodePermissionDto) => void | Promise<void>
    onPermissionClosed?: (id: string) => void | Promise<void>
    onForm?: (form: OpencodeFormDto) => void | Promise<void>
    onFormClosed?: (id: string) => void | Promise<void>
    onStep?: (usage: { costUsd: number; tokens: OpencodeTokenUsage }) => void | Promise<void>
    onMoved?: (directory: string) => void | Promise<void>
    heartbeat?: () => void | Promise<void>
}

export type { TurnResult }

export function runAgentTurn(client: OpencodeClient, request: TurnRequest, hooks: TurnHooks = {}): Promise<TurnResult> {
    const publish = (event: WorkbenchEventPayload) => publishWorkbenchEvent(request.workbenchId, event)
    return runTurn(
        client,
        {
            id: request.workbenchId,
            sessionId: request.sessionId,
            stage: request.stage,
            title: request.title,
            agent: request.agent,
            text: request.text,
            timeoutMs: request.timeoutMs,
            signal: request.signal,
            attach: request.attach,
            startedAt: request.startedAt,
        },
        { ...hooks, publish },
    )
}
