/**
 * Transcrição de uma mesa para o Agente Mentor (OPE-165, módulo puro): converte os eventos gravados em
 * `agentic_events` (da mesa e dos forks integrados) e os dados estruturados da mesa em texto, e compacta de
 * forma DETERMINÍSTICA quando passa do limiar (mesma entrada → mesma saída). Nunca corta as mensagens do
 * dono, o plano, os vereditos/achados, os avisos de alerta/erro nem a conclusão manual.
 */

/** Evento gravado (o `payload` de `agentic_events`), lido sem confiar no formato. */
export type TranscriptEvent = Record<string, unknown> & { type?: unknown }

export interface TranscriptFinding {
    id: string
    severity: string
    title: string
    blocking: boolean
    /** Situação na rodada seguinte (resolvido, contestação aceita…), quando houver. */
    status?: string | null
}

export interface TranscriptReview {
    round: number
    decision: string | null
    summary: string | null
    findings: TranscriptFinding[]
    disputes: { id: string; reason: string }[]
}

export interface TranscriptHeader {
    task: { code: string; title: string }
    project: string | null
    plans: { version: number; text: string; feedback: string | null }[]
    pr: { number: number; url: string; state: string; mergedAt: string | null } | null
    manualCompletion: { reason: string; fromStage: string } | null
    reviews: TranscriptReview[]
    completedAt: string
}

export interface TranscriptConversation {
    /** "Conversa principal" ou "Fork #2 (integrado na conversa principal)". */
    title: string
    /** Resumo da integração (forks). */
    note?: string | null
    events: TranscriptEvent[]
}

export interface TranscriptInput {
    header: TranscriptHeader
    conversations: TranscriptConversation[]
}

export interface TranscriptResult {
    text: string
    /** Tamanho da transcrição inteira, sem compactar. */
    originalChars: number
    sentChars: number
    compacted: boolean
    /** Último nível de compactação aplicado (0 = inteira). */
    level: number
    /** Mesmo no último nível ficou acima do limiar. */
    aboveThreshold: boolean
    /** Eventos de conversa lidos (sem contar os dados da mesa). */
    eventCount: number
}

type BlockKind = "turn" | "owner" | "agent" | "tool" | "notice" | "permission" | "form" | "turn-end" | "pr" | "verdict"

interface ToolInfo {
    name: string
    state: string
    input: string
    output: string
    error: string
}

interface Block {
    kind: BlockKind
    text: string
    /** Nunca é cortado nem juntado. */
    keep: boolean
    tool?: ToolInfo
    /** Repetições juntadas neste bloco. */
    repeat?: number
}

interface Section {
    title: string
    note: string | null
    blocks: Block[]
    omittedReads: Record<string, number>
}

const str = (value: unknown): string => (typeof value === "string" ? value : value === null || value === undefined ? "" : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value))

/** Ferramentas de leitura cujas chamadas bem-sucedidas viram um contador no nível 4. */
const READ_TOOLS = new Set(["read", "glob", "grep", "list", "ls", "codegraph_explore", "codegraph_node", "webfetch"])

const TOOL_OUTPUT_HEAD = 600
const TOOL_OUTPUT_TAIL = 400
const TOOL_ERROR_KEEP = 1500
const TOOL_INPUT_KEEP = 300
const AGENT_TEXT_KEEP = 1500

/** Corta o meio, mantendo começo e fim (determinístico). */
export function clipMiddle(text: string, head: number, tail: number): string {
    if (text.length <= head + tail + 40) return text
    return `${text.slice(0, head)}\n[… ${text.length - head - tail} caracteres omitidos …]\n${text.slice(-tail)}`
}

function toolText(tool: ToolInfo): string {
    const lines = [`[Ferramenta ${tool.name} · ${tool.state}]`]
    if (tool.input) lines.push(`entrada: ${tool.input}`)
    if (tool.output) lines.push(`saída: ${tool.output}`)
    if (tool.error) lines.push(`erro: ${tool.error}`)
    return lines.join("\n")
}

