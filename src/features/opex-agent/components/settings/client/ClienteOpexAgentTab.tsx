"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Info, Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FormFooter } from "@/components/ui/form-footer"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { OPEX_CLIENT_TOOLS } from "../../../client-tools"
import { clientOpexAgentConfigSchema, type ClientOpexAgentConfigInput } from "../../../schemas"
import { useClientOpexAgentConfig, useSaveClientOpexAgentConfig } from "../../../hooks/useClientOpexAgentConfig"
import { ClienteOpexToolsCard } from "./ClienteOpexToolsCard"

const ALL_TOOLS = OPEX_CLIENT_TOOLS.map((tool) => tool.name)
const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * Aba "Agente Opex" do detalhe do cliente (dono): ativa/desativa o agente no portal e escolhe as
 * ferramentas. Sem configuração salva, o agente aparece **ativado** com todas as ferramentas.
 */
export function ClienteOpexAgentTab({ clientId }: { clientId: string }) {
    const query = useClientOpexAgentConfig(clientId)
    const save = useSaveClientOpexAgentConfig(clientId)
    const form = useForm<ClientOpexAgentConfigInput>({
        resolver: zodResolver(clientOpexAgentConfigSchema),
        mode: "onChange",
        defaultValues: { enabled: true, enabledTools: ALL_TOOLS },
    })
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
                        id="opex-client-enabled"
                        checked={enabled}
                        onCheckedChange={(value) => form.setValue("enabled", value, { shouldDirty: true })}
                        label="Agente Opex no portal"
                        description="Assistente por chat no rodapé do menu do cliente. Desligado, o item some e as rotas do agente respondem que ele está desativado."
                        onLabel="Ativado"
                        offLabel="Desativado"
                    />
                    <AnimatePresence initial={false}>
                        {!enabled && (
                            <motion.p key="disabled" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Com o agente desativado, nenhum usuário deste cliente vê nem executa o Agente Opex. A seleção de ferramentas fica guardada.
                            </motion.p>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>

            <fieldset disabled={!enabled} className="min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
                <ClienteOpexToolsCard value={enabledTools} onChange={(next) => form.setValue("enabledTools", next, { shouldDirty: true })} />
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
