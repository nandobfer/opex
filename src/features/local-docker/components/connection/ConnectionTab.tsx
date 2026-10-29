"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs, type OptionTabsOption } from "@/components/ui/option-tabs"
import { FormToggleCard } from "@/components/ui/toggle-card"
import type { LocalDockerMode, LocalDockerSettings } from "../../schemas"
import { NumberField } from "../NumberField"

export const CONNECTION_MODES: OptionTabsOption<LocalDockerMode>[] = [
    {
        value: "reverse",
        label: "Túnel de controle (VPN/NAT)",
        tooltip: "Use quando o servidor NÃO alcança o IP do PC — VPN, NAT do WSL 2 ou firewall da rede. O próprio PC abre e mantém um túnel SSH até o servidor (serviço autossh no WSL); o servidor entra no PC por uma porta dele mesmo. É o modo recomendado.",
    },
    {
        value: "direct",
        label: "Direto pelo IP",
        tooltip: "Use só quando o servidor alcança o IP do PC na rede (mesma LAN, sem VPN bloqueando a entrada). O servidor entra direto no SSH do WSL; no WSL 2 exige a rede espelhada (networkingMode=mirrored), que o script pode configurar.",
    },
]

const fieldMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Aba "Conexão com o PC": como o servidor chega ao PC. */
export function ConnectionTab({ form }: { form: UseFormReturn<LocalDockerSettings> }) {
    const errors = form.formState.errors
    const mode = useWatch({ control: form.control, name: "mode" })
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Conexão com o PC</CardTitle>
                    <CardDescription>O servidor entra no SSH do WSL com a chave dele. Passe o mouse sobre cada opção para ver quando usar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <FormToggleCard<LocalDockerSettings>
                        control={form.control}
                        name="useWhenOpen"
                        id="local-docker-use-when-open"
                        label="Usar o PC quando o túnel estiver aberto"
                        description="Vale para todas as centrais; cada central pode herdar, sempre usar ou nunca usar (aba Ambiente da central)"
                        onLabel="Sim"
                        offLabel="Não"
                    />
                    <Controller control={form.control} name="mode" render={({ field }) => <OptionTabs<LocalDockerMode> id="local-docker-mode" aria-label="Modo de conexão" options={CONNECTION_MODES} value={field.value} onChange={field.onChange} className="w-full" />} />
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div key={mode} {...fieldMotion} className={FORM_GRID}>
                            <Field id="local-docker-user" label="Usuário no WSL" error={errors.pcUser?.message}>
                                <Input id="local-docker-user" className="font-mono" placeholder="alfredopetri" {...form.register("pcUser")} />
                            </Field>
                            {mode === "reverse" ? (
                                <>
                                    <Field id="local-docker-server-host" label="Como o PC acessa o servidor" error={errors.serverSshHost?.message}>
                                        <Input id="local-docker-server-host" className="font-mono" placeholder="dev-server" {...form.register("serverSshHost")} />
                                    </Field>
                                    <Field id="local-docker-control-port" label="Porta do túnel de controle (no servidor)" error={errors.controlPort?.message}>
                                        <NumberField control={form.control} name="controlPort" id="local-docker-control-port" />
                                    </Field>
                                </>
                            ) : (
                                <>
                                    <Field id="local-docker-pc-host" label="IP do PC" error={errors.pcHost?.message}>
                                        <Input id="local-docker-pc-host" className="font-mono" placeholder="192.168.100.24" {...form.register("pcHost")} />
                                    </Field>
                                    <Field id="local-docker-pc-port" label="Porta SSH do PC" error={errors.pcSshPort?.message}>
                                        <NumberField control={form.control} name="pcSshPort" id="local-docker-pc-port" />
                                    </Field>
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>
                    <p className="text-xs text-muted-foreground">
                        {mode === "direct"
                            ? "No WSL 2 a conexão direta exige a rede espelhada (networkingMode=mirrored): o script de preparo pode configurá-la."
                            : "O script de preparo instala no WSL um serviço que publica o SSH do PC nessa porta do servidor (ssh -R). \"Como o PC acessa o servidor\" é o alias do ~/.ssh/config do WSL (ou usuário@host)."}
                    </p>
                </CardContent>
            </Card>
        </>
    )
}
