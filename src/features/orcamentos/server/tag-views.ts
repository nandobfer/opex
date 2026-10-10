import { loadTaskTagsSettings } from "@/features/ai/server/settings"
import { DEFAULT_TASK_TAXONOMY, type TaskTagDef } from "@/features/tasks/tags"
import type { DraftTagDto } from "../types"

/**
 * Resolve as tags de um rascunho (ids) para `{ id, label }` usando a taxonomia da feature "Tags de
 * tarefas". O portal é público e não acessa a configuração de IA, então os rótulos são resolvidos
 * no servidor. Um id fora da taxonomia cai no próprio id.
 */
export async function resolveTagViews(ids: string[]): Promise<DraftTagDto[]> {
    if (ids.length === 0) return []
    let taxonomy: TaskTagDef[] = DEFAULT_TASK_TAXONOMY
    try {
        const { settings } = await loadTaskTagsSettings()
        if (settings.taxonomy.length) taxonomy = settings.taxonomy
    } catch {
        taxonomy = DEFAULT_TASK_TAXONOMY
    }
    const labels = new Map(taxonomy.map((tag) => [tag.id, tag.label]))
    return ids.map((id) => ({ id, label: labels.get(id) ?? id }))
}
