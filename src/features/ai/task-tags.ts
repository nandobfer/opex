import { createHash } from "crypto"
import { z } from "zod"
import { TASK_TYPE_LABELS, type TaskType } from "@/features/tasks/constants"
import { filterKnownTags, type TaskTagDef } from "@/features/tasks/tags"
import type { JevAnswer, JevQuestion } from "@/lib/ai/jev"
import type { TaskTagsSettings } from "./schemas"

/**
 * Entrada da feature "Tags de tarefas" (módulo PURO): instruções (prompt de sistema + contrato
 * JSON contra a taxonomia), prompt com a tarefa, parsers da saída em texto e das respostas do JEV
 * (uma pergunta `noul` por tag), hash da fonte e detecção de tags desatualizadas.
 */

export const MAX_TAGS_DESCRIPTION = 6000

/** Contrato da saída em texto (provedores que geram texto). */
export const taskTagsResponseSchema = z.object({ tags: z.array(z.string()) })

/** Fonte considerada para as tags: título + descrição normalizados. */
export interface TaskTagsSource {
    title: string
    description: string | null
}

/** Tarefa como o modelo a recebe. */
export interface TaskTagsInput extends TaskTagsSource {
    taskType: TaskType | null
    projectName: string | null
    summary: string | null
}

export function taskTagsSourceHash(source: TaskTagsSource): string {
    return createHash("sha1").update(`${source.title.trim()}\n${(source.description ?? "").trim()}`).digest("hex")
}

/** Sem hash de fonte (nunca gerou) ou fonte mudou: precisa gerar de novo. */
export function needsTags(input: TaskTagsSource & { tagsSourceHash: string | null }): boolean {
    if (!input.tagsSourceHash) return true
    return input.tagsSourceHash !== taskTagsSourceHash(input)
}

function clip(text: string | null | undefined, max = MAX_TAGS_DESCRIPTION): string {
    const value = (text ?? "").trim()
    return value.length > max ? `${value.slice(0, max)}… (cortado)` : value
}

/** Instruções de sistema: prompt configurado + taxonomia fechada + contrato de saída JSON. */
export function buildTaskTagsInstructions(settings: Pick<TaskTagsSettings, "instructions">, taxonomy: readonly TaskTagDef[], maxTags: number): string {
    const catalog = taxonomy.map((tag) => `- "${tag.id}": ${tag.label}`).join("\n")
    const contract = [
        "Escolha as tags que melhor descrevem a tarefa, usando EXATAMENTE os ids desta taxonomia fechada:",
        catalog || "(a taxonomia está vazia)",
        "",
        "Responda APENAS com um objeto JSON válido, sem texto antes ou depois e sem cercas de código, com exatamente esta chave:",
        `- "tags": array com no máximo ${maxTags} ids da lista acima (use [] quando nenhuma se aplicar). Não invente ids.`,
    ].join("\n")
    return `${settings.instructions.trim()}\n\n${contract}`
}

export function buildTaskTagsPrompt(task: TaskTagsInput): string {
    const facts = [
        `- Tipo: ${task.taskType ? TASK_TYPE_LABELS[task.taskType] : "não informado"}`,
        task.projectName && `- Projeto: ${task.projectName}`,
    ].filter(Boolean)
    const parts = [
        `# Tarefa: ${task.title}`,
        facts.join("\n"),
        task.summary ? `Resumo: ${clip(task.summary, 400)}` : "",
        task.description ? `## Descrição\n${clip(task.description)}` : "",
        "Classifique a tarefa com as tags da taxonomia.",
    ]
    return parts.filter(Boolean).join("\n\n")
}

/** Extrai o primeiro objeto JSON do texto (aceita cercas de código ```json). */
function extractJsonObject(text: string): string | null {
    const segments = text.includes("```") ? text.split("```") : [text]
    for (const segment of segments) {
        const start = segment.indexOf("{")
        const end = segment.lastIndexOf("}")
        if (start !== -1 && end > start) return segment.slice(start, end + 1)
    }
    return null
}

/** Valida a saída em texto e devolve as tags conhecidas; `null` quando o JSON for inválido. */
export function parseTaskTags(text: string, taxonomy: readonly TaskTagDef[], maxTags: number): string[] | null {
    const json = extractJsonObject(text)
    if (!json) return null
    try {
        const parsed = taskTagsResponseSchema.safeParse(JSON.parse(json))
        if (!parsed.success) return null
        return filterKnownTags(parsed.data.tags, taxonomy, maxTags)
    } catch {
        return null
    }
}

/** Id da pergunta `noul` de uma tag (o id do JEV é nosso; o modelo não o vê). */
export const jevTagQuestionId = (tagId: string) => `tag_${tagId.replace(/-/g, "_")}`

/** Uma questão `noul` por tag da taxonomia ("a tarefa envolve <tag>?"). */
export function buildJevTagQuestions(taxonomy: readonly TaskTagDef[]): Record<string, JevQuestion> {
    const questions: Record<string, JevQuestion> = {}
    for (const tag of taxonomy) {
        questions[jevTagQuestionId(tag.id)] = { type: "noul", instructions: `A tarefa envolve ou exige trabalho de "${tag.label}"?` }
    }
    return questions
}

/** Tags cuja probabilidade (`noul`) alcançou o limiar, ordenadas por probabilidade. */
export function selectJevTags(answers: Record<string, JevAnswer> | undefined, taxonomy: readonly TaskTagDef[], threshold: number, maxTags: number): string[] {
    const scored: { id: string; value: number }[] = []
    for (const tag of taxonomy) {
        const answer = answers?.[jevTagQuestionId(tag.id)]
        if (answer?.type === "noul" && answer.noul >= threshold) scored.push({ id: tag.id, value: answer.noul })
    }
    return scored
        .sort((a, b) => b.value - a.value)
        .slice(0, maxTags)
        .map((item) => item.id)
}
