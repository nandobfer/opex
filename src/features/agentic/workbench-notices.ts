import { PENDING_TURN_LABELS } from "./constants"
import type { WorkbenchDto } from "./types"

/**
 * Avisos de estado da barra da mesa (erro, reconexão, fila, PR acompanhado, conflitos, CI…), em ordem de
 * importância. O desktop mostra todos acima dos botões; o celular (`< lg`, OPE-166) mostra o primeiro
 * numa linha e expande os demais ao toque.
 */
export interface StatusNotice {
    key: string
    tone: "error" | "muted"
    icon: "plug" | "hourglass" | "pr" | "queue" | "info"
    text: string
    role: "alert" | "status" | null
}

export const RECONNECT_HINT = "Reconectar acompanha a sessão existente sem reenviar a mensagem (use se o agente ainda estiver rodando)."

export function workbenchNotices(workbench: WorkbenchDto, { failed, reconnectNotice }: { failed: boolean; reconnectNotice: string | null }): StatusNotice[] {
    const notices: StatusNotice[] = []
    const running = workbench.runState === "running"
    const slotQueue = workbench.slotQueue
    if (failed && workbench.error) notices.push({ key: "error", tone: "error", icon: "info", text: workbench.error, role: "alert" })
    if (reconnectNotice) notices.push({ key: "reconnect-notice", tone: "muted", icon: "plug", text: reconnectNotice, role: "status" })
    if (slotQueue)
        notices.push({ key: "slot-queue", tone: "muted", icon: "hourglass", text: `Aguardando vaga na central${slotQueue.position ? ` — posição #${slotQueue.position}` : ""}: ${PENDING_TURN_LABELS[slotQueue.action]}.`, role: "status" })
    if (!slotQueue && workbench.stage === "pr_open" && workbench.runState === "idle")
        notices.push({
            key: "watching",
            tone: "muted",
            icon: "pr",
            text: "Acompanhando o PR a cada 2 minutos: um comentário com @opex ou um pedido de mudanças volta ao planejamento; CI falho é corrigido pelo agente (quando a central permite); merge conclui a mesa e move a tarefa para Validação.",
            role: null,
        })
    if (workbench.stage === "resolving_conflicts" && running)
        notices.push({ key: "conflicts", tone: "muted", icon: "pr", text: "O PR está com o merge bloqueado por conflito: o agente está integrando a branch de destino, resolvendo os conflitos e atualizando o PR. Você pode parar a qualquer momento.", role: null })
    if (workbench.stage === "fixing_ci" && running)
        notices.push({ key: "fixing-ci", tone: "muted", icon: "pr", text: "O CI do PR falhou: o agente está lendo os logs, corrigindo a branch do PR e enviando a correção (push). Você pode parar a qualquer momento.", role: null })
    if (workbench.stage === "merging_pr" && running)
        notices.push({ key: "merging", tone: "muted", icon: "pr", text: "Merge automático ligado: o agente está mergeando o PR (preservando o histórico). Se o GitHub recusar por bloqueios, a mesa avisa e você decide.", role: null })
    if (workbench.stage === "deleting_pr_branch" && running) notices.push({ key: "deleting-branch", tone: "muted", icon: "pr", text: "O PR foi mergeado: o agente está apagando a branch remota de origem.", role: null })
    if (workbench.stage === "build_queued")
        notices.push({ key: "build-queue", tone: "muted", icon: "queue", text: `Aguardando a vez do build${workbench.buildQueuePosition ? ` — posição #${workbench.buildQueuePosition}` : ""}. Um build por vez.`, role: null })
    return notices
}

/** Aviso do Reconectar (abaixo dos botões no desktop; no fim da linha de avisos no celular). */
export const reconnectHintNotice: StatusNotice = { key: "reconnect-hint", tone: "muted", icon: "plug", text: RECONNECT_HINT, role: null }
