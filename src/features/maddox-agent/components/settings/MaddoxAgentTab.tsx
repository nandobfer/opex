"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Brain, Loader2, Save, Settings2, Undo2, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AgentSettingsTabs } from "@/features/ai/components/AgentSettingsTabs"
import type { IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { OpexToolsCard } from "@/features/opex-agent/components/settings/OpexToolsCard"
import { OpexMemoriesSection } from "@/features/opex-agent/components/settings/OpexMemoriesSection"
import { apiErrorMessage } from "@/lib/api"
import { MADDOX_AI_TAB } from "../../constants"
import { useMaddoxSettings, useSaveMaddoxSettings } from "../../hooks/useMaddoxSettings"
import { DEFAULT_MADDOX_AGENT_SETTINGS, maddoxAgentSettingsSchema, type MaddoxAgentSettings } from "../../schemas"
import { MaddoxGeneralSection } from "./MaddoxGeneralSection"

type MaddoxSection = "geral" | "ferramentas" | "memorias"
const SECTIONS: IntegrationTabDef<MaddoxSection>[] = [
    { id: "geral", label: "Geral", icon: Settings2 },
    { id: "ferramentas", label: "Ferramentas", icon: Wrench },
    { id: "memorias", label: "Memórias", icon: Brain },
]

const TOOLS_DESCRIPTION =
    'Ferramentas do Opex que o Maddox recebe pelo MCP do Opex (as do OpenCode seguem as permissões do OpenCode). Desmarque as que ele não deve usar: deixam de ser oferecidas no turno seguinte. "Pede confirmação" faz o OpenCode pedir Confirmar/Cancelar no chat antes de executar; vem ligado nas destrutivas. Os jobs agendados ficam de fora.'

/**
 * Aba "Agente Maddox" de `/integracoes/ia`, em seções: Geral (ativo, cor, modelo padrão, subagente de
 * título, instruções, arquivos e o MCP do Opex), Ferramentas (árvore própria das ferramentas do Opex,
 * independente do Agente Opex) e Memórias (globais, do dono e do cliente, que salvam sozinhas). Um
 * formulário só para Geral e Ferramentas: trocar de seção mantém o rascunho.
 */
export function MaddoxAgentTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useMaddoxSettings()
    const save = useSaveMaddoxSettings()
    const form = useForm<MaddoxAgentSettings>({ resolver: zodResolver(maddoxAgentSettingsSchema), mode: "onChange", defaultValues: DEFAULT_MADDOX_AGENT_SETTINGS })
    const dirty = form.formState.isDirty

    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    useEffect(() => {
        onDirtyChange(dirty)
        return () => onDirtyChange(false)
    }, [dirty, onDirtyChange])

    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />

    const data = query.data

    const footer = (go: (section: MaddoxSection) => void) => {
        const submit = form.handleSubmit(
            async (values) => {
                const saved = await save.mutateAsync(values).catch(() => null)
                if (saved) form.reset(saved.settings)
            },
            () => go("geral"),
        )
        return (
            <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
                <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => form.reset(data.settings)}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
                </Button>
                <Button type="button" data-ctrl-enter-submit className="gap-1.5" disabled={(!dirty && !data.isDefault && Boolean(data.settings.mcpBaseUrl)) || save.isPending} onClick={() => void submit()}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Salvar
                </Button>
            </div>
        )
    }

    return (
        <AgentSettingsTabs<MaddoxSection> tabs={SECTIONS} fallback="geral" label="Seções do Agente Maddox">
            {(section, go) => (
                <>
                    {section === "geral" && (
                        <>
                            <MaddoxGeneralSection form={form} availability={data.availability} dirty={dirty} />
                            {footer(go)}
                        </>
                    )}
                    {section === "ferramentas" && (
                        <>
                            <OpexToolsCard form={form} tools={data.tools} description={TOOLS_DESCRIPTION} />
                            {footer(go)}
                        </>
                    )}
                    {section === "memorias" && <OpexMemoriesSection tab={MADDOX_AI_TAB} />}
                </>
            )}
        </AgentSettingsTabs>
    )
}
