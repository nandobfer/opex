import { FORK_INTEGRATION_TARGET_LABELS, FORK_INTEGRATION_TARGETS, FORK_READ_ONLY_COMMANDS, OPEN_FORK_STATUSES, WORKBENCH_STAGE_LABELS, type ForkIntegrationTarget, type ForkStatus, type RunState, type WorkbenchStage } from "./constants"
import { canRun, type WorkbenchAction } from "./logic"
import type { WorkbenchContext } from "./prompts"

/** Regras puras dos forks da conversa (cliente e servidor). */

export type ForkAction = "send" | "close" | "interrupt" | "retry" | "resume" | "integrate" | "discard" | "revise-summary" | "apply" | "cancel-integration"

/** Ações disponíveis num fork (os botões da tela e a guarda das rotas usam a mesma regra). */
export function forkActions(status: ForkStatus, runState: RunState, hasSummary = false): ForkAction[] {
    if (runState === "running") return status === "active" || status === "integrating" ? ["interrupt"] : []
    const failed = runState === "failed" || runState === "interrupted"
    switch (status) {
        case "active":
            return failed ? ["retry", "close"] : ["send", "close"]
        case "closed":
            return ["resume", "integrate", "discard"]
        case "integrating":
            if (failed) return ["retry", "cancel-integration"]
            return hasSummary ? ["apply", "revise-summary", "cancel-integration"] : ["cancel-integration"]
        default:
            return []
    }
}

export const canRunFork = (status: ForkStatus, runState: RunState, action: ForkAction, hasSummary = false) => forkActions(status, runState, hasSummary).includes(action)

/** Fork em aberto (ativo, encerrado ou integrando) — pode ter filhos e receber resumos deles. */
export const isOpenFork = (status: ForkStatus) => OPEN_FORK_STATUSES.includes(status)

/** Abrir fork a partir deste fork: em qualquer estado em aberto, inclusive com o agente respondendo. */
export const canOpenChildFork = isOpenFork

/** Fork pai visto pelo filho: `null` quando o filho veio da conversa principal; `status: null` = pai descartado. */
export interface ForkParentView {
    number: number
    status: ForkStatus | null
}

export interface ForkIntegrationOption {
    target: ForkIntegrationTarget
    label: string
    description: string
    available: boolean
    /** Motivo (pt-BR) quando indisponível. */
    reason: string | null
}

interface WorkbenchForTargets {
    stage: WorkbenchStage
    runState: RunState
    sessionId: string | null
    waitingSlot: boolean
}

/** Ação da mesa usada para enviar o resumo ao planejador na etapa atual (`null` = indisponível agora). */
export function plannerActionFor(workbench: WorkbenchForTargets): Extract<WorkbenchAction, "revise-plan" | "request-correction" | "submit-pr-feedback"> | null {
    const candidates = ["revise-plan", "request-correction", "submit-pr-feedback"] as const
    return candidates.find((action) => canRun(workbench.stage, workbench.runState, action, workbench.waitingSlot)) ?? null
}

/**
 * Destinos possíveis do resumo do fork, conforme a etapa da mesa e o fork pai. O destino "Fork pai"
 * só existe para forks de fork e fica disponível com o pai em aberto.
 */
export function forkIntegrationTargets(workbench: WorkbenchForTargets, parent: ForkParentView | null = null): ForkIntegrationOption[] {
    const done = workbench.stage === "done"
    return FORK_INTEGRATION_TARGETS.filter((target) => target !== "parent" || parent).map((target) => {
        const base = { target, ...FORK_INTEGRATION_TARGET_LABELS[target] }
        switch (target) {
            case "parent": {
                const label = `Fork pai (Fork ${parent!.number})`
                if (!parent!.status) return { ...base, label, available: false, reason: "O fork pai foi descartado" }
                return isOpenFork(parent!.status) ? { ...base, label, available: true, reason: null } : { ...base, label, available: false, reason: "O fork pai não está mais em aberto (integrado ou concluído)" }
            }
            case "context":
                return workbench.sessionId
                    ? { ...base, available: true, reason: null }
                    : { ...base, available: false, reason: done ? "A mesa está concluída e não tem mais conversa principal" : "A mesa ainda não tem uma sessão do OpenCode" }
            case "planner":
                if (done) return { ...base, available: false, reason: "A mesa está concluída: use Reabrir a mesa" }
                return plannerActionFor(workbench)
                    ? { ...base, available: true, reason: null }
                    : { ...base, available: false, reason: "Disponível quando a mesa aguarda correção: Plano pronto, Prévia pronta, Mudanças pedidas no PR ou etapa com falha" }
            case "reopen":
                return canRun(workbench.stage, workbench.runState, "reopen", workbench.waitingSlot)
                    ? { ...base, available: true, reason: null }
                    : { ...base, available: false, reason: "Disponível só com a mesa concluída" }
        }
    })
}

