"use client"

import { Settings2 } from "lucide-react"
import Link from "next/link"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { repoLabelOption } from "@/features/github/components/RepoIndexProvider"
import { GithubAvatar, GithubRepoLabel } from "@/features/github/components/shared"
import type { GithubRepoLabelData, GithubRepoOption } from "@/features/github/types"
import { centralSettingsPath } from "../../constants"
import { centralSigla } from "../../dev-center-central"
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
    /** `field`: gatilho com cara de campo (coluna aberta). `rail`: botão estreito (faixa recolhida). */
    variant: "field" | "rail"
}

/**
 * Seletor da central (repositório) da Central de desenvolvimento: um `SearchPicker` com a lista das
 * centrais no item de repositório do GitHub (avatar + `owner/repo`). Na faixa recolhida, o gatilho
 * mostra só o avatar e a sigla do repositório.
 */
export function CentralPicker({ centrals, active, index, onSelect, variant }: CentralPickerProps) {
    const trigger =
        variant === "field" ? (
            <FieldTrigger id="dev-center-central" placeholder="Escolha a central" value={<GithubRepoLabel repo={centralRepoLabel(active, index)} />} />
        ) : (
            <RailTrigger central={active} index={index} />
        )
    return (
        <SearchPicker<CentralDto>
            trigger={trigger}
            items={centrals}
            getKey={(central) => central.id}
            searchKeys={["projectName", "repo", "sigla"]}
            renderItem={(central) => <GithubRepoLabel repo={centralRepoLabel(central, index)} />}
            onPick={(central) => onSelect(central.id)}
            matchTriggerWidth={variant === "field"}
            searchLabel="Buscar central"
            listLabel="Centrais de desenvolvimento"
            emptyText="Nenhuma central de desenvolvimento"
            emptySearchText="Nenhuma central encontrada"
            align="start"
        />
    )
}

/** Gatilho da faixa recolhida: avatar do repositório + sigla do projeto (dica com `owner/repo`). */
function RailTrigger({ central, index }: { central: CentralDto; index: ReadonlyMap<string, GithubRepoOption> }) {
    const repo = centralRepoLabel(central, index)
    return (
        <button
            type="button"
            title={repo.fullName}
            aria-label={`Central ${repo.fullName}`}
            className="flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        >
            <GithubAvatar login={repo.fullName} avatarUrl={repo.ownerAvatarUrl} className="h-5 w-5" />
            <span className="truncate font-mono text-xs font-semibold">{centralSigla(central)}</span>
        </button>
    )
}

/** Link para as configurações da central selecionada (cabeçalho da coluna de tarefas). */
export function CentralSettingsLink({ centralId }: { centralId: string }) {
    return (
        <Link href={centralSettingsPath(centralId)} className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground" aria-label="Configurar a central" title="Configurar a central">
            <Settings2 className="h-4 w-4" aria-hidden />
        </Link>
    )
}
