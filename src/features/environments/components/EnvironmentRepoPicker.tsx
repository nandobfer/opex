"use client"

import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { GithubRepoLabel } from "@/features/github/components/shared"
import type { EnvironmentProjectDto } from "../types"

/**
 * Seletor do repositório do módulo Ambientes: o **mesmo** padrão da coluna "Tarefas" da Central de
 * desenvolvimento (`SearchPicker` + `FieldTrigger` + `GithubRepoLabel`, com avatar, `owner/repo` e
 * cadeado). No portal, o índice do GitHub pode estar vazio — cai na inicial, sem dados do dono.
 */
export function EnvironmentRepoPicker({
    projects,
    active,
    onSelect,
    loading,
}: {
    projects: readonly EnvironmentProjectDto[]
    active: EnvironmentProjectDto | null
    onSelect: (projectId: string) => void
    loading?: boolean
}) {
    const index = useRepoIndex()
    return (
        <SearchPicker<EnvironmentProjectDto>
            trigger={
                <FieldTrigger
                    id="ambientes-repo"
                    placeholder="Escolha o repositório"
                    value={active ? <GithubRepoLabel repo={repoLabelOption(active.repo, index)} /> : undefined}
                />
            }
            items={projects}
            getKey={(project) => project.id}
            searchKeys={["name", "repo"]}
            renderItem={(project) => <GithubRepoLabel repo={repoLabelOption(project.repo, index)} />}
            onPick={(project) => onSelect(project.id)}
            loading={loading}
            matchTriggerWidth
            searchLabel="Buscar repositório"
            listLabel="Repositórios"
            emptyText="Nenhum repositório disponível"
            emptySearchText="Nenhum repositório encontrado"
            align="start"
        />
    )
}
