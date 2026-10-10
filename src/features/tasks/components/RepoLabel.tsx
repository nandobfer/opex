"use client"

import { GithubAvatar } from "@/features/github/components/shared"
import type { ProjectRef } from "../types"

/**
 * Apresentação de um repositório vinculado (o Projeto): avatar + `owner/repo` + nome. Compartilhada
 * pelo formulário de tarefa e pelo filtro de Repositório da lista de Tarefas.
 */
export function RepoLabel({ project }: { project: ProjectRef }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <GithubAvatar login={project.repo} />
            <span className="min-w-0 truncate">
                <span className="font-medium">{project.repo}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{project.name}</span>
            </span>
        </span>
    )
}