/** Eventos → blocos (textos consecutivos do agente juntados; a mesma chamada de ferramenta fica no último estado). */
function blocksOf(events: readonly TranscriptEvent[]): Block[] {
    const blocks: Block[] = []
    const tools = new Map<string, number>()
    for (const event of events) {
        const type = str(event.type)
        const last = blocks.at(-1)
        switch (type) {
            case "turn":
                blocks.push({ kind: "turn", keep: true, text: `=== Turno: ${str(event.title) || str(event.stage)} (${str(event.agent) || "-"} · ${str(event.model) || "-"}) ===` })
                break
            case "user": {
                const files = Array.isArray(event.files) ? event.files.map((file) => str((file as Record<string, unknown>)?.name)).filter(Boolean) : []
                blocks.push({ kind: "owner", keep: true, text: `[Dono] ${str(event.text)}${files.length ? `\n(anexos: ${files.join(", ")})` : ""}` })
                break
            }
            case "text": {
                const text = str(event.text)
                if (!text) break
                if (last?.kind === "agent") last.text += text
                else blocks.push({ kind: "agent", keep: false, text: `[Agente] ${text}` })
                break
            }
            case "tool": {
                const id = str(event.id)
                const tool: ToolInfo = { name: str(event.name) || "ferramenta", state: str(event.state) || "done", input: str(event.input), output: str(event.output), error: str(event.error) }
                const index = id ? tools.get(id) : undefined
                if (index !== undefined) {
                    const previous = blocks[index]!.tool!
                    const merged = { ...tool, input: tool.input || previous.input, output: tool.output || previous.output, error: tool.error || previous.error }
                    blocks[index] = { kind: "tool", keep: false, tool: merged, text: toolText(merged) }
                } else {
                    if (id) tools.set(id, blocks.length)
                    blocks.push({ kind: "tool", keep: false, tool, text: toolText(tool) })
                }
                break
            }
            case "notice": {
                const level = str(event.level) || "info"
                blocks.push({ kind: "notice", keep: level === "warn" || level === "error", text: `[Aviso ${level}] ${str(event.message)}` })
                break
            }
            case "permission": {
                const permission = (event.permission ?? {}) as Record<string, unknown>
                const resources = Array.isArray(permission.resources) ? permission.resources.map(str).join(", ") : ""
                blocks.push({ kind: "permission", keep: false, text: `[Permissão pedida] ${str(permission.action)}${resources ? ` ${resources}` : ""}${permission.message ? ` — ${str(permission.message)}` : ""}` })
                break
            }
            case "permission-replied":
                blocks.push({ kind: "permission", keep: false, text: `[Permissão respondida] ${str(event.decision)}` })
                break
            case "form": {
                const form = (event.form ?? {}) as Record<string, unknown>
                blocks.push({ kind: "form", keep: false, text: `[Formulário] ${str(form.title)}` })
                break
            }
            case "turn-end": {
                const message = str(event.message)
                blocks.push({ kind: "turn-end", keep: event.outcome !== "succeeded", text: `[Fim do turno: ${str(event.outcome)}]${message ? ` ${message}` : ""}` })
                break
            }
            case "pr-watch":
                blocks.push({ kind: "pr", keep: true, text: `[Verificação do PR #${str(event.prNumber)}: ${str(event.outcome) || "-"}] ${str(event.summary)}` })
                break
            case "adversarial-verdict": {
                const findings = Array.isArray(event.findings) ? (event.findings as Record<string, unknown>[]) : []
                const lines = findings.map((finding) => `- ${str(finding.id)} [${str(finding.severity)}${finding.blocking ? ", bloqueia" : ""}] ${str(finding.title)}`)
                blocks.push({ kind: "verdict", keep: true, text: [`[Veredito do Adversário · rodada ${str(event.round)}: ${str(event.outcome)}] ${str(event.summary)}`, ...lines].join("\n") })
                break
            }
            default:
                // reasoning, tool-progress, pr-watch-step, form-closed: sem conteúdo para a lição.
                break
        }
    }
    return blocks
}

function headerText(header: TranscriptHeader): string {
    const lines = [`# Mesa da tarefa ${header.task.code}: ${header.task.title}`]
    if (header.project) lines.push(`Projeto: ${header.project}`)
    lines.push(`Concluída em: ${header.completedAt}`)
    if (header.manualCompletion) lines.push(`Conclusão manual (da etapa ${header.manualCompletion.fromStage}). Motivo do dono: ${header.manualCompletion.reason}`)
    if (header.pr) lines.push(`Pull Request #${header.pr.number} (${header.pr.state}${header.pr.mergedAt ? `, mergeado em ${header.pr.mergedAt}` : ""}): ${header.pr.url}`)
    if (header.plans.length) {
        lines.push("", `## Plano aprovado (versão ${header.plans.at(-1)!.version} de ${header.plans.length})`)
        header.plans.forEach((plan) => {
            if (plan.feedback) lines.push(`- Pedido do dono que originou a versão ${plan.version}: ${plan.feedback}`)
        })
        lines.push("", header.plans.at(-1)!.text)
    }
    if (header.reviews.length) {
        lines.push("", "## Revisões do Agente Adversário")
        for (const review of header.reviews) {
            lines.push(`### Rodada ${review.round}: ${review.decision ?? "sem decisão"}${review.summary ? ` — ${review.summary}` : ""}`)
            review.findings.forEach((finding) => lines.push(`- ${finding.id} [${finding.severity}${finding.blocking ? ", bloqueia" : ""}${finding.status ? `, ${finding.status}` : ""}] ${finding.title}`))
            review.disputes.forEach((dispute) => lines.push(`- Contestação do desenvolvedor (${dispute.id}): ${dispute.reason}`))
        }
    }
    return lines.join("\n")
}

