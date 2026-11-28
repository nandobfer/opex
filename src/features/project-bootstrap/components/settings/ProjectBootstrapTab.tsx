"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Bot, Cpu, History, Loader2, Save, Sparkles, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { AvailabilityNotice } from "@/components/feedback/AvailabilityNotice"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { IntegrationTabDef } from "@nandobfer/integracoes/react"
import { AgentSettingsTabs } from "@/features/ai/components/AgentSettingsTabs"
import { AgentCard, type AgentCardCopy } from "@/features/ai/components/agent-settings/AgentCard"
import { BOOTSTRAP_TIMEOUT_MAX, BOOTSTRAP_TIMEOUT_MIN } from "../../constants"
import { useProjectBootstrapSettings, useSaveProjectBootstrapSettings } from "../../hooks/useProjectBootstrap"
import type { ProjectBootstrapSection } from "../../links"
import { DEFAULT_PROJECT_BOOTSTRAP_SETTINGS, projectBootstrapSettingsSchema, type ProjectBootstrapSettings } from "../../schemas"
import { BootstrapHistoryCard } from "./BootstrapHistoryCard"
import { BootstrapSkillsCard } from "./BootstrapSkillsCard"
import { TechCatalogSection } from "./TechCatalogSection"

const SECTIONS: readonly IntegrationTabDef<ProjectBootstrapSection>[] = [
    { id: "configuracao", label: "Configuração", icon: Bot },
    { id: "skills", label: "Skills", icon: Sparkles },
    { id: "catalogo", label: "Catálogo de tecnologias", icon: Cpu },
    { id: "historico", label: "Histórico", icon: History },
]

const AGENT_COPY: AgentCardCopy = {
    id: "project-bootstrap",
    description: "Provedor fixo: OpenCode no host. A sessão abre no diretório do projeto novo e conversa com você até o ambiente estar pronto.",
    timeoutLabel: "Tempo máximo de cada turno (minutos)",
    timeoutMin: BOOTSTRAP_TIMEOUT_MIN,
    timeoutMax: BOOTSTRAP_TIMEOUT_MAX,
    placeholder: "Ex.: prefira PostgreSQL a MySQL; use pnpm nos projetos Node.",
    notice: "O agente cria o repositório (gh), escreve AGENTS.md, README, aicontext/, o código mínimo, Dockerfile, docker-compose.yml e .env, anota a porta em /home/used_ports e faz o push. O Opex confere tudo no host antes da amarração e do deploy.",
}

/**
 * Aba "Agente de Bootstrap" de `/integracoes/ia` (OPE-215): configuração do agente (OpenCode no host),
 * as skills do host que ele usa, o catálogo de tecnologias e o histórico. O formulário fica acima das
 * seções (trocar de seção não descarta o rascunho); catálogo e histórico salvam e leem na hora.
 */
export function ProjectBootstrapTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const query = useProjectBootstrapSettings()
    const save = useSaveProjectBootstrapSettings()
    const form = useForm<ProjectBootstrapSettings>({ resolver: zodResolver(projectBootstrapSettingsSchema), mode: "onChange", defaultValues: DEFAULT_PROJECT_BOOTSTRAP_SETTINGS })
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

    const submit = form.handleSubmit(
        async (values) => {
            const saved = await save.mutateAsync(values).catch(() => null)
            if (saved) form.reset(saved.settings)
        },
        () => toast.error("Corrija os campos destacados antes de salvar"),
    )
    const actions = (
        <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
            <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => form.reset(query.data.settings)}>
                <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
            </Button>
            <Button type="button" data-ctrl-enter-submit className="gap-1.5" disabled={(!dirty && !query.data.isDefault) || save.isPending} onClick={() => void submit()}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Salvar
            </Button>
        </div>
    )

    return (
        <AgentSettingsTabs<ProjectBootstrapSection> tabs={SECTIONS} fallback="configuracao" label="Seções do Agente de Bootstrap">
            {(section) => (
                <div className="space-y-6">
                    {section === "configuracao" && (
                        <>
                            <Card>
                                <CardContent className="space-y-3 pt-6">
                                    <FormToggleCard<ProjectBootstrapSettings>
                                        control={form.control}
                                        name="enabled"
                                        id="project-bootstrap-enabled"
                                        label="Agente de Bootstrap"
                                        description="Digitar um nome novo em Nova central cria o repositório e provisiona o ambiente do zero, num assistente guiado com este agente."
                                    />
                                    <AvailabilityNotice reason={!dirty && !query.data.availability.available ? query.data.availability.reason : null} />
                                </CardContent>
                            </Card>
                            <AgentCard form={form} copy={AGENT_COPY} />
                            {actions}
                        </>
                    )}
                    {section === "skills" && (
                        <>
                            <BootstrapSkillsCard form={form} />
                            {actions}
                        </>
                    )}
                    {section === "catalogo" && <TechCatalogSection />}
                    {section === "historico" && <BootstrapHistoryCard />}
                </div>
            )}
        </AgentSettingsTabs>
    )
}
