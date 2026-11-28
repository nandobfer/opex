"use client"

import { Building2, User } from "lucide-react"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import type { RepoOwnerDto } from "../../types"

function OwnerLabel({ owner }: { owner: RepoOwnerDto }) {
    const Icon = owner.kind === "user" ? User : Building2
    return (
        <span className="flex min-w-0 items-center gap-2">
            {owner.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatar externo do GitHub, sem otimização
                <img src={owner.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full" />
            ) : (
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="truncate font-mono">{owner.login}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{owner.kind === "user" ? "conta pessoal" : "organização"}</span>
        </span>
    )
}

interface RepoOwnerFieldProps {
    id: string
    owners: readonly RepoOwnerDto[]
    value: string
    onChange: (login: string) => void
    loading?: boolean
    error?: boolean
    disabled?: boolean
}

/** Dono do repositório: a conta pessoal do token do GitHub ou uma das organizações acessíveis. */
export function RepoOwnerField({ id, owners, value, onChange, loading, error, disabled }: RepoOwnerFieldProps) {
    const selected = owners.find((owner) => owner.login.toLowerCase() === value.toLowerCase())
    return (
        <SearchPicker<RepoOwnerDto>
            trigger={<FieldTrigger id={id} placeholder="Escolha a conta ou a organização" invalid={error} value={selected ? <OwnerLabel owner={selected} /> : value || undefined} disabled={disabled} />}
            items={owners}
            getKey={(owner) => owner.login}
            searchKeys={["login"]}
            renderItem={(owner) => <OwnerLabel owner={owner} />}
            onPick={(owner) => onChange(owner.login)}
            loading={loading}
            disabled={disabled}
            matchTriggerWidth
            searchLabel="Buscar conta ou organização"
            listLabel="Contas e organizações do token"
            emptyText="O token do GitHub não tem contas acessíveis"
            emptySearchText="Nenhuma conta encontrada"
        />
    )
}
