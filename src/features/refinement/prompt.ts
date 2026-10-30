import { buildUnderstandTaskPrompt } from "@/features/ai/understand-task"
import type { TaskRefinementSettings } from "@/features/ai/schemas"
import { resolveRefinementSkill } from "@/features/ai/refinement-skill"
import type { AiSkillDto } from "@/lib/ai/providers"
import type { TaskDetailDto } from "@/features/tasks/types"
import { REFINEMENT_PROTOCOL, REFINEMENT_SPEC_HEADING } from "./constants"

/**
 * Entrada do refinamento (módulo puro): instruções (prompt de sistema + protocolo) e a tarefa
 * completa em Markdown. Reaproveita a montagem da tarefa de "Entender tarefas".
 */

/**
 * Como as instruções do refinamento são aplicadas: `skill` (a skill é ativada na sessão e a entrada
 * durável leva só o protocolo) ou `text` (texto configurado + protocolo). `fallback` explica por que a
 * skill configurada não pôde ser usada (o turno cai no texto e avisa).
 */
export type RefinementInstructionsPlan = { mode: "skill"; skill: AiSkillDto } | { mode: "text"; fallback: string | null }

/** Decide a origem das instruções do turno. `skills === null`: o OpenCode não pôde ser consultado. */
export function planRefinementInstructions(settings: Pick<TaskRefinementSettings, "instructionsSource" | "skill">, skills: readonly AiSkillDto[] | null): RefinementInstructionsPlan {
    if (settings.instructionsSource !== "skill") return { mode: "text", fallback: null }
    const state = resolveRefinementSkill(settings.skill, skills)
    if (state.status === "ok" && state.skill) return { mode: "skill", skill: state.skill }
    return { mode: "text", fallback: state.message }
}

/** Entrada durável da sessão: o protocolo fixo vale sempre; o texto configurado só sem skill. */
export function buildRefinementInstructions(settings: Pick<TaskRefinementSettings, "instructions">, plan: RefinementInstructionsPlan = { mode: "text", fallback: null }): string {
    if (plan.mode === "skill") return `Suas instruções são as da skill "${plan.skill.name}", ativada nesta sessão; siga-as junto com o protocolo abaixo, que prevalece em caso de conflito.\n\n${REFINEMENT_PROTOCOL}`
    return `${settings.instructions.trim()}\n\n${REFINEMENT_PROTOCOL}`
}

export function buildRefinementPrompt(task: TaskDetailDto, include: TaskRefinementSettings["include"]): string {
    const taskMarkdown = buildUnderstandTaskPrompt(task, { comments: include.comments, history: include.history, timeLogs: false }, { fullText: true })
    return `${taskMarkdown}\n\n---\nComece lendo a tarefa e faça a primeira rodada de perguntas usando a ferramenta de perguntas do OpenCode ("question").`
}

/**
 * Retomada de um turno interrompido/falho: continua o esclarecimento de onde parou (pode pedir mais
 * perguntas) e, ao concluir, reescreve a especificação completa.
 */
export function buildRefinementResumePrompt(): string {
    return `Retome o refinamento de onde parou: faça as perguntas que faltarem com a ferramenta \`question\` e, quando a especificação estiver clara, termine com a especificação técnica completa sob o título "${REFINEMENT_SPEC_HEADING}".`
}

/**
 * Consolidação final: o esclarecimento já terminou, mas o turno anterior não produziu a
 * especificação. Deve APENAS reescrever a especificação completa com o que já foi respondido —
 * sem abrir novas perguntas.
 */
export function buildRefinementFinalizePrompt(): string {
    return [
        "O esclarecimento terminou, mas a especificação técnica ainda não foi gravada.",
        "NÃO faça novas perguntas e NÃO use a ferramenta `question` agora: consolide em uma única resposta TODO o entendimento já obtido nesta conversa.",
        `Termine a resposta com a especificação técnica COMPLETA em Markdown, sob o título exatamente "${REFINEMENT_SPEC_HEADING}", cobrindo critérios de aceite, localização da mudança (rotas/URLs, telas, módulos, integrações e arquivos) e casos de borda. Não escreva só as diferenças.`,
    ].join("\n")
}
