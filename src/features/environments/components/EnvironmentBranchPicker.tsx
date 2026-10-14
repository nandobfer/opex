"use client"

import { GitBranch, Lock } from "lucide-react"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { cn } from "@/lib/utils"
import { useEnvironmentBranches, type AmbientesApi } from "../hooks"

/** Valor especial do filtro do CI/CD: todas as branches. */
export const ALL_BRANCHES = "__all__"

function BranchLabel({ name, isProtected, unavailable }: { name: string; isProtected?: boolean; unavailable?: boolean }) {
    return (
        <span className="flex min-w-0 flex-1 items-center gap-2">
            <GitBranch className={cn("h-3.5 w-3.5 shrink-0", unavailable ? "text-muted-foreground" : "text-primary")} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
            {isProtected && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Protegida" />}
            {unavailable && <span className="shrink-0 text-[11px] text-destructive">indisponível</span>}
        </span>
    )
}

/**
 * Seletor de **branch real** do repositório (autocomplete com busca), compartilhado pela
 * configuração do ambiente e pelo filtro do CI/CD. A branch salva que deixou de existir continua
 * visível (marcada "indisponível"), sem substituição automática.
 */
export function EnvironmentBranchPicker({
    context,
    projectId,
    value,
    onChange,
    allowAll = false,
    placeholder = "Escolha a branch",
    id = "branch",
}: {
    context: AmbientesApi
    projectId: string
    value: string
    onChange: (branch: string) => void
    /** Inclui a opção "Todas as branches" (filtro do CI/CD). */
    allowAll?: boolean
    placeholder?: string
    id?: string
}) {
    const query = useEnvironmentBranches(context, projectId, Boolean(projectId))
    const branches = query.data ?? []
    const missing = Boolean(value) && value !== ALL_BRANCHES && !query.isLoading && !branches.some((branch) => branch.name === value)
    const items = allowAll ? [{ name: ALL_BRANCHES, sha: null, protected: false, __all: true }, ...branches] : branches
    const current = value === ALL_BRANCHES ? "Todas as branches" : value

    return (
        <SearchPicker<(typeof items)[number]>
            trigger={
                <FieldTrigger
                    id={id}
                    placeholder={placeholder}
                    value={current ? <BranchLabel name={current} unavailable={missing} /> : undefined}
                />
            }
            items={items}
            getKey={(branch) => branch.name}
            searchKeys={["name"]}
            renderItem={(branch) => (
                <BranchLabel
                    name={"__all" in branch && branch.__all ? "Todas as branches" : branch.name}
                    isProtected={branch.protected}
                />
            )}
            onPick={(branch) => onChange(branch.name)}
            loading={query.isLoading}
            disabled={!projectId}
            matchTriggerWidth
            searchLabel="Buscar branch"
            listLabel="Branches"
            emptyText={query.isError ? "Não foi possível listar as branches (confira o token do GitHub)" : "Nenhuma branch encontrada"}
            emptySearchText="Nenhuma branch encontrada"
            loadingText="Carregando branches…"
            align="start"
        />
    )
}
