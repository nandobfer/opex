"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { Container, Network } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import type { LocalDockerSettings } from "../../schemas"
import { NumberField } from "../NumberField"
import { AliasesCard } from "./AliasesCard"

/** Aba "Docker do PC": builder dedicado (com limites), rede e apelidos de rede. */
export function DockerTab({ form }: { form: UseFormReturn<LocalDockerSettings> }) {
    const errors = form.formState.errors
    const builderName = useWatch({ control: form.control, name: "builderName" })
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Container className="h-4 w-4" aria-hidden /> Builder dedicado
                    </CardTitle>
                    <CardDescription>
                        O build das prévias roda no BuildKit do builder <code className="text-xs">{builderName || "—"}</code> no PC. Mudar os limites recria o builder no próximo preparo (o cache é mantido).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className={FORM_GRID}>
                        <Field id="local-docker-context" label="Contexto do Docker (no servidor)" error={errors.contextName?.message}>
                            <Input id="local-docker-context" className="font-mono" {...form.register("contextName")} />
                        </Field>
                        <Field id="local-docker-builder" label="Nome do builder" error={errors.builderName?.message}>
                            <Input id="local-docker-builder" className="font-mono" {...form.register("builderName")} />
                        </Field>
                        <Field id="local-docker-builder-memory" label="Memória máxima do builder (GiB)" error={errors.builderMemoryGb?.message}>
                            <NumberField control={form.control} name="builderMemoryGb" id="local-docker-builder-memory" nullable step={0.5} placeholder="Sem limite" />
                            <p className="text-xs text-muted-foreground">Vazio = sem limite</p>
                        </Field>
                        <Field id="local-docker-builder-cpus" label="CPUs do builder" error={errors.builderCpus?.message}>
                            <NumberField control={form.control} name="builderCpus" id="local-docker-builder-cpus" nullable step={0.5} placeholder="Sem limite" />
                            <p className="text-xs text-muted-foreground">Vazio = sem limite; aceita fração (ex.: 2.5)</p>
                        </Field>
                        <Field id="local-docker-builder-cache" label="Teto do cache do builder (GB)" error={errors.builderCacheKeepGb?.message}>
                            <NumberField control={form.control} name="builderCacheKeepGb" id="local-docker-builder-cache" />
                            <p className="text-xs text-muted-foreground">A rotina de limpeza (Integrações › Crons) apaga o cache acima disso</p>
                        </Field>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Network className="h-4 w-4" aria-hidden /> Rede
                    </CardTitle>
                    <CardDescription>Rede externa que os compose das prévias usam e o endereço em que o PC alcança o servidor (destino dos apelidos).</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className={FORM_GRID}>
                        <Field id="local-docker-network" label="Rede externa dos compose" error={errors.network?.message}>
                            <Input id="local-docker-network" className="font-mono" {...form.register("network")} />
                        </Field>
                        <Field id="local-docker-server-address" label="Endereço do servidor visto pelo PC" error={errors.serverAddress?.message}>
                            <Input id="local-docker-server-address" className="font-mono" placeholder="192.168.0.64" {...form.register("serverAddress")} />
                        </Field>
                    </div>
                </CardContent>
            </Card>
            <AliasesCard form={form} />
        </>
    )
}
