"use client"

import { BookOpen, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { AiSkillDto } from "@/lib/ai/providers"
import { useAiSkills, useRefreshAiSkills } from "../hooks/useAi"

/** Linha de uma skill na busca: nome, id e descrição. */
function SkillOption({ skill }: { skill: AiSkillDto }) {
    return (
        <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
                <span className="truncate font-medium">{skill.name}</span>
                {skill.empty && <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">vazia</span>}
            </span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">{skill.id}</span>
            {skill.description && <span className="line-clamp-2 block text-xs text-muted-foreground">{skill.description}</span>}
        </span>
    )
}

interface OpencodeSkillSelectProps {
    id: string
    value: string | null
    onChange: (skillId: string) => void
    /** Erro de validação do campo. */
    error?: string
    /** Ação do estado vazio / indisponível (ex.: voltar para instruções de texto). */
    fallbackAction?: { label: string; onClick: () => void }
}

/**
 * Seletor de uma skill instalada no servidor OpenCode (lista vinda do próprio OpenCode, nunca fixa no
 * código). Skills vazias não podem ser escolhidas; a skill salva fora da lista aparece como "não
 * encontrada". Trata carregamento, erro (com tentar novamente) e lista vazia.
 */
export function OpencodeSkillSelect({ id, value, onChange, error, fallbackAction }: OpencodeSkillSelectProps) {
    const skills = useAiSkills(true)
    const refresh = useRefreshAiSkills()

    if (skills.isLoading) return <Skeleton className="h-9 w-full" />
    if (skills.isError)
        return (
            <div className="space-y-2">
                <ErrorState title="Não foi possível listar as skills do OpenCode" description={apiErrorMessage(skills.error, "Confira a conexão com o OpenCode.")} onRetry={() => void skills.refetch()} />
                {fallbackAction && (
                    <div className="flex justify-center">
                        <Button type="button" size="sm" variant="ghost" onClick={fallbackAction.onClick}>
                            {fallbackAction.label}
                        </Button>
                    </div>
                )}
            </div>
        )

    const list = skills.data ?? []
    if (list.length === 0)
        return (
            <EmptyState
                icon={BookOpen}
                title="Nenhuma skill instalada no OpenCode"
                description="Instale uma skill no servidor do OpenCode e atualize a lista, ou use instruções de texto."
                actionLabel={fallbackAction?.label}
                onAction={fallbackAction?.onClick}
            >
                <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => void refresh()}>
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Atualizar lista
                </Button>
            </EmptyState>
        )

    const selected = list.find((skill) => skill.id === value)
    const display = selected ? selected.name : value ? `${value} (não encontrada)` : undefined
    return (
        <Field id={id} label="Skill" error={error}>
            <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                <SearchPicker<AiSkillDto>
                    trigger={<FieldTrigger id={id} placeholder="Escolha a skill" invalid={Boolean(error)} value={display} />}
                    items={list}
                    getKey={(skill) => skill.id}
                    searchKeys={["name", "id", "description"]}
                    renderItem={(skill) => <SkillOption skill={skill} />}
                    disabledReason={(skill) => (skill.empty ? "Skill vazia" : false)}
                    onPick={(skill) => onChange(skill.id)}
                    matchTriggerWidth
                    placeholder="Buscar skill"
                    searchLabel="Buscar skill"
                    listLabel="Skills"
                    emptyText="Nenhuma skill disponível"
                    emptySearchText="Nenhuma skill encontrada"
                />
                </div>
                <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label="Atualizar lista de skills" title="Atualizar lista de skills" onClick={() => void refresh()}>
                    <RefreshCw className="h-4 w-4" aria-hidden />
                </Button>
            </div>
            {selected?.description && <p className="text-xs text-muted-foreground">{selected.description}</p>}
        </Field>
    )
}
