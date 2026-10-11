import { buildUnderstandTaskPrompt } from "@/features/ai/understand-task"
import type { TaskRefinementSettings } from "@/features/ai/schemas"
import type { TaskDetailDto } from "@/features/tasks/types"
import { REFINEMENT_PROTOCOL } from "./constants"

/**
 * Entrada do refinamento (módulo puro): instruções (prompt de sistema + protocolo) e a tarefa
 * completa em Markdown. Reaproveita a montagem da tarefa de "Entender tarefas".
 */

export function buildRefinementInstructions(settings: Pick<TaskRefinementSettings, "instructions">): string {
    return `${settings.instructions.trim()}\n\n${REFINEMENT_PROTOCOL}`
}

export function buildRefinementPrompt(task: TaskDetailDto, include: TaskRefinementSettings["include"]): string {
    const taskMarkdown = buildUnderstandTaskPrompt(task, { comments: include.comments, history: include.history, timeLogs: false }, { fullText: true })
    return `${taskMarkdown}\n\n---\nComece lendo a tarefa e faça a primeira rodada de perguntas usando a ferramenta de perguntas do OpenCode ("question").`
}
