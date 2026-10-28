import {
    FORK_INTEGRATION_TARGET_LABELS,
    FORK_INTEGRATION_TARGETS,
    FORK_READ_ONLY_COMMANDS,
    OPEN_FORK_STATUSES,
    WORKBENCH_STAGE_LABELS,
    type ForkIntegrationTarget,
    type ForkMode,
    type ForkStatus,
    type RunState,
    type WorkbenchStage,
} from "./constants"
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

/** Fork em aberto (ativo, pausado ou integrando) — pode ter filhos e receber resumos deles. */
export const isOpenFork = (status: ForkStatus) => OPEN_FORK_STATUSES.includes(status)

/** Abrir fork a partir deste fork: em qualquer estado em aberto, inclusive com o agente respondendo. */
export const canOpenChildFork = isOpenFork

// ---------------------------------------------------------------------------
// Modo (Plan/Build) e trava de somente leitura
// ---------------------------------------------------------------------------

/** Agente que abre o fork em Plan (somente leitura); os demais (ex.: `build`) abrem em Build. */
export const READ_ONLY_FORK_AGENT = "plan"

/** Agente do turno no modo Build quando o agente configurado é o `plan`. */
export const WRITE_FORK_AGENT = "build"

export const isReadOnlyForkAgent = (agent: string | null | undefined) => agent === READ_ONLY_FORK_AGENT

/** Modo gravado no fork; forks antigos (sem o campo) eram sempre somente leitura → `plan`. */
export const asForkMode = (value: unknown): ForkMode => (value === "build" ? "build" : "plan")

export const forkModeReadOnly = (mode: ForkMode) => mode === "plan"

/** Modo efetivo: a trava de somente leitura sempre força `plan`. */
export const effectiveForkMode = (mode: unknown, readOnly: boolean | null | undefined): ForkMode => (readOnly ? "plan" : asForkMode(mode))

/**
 * Modo inicial do fork: travado (`readOnly`) = `plan`; modo pedido na abertura; senão, o do agente do
 * papel Fork configurado (`plan` = somente leitura, demais = Build com as permissões do agente).
 */
export function initialForkMode(configuredAgent: string | null | undefined, options: { readOnly?: boolean; mode?: ForkMode } = {}): ForkMode {
    if (options.readOnly) return "plan"
    if (options.mode) return options.mode
    return isReadOnlyForkAgent(configuredAgent) ? "plan" : "build"
}

/** Agente do turno pelo modo: Plan usa o `plan`; Build usa o agente configurado (ou `build` se ele for o `plan`). */
export function forkTurnAgent(mode: ForkMode, configuredAgent: string | null | undefined): string {
    if (forkModeReadOnly(mode)) return READ_ONLY_FORK_AGENT
    return configuredAgent && !isReadOnlyForkAgent(configuredAgent) ? configuredAgent : WRITE_FORK_AGENT
}

/** Texto curto do modo (aviso de abertura e cabeçalho do fork). */
export function forkModeText(mode: ForkMode, readOnly: boolean): string {
    if (readOnly) return "somente leitura (travado)"
    return forkModeReadOnly(mode) ? "Plan, somente leitura" : "Build, pode alterar arquivos"
}

/** Aviso ao agente, no início da próxima mensagem, de que o modo mudou durante a conversa. */
export function forkModeNote(mode: ForkMode, readOnly: boolean): string {
    if (forkModeReadOnly(mode))
        return `[Modo alterado para Plan${readOnly ? " (travado)" : ""}: a partir de agora esta conversa é SOMENTE LEITURA — não altere, crie nem apague arquivos e só rode comandos de leitura.]`
    return "[Modo alterado para Build: a partir de agora você PODE alterar arquivos e executar comandos, dentro das permissões do seu agente. A pasta é a mesma da mesa; não faça commit, push, merge nem troque de branch sem pedido explícito.]"
}

/** Motivo (pt-BR) de não poder trocar o modo nem travar agora; `null` = pode. */
export function forkModeBlockReason(status: ForkStatus, runState: RunState, readOnly: boolean): string | null {
    if (readOnly) return "Fork travado como somente leitura"
    if (!isOpenFork(status)) return "O fork não está mais em aberto"
    if (runState === "running") return "Aguarde o agente terminar de responder"
    return null
}

export const canChangeForkMode = (status: ForkStatus, runState: RunState, readOnly: boolean) => forkModeBlockReason(status, runState, readOnly) === null

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

/**
 * Linha exata com que o fork (modo Build) pede à mesa uma nova prévia: a mesa reconstrói pelo fluxo
 * dela (fila do build, porta reservada, máquina da prévia) em vez de o agente rodar docker compose.
 */
export const FORK_PREVIEW_MARKER = "[opex:gerar-previa]"

/** A resposta do fork pede uma nova prévia (o marcador sozinho numa linha)? */
export function wantsPreviewRebuild(text: string): boolean {
    return text.split("\n").some((line) => line.trim().replace(/^`+|`+$/g, "") === FORK_PREVIEW_MARKER)
}

/** Protocolo fixo dos forks (entrada durável da sessão do fork); `readOnly` = modo Plan. */
export function forkInstructions(extra: string, readOnly = true): string {
    const parts = [
        readOnly
            ? "Esta é uma CONVERSA PARALELA (fork) de uma mesa de trabalho do Opex: o usuário quer tirar dúvidas, investigar ou discutir algo sem interferir no trabalho principal."
            : "Esta é uma CONVERSA PARALELA (fork) de uma mesa de trabalho do Opex: o usuário quer tirar dúvidas, investigar, discutir ou experimentar algo em paralelo ao trabalho principal.",
        ...(readOnly
            ? [
                  "Você está em modo SOMENTE LEITURA: NÃO altere, crie nem apague arquivos; NÃO faça commits, push, merges nem mude de branch; NÃO execute comandos que modifiquem o repositório, o banco ou o ambiente.",
                  `Comandos permitidos: só os de leitura (${FORK_READ_ONLY_COMMANDS.map((command) => command.replace(/\*$/, "").trim()).join(", ")}). Leia arquivos e busque no código com as ferramentas de leitura.`,
              ]
            : [
                  "Você PODE alterar arquivos e executar comandos, dentro das permissões do seu agente, quando o usuário pedir.",
                  "O fork compartilha a pasta (worktree/branch) da mesa: suas alterações afetam o trabalho principal. NÃO faça commits, push, merges nem mude de branch sem o usuário pedir explicitamente, e diga ao final o que alterou.",
                  `Prévia da mesa: NÃO suba, reconstrua nem derrube a prévia com docker ou docker compose (a mesa cuida da porta, da fila do build e da máquina em que ela roda). Para gerar uma nova prévia com o código atual (quando o usuário pedir ou depois de alterar o código a pedido dele), termine a resposta com a linha exata ${FORK_PREVIEW_MARKER} — a mesa reconstrói a prévia sozinha e avisa o resultado.`,
              ]),
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
