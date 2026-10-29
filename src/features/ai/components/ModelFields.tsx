"use client"

import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiErrorMessage } from "@/lib/api"
import type { AiModelDto } from "@/lib/ai/providers"

const DEFAULT_OPTION = "__default__"

/** Linha de um modelo na busca: nome, id e o selo "grátis". */
export function ModelOption({ model }: { model: AiModelDto }) {
    return (
        <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{model.name}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{model.id}</span>
            </span>
            {model.free && <span className="shrink-0 rounded bg-primary/15 px-1.5 text-[10px] font-medium text-primary">grátis</span>}
        </span>
    )
}

interface ModelQuery {
    data?: AiModelDto[]
    isLoading: boolean
    isError: boolean
    error: unknown
}

interface ModelPickerFieldProps {
    id: string
    models: ModelQuery
    modelId: string | null
    /** Erro de validação do campo (o erro ao listar os modelos é mostrado sem ele). */
    error?: string
    disabled?: boolean
    placeholder?: string
    onPick: (model: AiModelDto) => void
}

/**
 * Campo "Modelo" das features de IA: busca nos modelos do provedor (fuse.js do `SearchPicker`), com o
 * modelo salvo mostrado mesmo fora da lista. Compartilhado pelas abas de IA, pelo Agente Opex e pelo
 * Agente Mentor.
 */
export function ModelPickerField({ id, models, modelId, error, disabled, placeholder = "Escolha o modelo", onPick }: ModelPickerFieldProps) {
    const model = models.data?.find((item) => item.id === modelId)
    return (
        <Field id={id} label="Modelo" error={error ?? (models.isError ? apiErrorMessage(models.error, "Não foi possível listar os modelos") : undefined)}>
            <SearchPicker<AiModelDto>
                trigger={<FieldTrigger id={id} placeholder={placeholder} invalid={Boolean(error)} value={model ? model.name : modelId || undefined} disabled={disabled} />}
                items={models.data ?? []}
                getKey={(item) => item.id}
                searchKeys={["name", "id", "group"]}
                renderItem={(item) => <ModelOption model={item} />}
                onPick={onPick}
                loading={models.isLoading}
                disabled={disabled}
                matchTriggerWidth
                placeholder="Buscar modelo"
                searchLabel="Buscar modelo"
                listLabel="Modelos"
                emptyText={models.isError ? "Não foi possível listar os modelos" : "Nenhum modelo disponível"}
                emptySearchText="Nenhum modelo encontrado"
            />
        </Field>
    )
}

/** Campo da variante/raciocínio do modelo: "Padrão do modelo" (`null`) ou uma das variantes. */
export function VariantSelectField({ id, label, variants, value, onChange }: { id: string; label: string; variants: readonly string[]; value: string | null; onChange: (value: string | null) => void }) {
    return (
        <Field id={id} label={label}>
            <Select value={value ?? DEFAULT_OPTION} onValueChange={(next) => onChange(next === DEFAULT_OPTION ? null : next)}>
                <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={DEFAULT_OPTION}>Padrão do modelo</SelectItem>
                    {variants.map((variant) => (
                        <SelectItem key={variant} value={variant}>
                            {variant}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Field>
    )
}
