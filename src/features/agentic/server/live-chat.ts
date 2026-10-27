import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { steerAgentTurn } from "@/lib/ai/opencode-run"
import { getLocalUser } from "@/lib/local-user"
import { logger } from "@/lib/logger"
import { resolveLiveChat } from "../logic"
import { loadCentral } from "./centrals"
import { publishWorkbenchEvent } from "./hub"
import { loadAgenticSettings } from "./settings"

/**
 * Chat durante a execução (SOMENTE servidor): mensagem do usuário com o agente trabalhando — na mesa,
 * no fork ou no refinamento — entra no turno em andamento (`delivery: "steer"`), sem interromper nem
 * abrir turno novo. Vale com a opção ligada (padrão global + ajuste da central).
 */

const MODULE = "agentic-live-chat"

/** Opção efetiva para a central (`false` se a central ou a configuração não puderem ser lidas). */
export async function liveChatEnabled(centralId: string): Promise<boolean> {
    try {
        const [{ settings }, { config }] = await Promise.all([loadAgenticSettings(), loadCentral(centralId)])
        return resolveLiveChat(settings, config)
    } catch {
        return false
    }
}

export interface LiveMessageTarget {
    /** Id do turno acompanhado (mesa, fork ou refinamento) — o mesmo do barramento de eventos. */
    runId: string
    centralId: string
    /** Auditoria: entidade e identificação legível (tarefa, fork…). */
    audit: { entidade: string; contexto: Record<string, unknown> }
    /** Rótulo do que está executando, para a mensagem de erro ("a mesa", "o fork 2", "o refinamento"). */
    label: string
}

/**
 * Entrega a mensagem ao turno vivo: confere a opção, envia ao OpenCode, mostra na saída como mensagem
 * do usuário e audita. 409 com a opção desligada ou sem turno vivo (terminou ou trocando de etapa).
 */
export async function deliverLiveMessage(target: LiveMessageTarget, text: string): Promise<void> {
    if (!(await liveChatEnabled(target.centralId))) {
        throw new DomainError(409, "O chat durante a execução está desligado (Integrações › Provedores de IA › Desenvolvimento agêntico ou na central)", "LIVE_CHAT_DISABLED")
    }
    let delivered: boolean
    try {
        delivered = await steerAgentTurn(target.runId, text)
    } catch (error) {
        logger.warn({ module: MODULE, runId: target.runId, err: error instanceof Error ? error.message : String(error) }, "[live-chat] OpenCode recusou a mensagem")
        throw new DomainError(502, `O OpenCode recusou a mensagem: ${error instanceof Error ? error.message : String(error)}`, "LIVE_MESSAGE_FAILED")
    }
    if (!delivered) {
        throw new DomainError(409, `O agente não está executando agora em ${target.label} (terminou ou está trocando de etapa). Use as ações da etapa ou tente de novo em instantes.`, "TURN_NOT_RUNNING")
    }
    publishWorkbenchEvent(target.runId, { type: "user", text })
    await recordAudit({
        userId: getLocalUser().id,
        entidade: target.audit.entidade,
        entidadeId: target.runId,
        acao: AcaoAuditoria.ATUALIZAR,
        depois: { ...target.audit.contexto, mensagemDuranteExecucao: text },
    })
    logger.info({ module: MODULE, runId: target.runId, chars: text.length }, "[live-chat] mensagem entregue ao turno em andamento")
}