function sectionText(section: Section): string {
    const lines = [`## ${section.title}`]
    if (section.note) lines.push(`Resumo da integração: ${section.note}`)
    for (const block of section.blocks) lines.push(block.repeat && block.repeat > 1 ? `${block.text} (×${block.repeat})` : block.text)
    const reads = Object.entries(section.omittedReads)
    if (reads.length) lines.push(`[Leituras bem-sucedidas omitidas: ${reads.map(([name, count]) => `${name} ×${count}`).join(", ")}]`)
    return lines.join("\n")
}

function render(header: string, sections: readonly Section[]): string {
    return [header, ...sections.map(sectionText)].join("\n\n")
}

const rebuild = (block: Block, tool: ToolInfo): Block => ({ ...block, tool, text: toolText(tool) })

/** Nível 1: blocos idênticos (não protegidos) viram um só, com a contagem. */
function dedupe(section: Section): void {
    const seen = new Map<string, Block>()
    const kept: Block[] = []
    for (const block of section.blocks) {
        if (block.keep || block.kind === "turn") {
            kept.push(block)
            continue
        }
        const key = `${block.kind}\u0000${block.text}`
        const first = seen.get(key)
        if (first) first.repeat = (first.repeat ?? 1) + (block.repeat ?? 1)
        else {
            seen.set(key, block)
            kept.push(block)
        }
    }
    section.blocks = kept
}

const LEVELS: ((section: Section) => void)[] = [
    dedupe,
    // Nível 2: saídas de ferramenta em cabeça + cauda (o erro fica maior).
    (section) => {
        section.blocks = section.blocks.map((block) =>
            block.tool ? rebuild(block, { ...block.tool, output: clipMiddle(block.tool.output, TOOL_OUTPUT_HEAD, TOOL_OUTPUT_TAIL), error: clipMiddle(block.tool.error, TOOL_ERROR_KEEP - 500, 500) }) : block,
        )
    },
    // Nível 3: entradas de ferramenta.
    (section) => {
        section.blocks = section.blocks.map((block) => (block.tool ? rebuild(block, { ...block.tool, input: clipMiddle(block.tool.input, TOOL_INPUT_KEEP - 100, 100) }) : block))
    },
    // Nível 4: leituras bem-sucedidas viram contador.
    (section) => {
        section.blocks = section.blocks.filter((block) => {
            if (!block.tool || block.tool.state === "error" || block.tool.error || !READ_TOOLS.has(block.tool.name.toLowerCase())) return true
            section.omittedReads[block.tool.name] = (section.omittedReads[block.tool.name] ?? 0) + (block.repeat ?? 1)
            return false
        })
    },
    // Nível 5: textos longos do agente com o meio cortado, menos o último de cada turno.
    (section) => {
        const lastOfTurn = new Set<number>()
        let lastAgent = -1
        section.blocks.forEach((block, index) => {
            if (block.kind === "agent") lastAgent = index
            if ((block.kind === "turn" || block.kind === "turn-end") && lastAgent >= 0) {
                lastOfTurn.add(lastAgent)
                lastAgent = -1
            }
        })
        if (lastAgent >= 0) lastOfTurn.add(lastAgent)
        section.blocks = section.blocks.map((block, index) => (block.kind === "agent" && !lastOfTurn.has(index) ? { ...block, text: clipMiddle(block.text, AGENT_TEXT_KEEP - 500, 500) } : block))
    },
]

/** Quantidade de eventos de conversa (os que viram texto). */
const countEvents = (input: TranscriptInput) => input.conversations.reduce((sum, conversation) => sum + conversation.events.length, 0)

/**
 * Monta a transcrição: inteira até `threshold` caracteres; acima, aplica os níveis de compactação em
 * ordem até caber (ou até o último, marcando `aboveThreshold`).
 */
export function buildTranscript(input: TranscriptInput, threshold: number): TranscriptResult {
    const header = headerText(input.header)
    const sections: Section[] = input.conversations.map((conversation) => ({ title: conversation.title, note: conversation.note ?? null, blocks: blocksOf(conversation.events), omittedReads: {} }))
    let text = render(header, sections)
    const originalChars = text.length
    let level = 0
    while (text.length > threshold && level < LEVELS.length) {
        const apply = LEVELS[level]!
        sections.forEach(apply)
        level++
        text = render(header, sections)
    }
    return { text, originalChars, sentChars: text.length, compacted: level > 0, level, aboveThreshold: text.length > threshold, eventCount: countEvents(input) }
}

/** Há conversa de verdade (mensagem do dono ou texto do agente)? Sem isso, a transcrição é vazia. */
export function hasConversation(input: TranscriptInput): boolean {
    return input.conversations.some((conversation) => conversation.events.some((event) => (event.type === "user" || event.type === "text") && str(event.text).trim().length > 0))
}

/** Textos do dono (mensagens) — base do sanitizador contra cópia literal. */
export function ownerMessages(input: TranscriptInput): string[] {
    return input.conversations.flatMap((conversation) => conversation.events.filter((event) => event.type === "user").map((event) => str(event.text)))
}
