"use client"

import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { repoLabelOption } from "@/features/github/components/RepoIndexProvider"
import { GithubRepoLabel } from "@/features/github/components/shared"
import type { GithubRepoLabelData, GithubRepoOption } from "@/features/github/types"
import type { CentralDto } from "../../types"

/** Dados do repositório de uma central para o `GithubRepoLabel`; sem repositório, usa o nome do projeto (inicial). */
export function centralRepoLabel(central: CentralDto, index: ReadonlyMap<string, GithubRepoOption>): GithubRepoLabelData {
    return central.repo ? repoLabelOption(central.repo, index) : { fullName: central.projectName, ownerAvatarUrl: null, description: null, private: false }
}

interface CentralPickerProps {
    centrals: readonly CentralDto[]
    active: CentralDto
    index: ReadonlyMap<string, GithubRepoOption>
    onSelect: (id: string) => void
}

/**
 * Seletor da central (repositório) da Central de desenvolvimento: um `SearchPicker` com a lista das
 * centrais mostrada no item de repositório do GitHub (avatar + `owner/repo` + cadeado).
 */
export function CentralPicker({ centrals, active, index, onSelect }: CentralPickerProps) {
    return (
        <SearchPicker<CentralDto>
            trigger={<FieldTrigger id="dev-center-central" placeholder="Escolha a central" value={<GithubRepoLabel repo={centralRepoLabel(active, index)} />} />}
            items={centrals}
            getKey={(central) => central.id}
            searchKeys={["projectName", "repo", "sigla"]}
            renderItem={(central) => <GithubRepoLabel repo={centralRepoLabel(central, index)} />}
            onPick={(central) => onSelect(central.id)}
            matchTriggerWidth
            searchLabel="Buscar central"
            listLabel="Centrais de desenvolvimento"
            emptyText="Nenhuma central de desenvolvimento"
            emptySearchText="Nenhuma central encontrada"
            align="start"
        />
    )
}
