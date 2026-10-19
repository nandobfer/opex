"use client"

import type { ReactElement, ReactNode } from "react"
import { SearchPicker } from "@/components/ui/search-picker"
import type { AiModelDto } from "@/lib/ai/providers"

interface ModelSearchPickerProps {
    trigger: ReactElement
    models: { data?: AiModelDto[]; isLoading: boolean }
    onPick: (model: AiModelDto) => void
    footer?: ReactNode
    disabled?: boolean
    /** Lista na largura do gatilho (campos de formulário); gatilhos compactos usam a largura própria. */
    matchTriggerWidth?: boolean
    align?: "start" | "center" | "end"
}

/** Busca de modelos do OpenCode (configurações dos papéis e troca de modelo na mesa e no fork). */
export function ModelSearchPicker({ trigger, models, onPick, footer, disabled, matchTriggerWidth = false, align }: ModelSearchPickerProps) {
    return (
        <SearchPicker<AiModelDto>
            trigger={trigger}
            items={models.data ?? []}
            getKey={(item) => item.id}
            searchKeys={["name", "id", "group"]}
            renderItem={(item) => (
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{item.id}</span>
                </span>
            )}
            onPick={onPick}
            loading={models.isLoading}
            disabled={disabled}
            matchTriggerWidth={matchTriggerWidth}
            align={align}
            contentClassName={matchTriggerWidth ? undefined : "w-80"}
            placeholder="Buscar modelo"
            searchLabel="Buscar modelo"
            listLabel="Modelos"
            emptyText="Nenhum modelo disponível"
            emptySearchText="Nenhum modelo encontrado"
            footer={footer}
        />
    )
}
