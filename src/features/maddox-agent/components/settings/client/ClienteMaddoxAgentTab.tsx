"use client"

import { useEffect, useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Info, Loader2, Save, TriangleAlert, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FormFooter } from "@/components/ui/form-footer"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { ClienteOpexToolsCard } from "@/features/opex-agent/components/settings/client/ClienteOpexToolsCard"
import { apiErrorMessage } from "@/lib/api"
import { MADDOX_CLIENT_TOOL_NAMES, buildMaddoxClientToolTree } from "../../../catalog"
import { clientMaddoxAgentConfigSchema, type ClientMaddoxAgentConfigInput } from "../../../schemas"
import { useClientMaddoxAgentConfig, useSaveClientMaddoxAgentConfig } from "../../../hooks/useClientMaddoxAgentConfig"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

const TOOLS_DESCRIPTION =
    "Ferramentas do Opex que o Maddox recebe no portal deste cliente (catálogo do portal, sem jobs). Toda chamada é conferida de novo no servidor: cliente, vínculo e papel do usuário. As destrutivas pedem Confirmar/Cancelar no chat."

/**
 * Aba "Agente Maddox" do detalhe do cliente (dono): liga o Maddox no portal (**desligado por padrão**)
 * e escolhe as ferramentas do portal que ele recebe. Salvar é auditado e atualiza o portal em tempo real.
 */
export function ClienteMaddoxAgentTab({ clientId }: { clientId: string }) {
    const query = useClientMaddoxAgentConfig(clientId)
    const save = useSaveClientMaddoxAgentConfig(clientId)
    const tree = useMemo(() => buildMaddoxClientToolTree(), [])
    const form = useForm<ClientMaddoxAgentConfigInput>({ resolver: zodResolver(clientMaddoxAgentConfigSchema), mode: "onChange", defaultValues: { enabled: false, enabledTools: [...MADDOX_CLIENT_TOOL_NAMES] } })
    const dirty = form.formState.isDirty
    const enabled = useWatch({ control: form.control, name: "enabled" })
    const enabledTools = useWatch({ control: form.control, name: "enabledTools" }) ?? []

    useEffect(() => {
        if (query.data) form.reset({ enabled: query.data.enabled, enabledTools: query.data.enabledTools })
    }, [query.data, form])

    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (query.isError || !query.data) {
        return <ErrorState title="Não foi possível carregar a configuração" description={apiErrorMessage(query.error, "Volte e tente novamente.")} onRetry={() => void query.refetch()} />
    }

    const submit = form.handleSubmit(async (values) => {
        const saved = await save.mutateAsync(values).catch(() => null)
        if (saved) form.reset({ enabled: saved.enabled, enabledTools: saved.enabledTools })
    })

    return (
        <form onSubmit={submit} className="space-y-4">
            <Card>
                <CardContent className="space-y-3 pt-6">
                    <ToggleCard
                        id="maddox-client-enabled"
                        checked={enabled}
                        onCheckedChange={(value) => form.setValue("enabled", value, { shouldDirty: true })}
                        label="Agente Maddox no portal"
                        description="Agente de chat que roda no OpenCode, no mesmo item do Agente Opex no menu do cliente. Desligado, ele não aparece e as rotas do agente recusam o acesso."
                        onLabel="Ativado"
                        offLabel="Desativado"
                    />
                    <AnimatePresence initial={false}>
                        {enabled ? (
                            <motion.p key="native" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-warning">
                                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Os usuários deste cliente também usam as ferramentas do próprio OpenCode na sua máquina (terminal, arquivos, skills e MCPs), seguindo as permissões do OpenCode.
                            </motion.p>
                        ) : (
                            <motion.p key="disabled" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Com o Maddox desligado, nenhum usuário deste cliente vê nem usa o agente. A seleção de ferramentas fica guardada.
                            </motion.p>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>

            <fieldset disabled={!enabled} className="min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
                <ClienteOpexToolsCard tree={tree} description={TOOLS_DESCRIPTION} value={enabledTools} onChange={(next) => form.setValue("enabledTools", next, { shouldDirty: true })} />
            </fieldset>

            <FormFooter>
                <Button type="button" variant="ghost" className="gap-1.5" disabled={!dirty || save.isPending} onClick={() => form.reset()}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Descartar
                </Button>
                <Button type="submit" className="gap-1.5" disabled={!dirty || save.isPending}>
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    Salvar
                </Button>
            </FormFooter>
        </form>
    )
}
