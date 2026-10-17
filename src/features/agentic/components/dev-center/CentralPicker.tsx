"use client"

import { Layers } from "lucide-react"
import { RepoPicker } from "@/features/github/components/RepoPicker"
import { repoLabelOption } from "@/features/github/components/RepoIndexProvider"
import { GithubRepoLabel } from "@/features/github/components/shared"
import type { GithubRepoLabelData, GithubRepoOption } from "@/features/github/types"
import { ALL_CENTRALS_ID } from "../../dev-center-central"
import type { CentralDto } from "../../types"

/** Dados do repositório de uma central para o `GithubRepoLabel`; sem repositório, usa o nome do projeto (inicial). */
export function centralRepoLabel(central: Pick<CentralDto, "repo" | "projectName">, index: ReadonlyMap<string, GithubRepoOption>): GithubRepoLabelData {
    return central.repo ? repoLabelOption(central.repo, index) : { fullName: central.projectName, ownerAvatarUrl: null, description: null, private: false }
}

function AllCentralsLabel() {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate text-sm font-medium">{ALL_CENTRALS_LABEL}</span>
        </span>
    )
}

export const ALL_CENTRALS_LABEL = "Todos os projetos"
type PickerItem = CentralDto | { id: typeof ALL_CENTRALS_ID; projectName: string; repo: null; sigla: string }

interface CentralPickerProps {
    centrals: readonly CentralDto[]
    active: CentralDto | null
    index: ReadonlyMap<string, GithubRepoOption>
    onSelect: (id: string) => void
}

/**
 * Seletor da central (repositório) da Central de desenvolvimento: um `RepoPicker` com a lista das
 * centrais mostrada no item de repositório do GitHub (avatar + `owner/repo` + cadeado), com "Todos
 * os projetos" no topo.
 */
export function CentralPicker({ centrals, active, index, onSelect }: CentralPickerProps) {
    const items: PickerItem[] = [{ id: ALL_CENTRALS_ID, projectName: ALL_CENTRALS_LABEL, repo: null, sigla: "" }, ...centrals]
    return (
        <RepoPicker<PickerItem>
            id="dev-center-central"
            items={items}
            active={active ?? items[0]!}
            getKey={(central) => central.id}
            renderItem={(central) => (central.id === ALL_CENTRALS_ID ? <AllCentralsLabel /> : <GithubRepoLabel repo={centralRepoLabel(central, index)} />)}
            searchKeys={["projectName", "repo", "sigla"]}
            onPick={(central) => onSelect(central.id)}
            placeholder="Escolha a central"
            searchLabel="Buscar central"
            listLabel="Centrais de desenvolvimento"
            emptyText="Nenhuma central de desenvolvimento"
            emptySearchText="Nenhuma central encontrada"
        />
    )
}
