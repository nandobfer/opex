"use client"

import { useMemo } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckTree } from "@/components/ui/check-tree/CheckTree"
import type { OpexAgentSettings } from "../../schemas"
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
export function OpexToolsCard({ form, tools }: { form: UseFormReturn<OpexAgentSettings>; tools: readonly OpexToolMetaDto[] }) {
    const disabledTools = useWatch({ control: form.control, name: "disabledTools" })
    const overrides = useWatch({ control: form.control, name: "confirmationOverrides" })
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
                onChange={(tool, confirms) => form.setValue("confirmationOverrides", nextConfirmationOverrides(overrides ?? {}, tool, confirms), { shouldDirty: true, shouldValidate: true })}
            />
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Ferramentas</CardTitle>
                <CardDescription>
                    O agente usa quantas ferramentas precisar, sem limite de chamadas. Desmarque as que ele não deve usar. Em cada ferramenta, &quot;Pede confirmação&quot; mostra Confirmar/Cancelar no chat antes de
                    executar: vem ligado nas destrutivas (excluir, arquivar, parar, gravar integração, usuário/senha/token de cliente…) e desligado nas demais.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <CheckTree
                    tree={tree}
                    selected={selected}
                    lockedKeys={locked}
                    renderLeafMeta={renderLeafMeta}
                    searchPlaceholder="Buscar ferramenta..."
                    emptyText="Nenhuma ferramenta encontrada."
                    onChange={(next) => form.setValue("disabledTools", disabledOpexToolNames(tools, next), { shouldDirty: true, shouldValidate: true })}
                />
            </CardContent>
        </Card>
    )
}
