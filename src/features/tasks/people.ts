import type { PersonRef, TaskDto, TaskOptionsDto } from "./types"

/**
 * Pessoas para atribuir: desenvolvedores da plataforma + quem já é responsável em alguma tarefa
 * carregada. O usuário da sessão vem primeiro; o resto em ordem alfabética.
 */
export function buildPeople(options: Pick<TaskOptionsDto, "developers"> | undefined, tasks: readonly Pick<TaskDto, "assignee">[], currentUserId: string | null): PersonRef[] {
    const map = new Map<string, PersonRef>()
    for (const person of options?.developers ?? []) map.set(person.id, person)
    for (const task of tasks) if (task.assignee && !map.has(task.assignee.id)) map.set(task.assignee.id, task.assignee)
    return [...map.values()].sort((a, b) => (a.id === currentUserId ? -1 : b.id === currentUserId ? 1 : a.name.localeCompare(b.name, "pt-BR")))
}