export interface ForkTreeItem<T> {
    fork: T
    /** 0 = aberto da conversa principal; 1 = fork de fork; … */
    depth: number
}

/**
 * Forks em árvore para o seletor: cada fork seguido dos filhos (em ordem de número), recuados por
 * nível. Filho de pai descartado sobe para a raiz (mantém o rótulo "de Fork N").
 */
export function forkTree<T extends { id: string; number: number; parentForkId: string | null }>(forks: readonly T[]): ForkTreeItem<T>[] {
    const ids = new Set(forks.map((fork) => fork.id))
    const byParent = new Map<string | null, T[]>()
    for (const fork of [...forks].sort((a, b) => a.number - b.number)) {
        const key = fork.parentForkId && ids.has(fork.parentForkId) ? fork.parentForkId : null
        byParent.set(key, [...(byParent.get(key) ?? []), fork])
    }
    const out: ForkTreeItem<T>[] = []
    const visit = (parent: string | null, depth: number) => {
        for (const fork of byParent.get(parent) ?? []) {
            out.push({ fork, depth })
            visit(fork.id, depth + 1)
        }
    }
    visit(null, 0)
    return out
}

const SUMMARY_HEADING = "Resumo para integração"

const normalize = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()

/**
 * Resumo do fork no texto do agente: o conteúdo sob o título `## Resumo para integração` (qualquer
 * nível, tolerante a caixa e acento) até o próximo título de nível igual ou maior. Sem o título, usa
 * o texto inteiro (o turno de consolidação só pede o resumo). `null` quando não há texto.
 */
