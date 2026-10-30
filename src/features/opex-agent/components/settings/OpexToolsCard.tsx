"use client"

import { useMemo } from "react"
import { useWatch, type FieldPath, type FieldValues, type PathValue, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckTree } from "@/components/ui/check-tree/CheckTree"
import {
    buildOpexToolTree,
    defaultToolConfirms,
    disabledOpexToolNames,
    enabledOpexToolNames,
    nextConfirmationOverrides,
    toolConfirms,
    type OpexToolMetaDto,
} from "../../tool-tree"
import { ToolConfirmMeta } from "./ToolConfirmMeta"

interface ToolLeafMetaProps {
    meta: OpexToolMetaDto
    overrides: Readonly<Record<string, boolean>>
    onChange: (meta: OpexToolMetaDto, confirms: boolean) => void
}

/** Risco, "sempre ligada" e se pede confirmação, ao lado do nome de cada ferramenta (copiado do Ciliar). */
function ToolLeafMeta({ meta, overrides, onChange }: ToolLeafMetaProps) {
    const confirms = toolConfirms(meta, overrides)
    return (
        <ToolConfirmMeta
            id={`opex-confirm-${meta.name}`}
            name={meta.name}
            label={meta.label}
            risk={meta.risk}
            confirms={confirms}
            custom={confirms !== defaultToolConfirms(meta)}
            onChange={(value) => onChange(meta, value)}
            badges={meta.alwaysOn ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Sempre ligada</span> : null}
        />
    )
}

/**
 * Ferramentas liberadas ao agente, no mesmo formato das permissões dos perfis do Ciliar: um módulo por
 * grupo, caixa "todas" por grupo, busca e contador. A configuração guarda as **desligadas** (ferramenta
 * nova nasce ligada). Cada ferramenta tem o próprio "Pede confirmação" (padrão: só as destrutivas).
 */
/** Campos da seleção de ferramentas (Agente Opex e Agente Maddox têm os mesmos). */
export interface AgentToolFields extends FieldValues {
    disabledTools: string[]
    confirmationOverrides: Record<string, boolean>
}

const DEFAULT_DESCRIPTION =
    'O agente usa quantas ferramentas precisar, sem limite de chamadas. Desmarque as que ele não deve usar. Em cada ferramenta, "Pede confirmação" mostra Confirmar/Cancelar no chat antes de executar: vem ligado nas destrutivas (excluir, arquivar, parar, gravar integração, usuário/senha/token de cliente…) e desligado nas demais.'

export function OpexToolsCard<T extends AgentToolFields>({ form, tools, description = DEFAULT_DESCRIPTION }: { form: UseFormReturn<T>; tools: readonly OpexToolMetaDto[]; description?: string }) {
    const disabledName = "disabledTools" as FieldPath<T>
    const overridesName = "confirmationOverrides" as FieldPath<T>
    const disabledTools = useWatch({ control: form.control, name: disabledName }) as string[] | undefined
    const overrides = useWatch({ control: form.control, name: overridesName }) as Record<string, boolean> | undefined
    const setField = (name: FieldPath<T>, value: unknown) => form.setValue(name, value as PathValue<T, FieldPath<T>>, { shouldDirty: true, shouldValidate: true })
    const tree = useMemo(() => buildOpexToolTree(tools), [tools])
    const byName = useMemo(() => new Map(tools.map((tool) => [tool.name, tool])), [tools])
    const locked = useMemo(() => new Set(tools.filter((tool) => tool.alwaysOn).map((tool) => tool.name)), [tools])
    const selected = useMemo(() => new Set(enabledOpexToolNames(tools, disabledTools ?? [])), [tools, disabledTools])

    const renderLeafMeta = (key: string) => {
        const meta = byName.get(key)
        if (!meta) return null
        return (
            <ToolLeafMeta
                meta={meta}
                overrides={overrides ?? {}}
                onChange={(tool, confirms) => setField(overridesName, nextConfirmationOverrides(overrides ?? {}, tool, confirms))}
            />
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Ferramentas</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <CheckTree
                    tree={tree}
                    selected={selected}
                    lockedKeys={locked}
                    renderLeafMeta={renderLeafMeta}
                    searchPlaceholder="Buscar ferramenta..."
                    emptyText="Nenhuma ferramenta encontrada."
                    onChange={(next) => setField(disabledName, disabledOpexToolNames(tools, next))}
                />
            </CardContent>
        </Card>
    )
}
