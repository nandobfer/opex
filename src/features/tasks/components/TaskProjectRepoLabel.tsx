"use client"

import { useProjectColor } from "@/features/agentic/components/CentralColorsProvider"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import type { TaskDto } from "../types"

/**
 * Repositório da tarefa (`GithubRepoLabel`: avatar + `org/repo`) com o nome na cor da central do
 * projeto; sem central ou sem cor, o nome fica como o padrão do rótulo.
 */
export function TaskProjectRepoLabel({ project }: { project: NonNullable<TaskDto["project"]> }) {
    const repoIndex = useRepoIndex()
    const color = useProjectColor(project.id)
    return <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} nameStyle={color ? { color } : undefined} />
}