export function extractForkSummary(text: string): string | null {
    const lines = text.split("\n")
    const start = lines.findIndex((line) => {
        const match = /^(#{1,6})\s+(.*)$/.exec(line.trim())
        return Boolean(match && normalize(match[2]!.replace(/[*_`:]/g, "")) === normalize(SUMMARY_HEADING))
    })
    if (start === -1) return text.trim() || null
    const level = /^(#{1,6})/.exec(lines[start]!.trim())![1]!.length
    const body: string[] = []
    for (const line of lines.slice(start + 1)) {
        const match = /^(#{1,6})\s/.exec(line.trim())
        if (match && match[1]!.length <= level) break
        body.push(line)
    }
    return body.join("\n").trim() || null
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/** Protocolo fixo dos forks (entrada durável da sessão do fork). */
export function forkInstructions(extra: string): string {
    const parts = [
        "Esta é uma CONVERSA PARALELA (fork) de uma mesa de trabalho do Opex: o usuário quer tirar dúvidas, investigar ou discutir algo sem interferir no trabalho principal.",
        "Você está em modo SOMENTE LEITURA: NÃO altere, crie nem apague arquivos; NÃO faça commits, push, merges nem mude de branch; NÃO execute comandos que modifiquem o repositório, o banco ou o ambiente.",
        `Comandos permitidos: só os de leitura (${FORK_READ_ONLY_COMMANDS.map((command) => command.replace(/\*$/, "").trim()).join(", ")}). Leia arquivos e busque no código com as ferramentas de leitura.`,
        "Responda em português do Brasil, de forma direta. Pergunte quando algo estiver ambíguo.",
    ]
    const text = extra.trim()
    if (text) parts.push("", "## Instruções adicionais da central", text)
    return parts.join("\n")
}

/** Contexto de um fork aberto sem a conversa principal (mesa concluída ou sem sessão). */
export function forkFreshContextPrompt(ctx: WorkbenchContext, info: { stage: WorkbenchStage; plan: string | null; prUrl: string | null }): string {
    const plan = (info.plan ?? "").trim()
    return [
        `Contexto: mesa de trabalho da tarefa ${ctx.code} (${ctx.title}) do produto ${ctx.projectName}, na etapa "${WORKBENCH_STAGE_LABELS[info.stage]}".`,
        "Esta conversa NÃO tem o histórico da conversa principal da mesa (ela foi encerrada). Use o contexto abaixo e o código do repositório.",
        `Repositório: ${ctx.sessionDirectory}${ctx.repo ? ` (${ctx.repo})` : ""}. Branch da tarefa: ${ctx.branch}.`,
        info.prUrl ? `Pull Request: ${info.prUrl}` : "",
        plan ? `\n## Último plano da mesa\n${plan}` : "",
    ]
        .filter(Boolean)
        .join("\n")
}

/** Primeira mensagem de um fork: o contexto (quando a sessão é nova) + a mensagem do usuário. */
export function forkFirstPrompt(text: string, freshContext: string | null): string {
    return freshContext ? `${freshContext}\n\n---\n## Mensagem do usuário\n${text}` : text
}

/** Pede ao agente do fork o resumo do que foi levantado na conversa. */
export function forkIntegratePrompt(): string {
    return [
        "O usuário encerrou esta conversa paralela e quer INTEGRAR o que foi levantado à mesa de trabalho.",
        "Consolide as informações relevantes para a tarefa: descobertas, decisões, respostas às dúvidas, restrições, riscos e o que deve mudar no trabalho.",
        "Escreva só fatos e conclusões úteis para quem continua o trabalho (não repita a conversa nem inclua cumprimentos).",
        `Responda APENAS com o título exato "## ${SUMMARY_HEADING}" seguido do resumo em Markdown, em português do Brasil.`,
        "Não altere arquivos.",
    ].join("\n")
}

/** Pede a reescrita do resumo conforme o ajuste do usuário. */
export function forkReviseSummaryPrompt(request: string, current: string | null): string {
    return [
        "O usuário quer MODIFICAR o resumo que será integrado à mesa. Reescreva o resumo COMPLETO considerando o pedido abaixo.",
        `Responda APENAS com o título exato "## ${SUMMARY_HEADING}" seguido do resumo em Markdown, em português do Brasil.`,
        "",
        "## Pedido do usuário",
        request,
        current ? `\n## Resumo atual\n${current}` : "",
    ]
        .filter(Boolean)
        .join("\n")
}

/** Retoma um turno do fork que falhou ou foi interrompido. */
export function forkRetryPrompt(error: string | null, lastText: string): string {
    return `A execução anterior não terminou (${error ?? "motivo desconhecido"}). Retome de onde parou e responda à mensagem abaixo.\n\n${lastText}`
}

/** Instrução durável da sessão principal (ou do fork pai) com os resumos dos forks integrados. */
export function forkNotesInstructions(notes: { number: number; summary: string }[], scope: "workbench" | "fork" = "workbench"): string {
    if (!notes.length) return ""
    return [
        scope === "workbench"
            ? "Informações levantadas pelo usuário em conversas paralelas (forks) desta mesa e integradas ao contexto. Considere-as nas próximas etapas:"
            : "Informações levantadas pelo usuário em conversas paralelas derivadas desta (forks deste fork) e integradas a ela. Considere-as nas próximas respostas:",
        ...notes.map((note) => `\n## Fork ${note.number}\n${note.summary.trim()}`),
    ].join("\n")
}

/** Texto enviado ao planejador ao integrar o fork com o destino "Enviar ao planejador" ou "Reabrir a mesa". */
export function forkPlannerFeedback(number: number, summary: string): string {
    return `Informações levantadas na conversa paralela (Fork ${number}) para considerar no plano:\n\n${summary.trim()}`
}
