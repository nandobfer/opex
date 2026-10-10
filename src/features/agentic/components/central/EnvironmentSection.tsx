"use client"

import { useWatch } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { PREVIEW_PORT_MAX, PREVIEW_PORT_MIN } from "../../constants"
import type { CentralForm } from "./form"

/** Aba Ambiente: docker compose da prévia, faixa de portas, variável da porta, endereço e teste de saúde. */
export function EnvironmentSection({ form }: { form: CentralForm }) {
    const errors = form.formState.errors.environment
    const env = useWatch({ control: form.control, name: "environment" })
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Prévia (Docker Compose)</CardTitle>
                <CardDescription>
                    Cada mesa recebe uma porta livre entre {env.previewPortMin || PREVIEW_PORT_MIN} e {env.previewPortMax || PREVIEW_PORT_MAX}. O agente roda{" "}
                    <code className="font-mono text-foreground">
                        {env.portEnvVar || "PORT"}={env.previewPortMin || PREVIEW_PORT_MIN} docker compose -p &lt;projeto&gt;{env.composeFile ? ` -f ${env.composeFile}` : ""} up -d --build
                    </code>{" "}
                    no worktree.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className={FORM_GRID_WIDE}>
                    <Field id="central-env-compose" label="Arquivo do compose" error={errors?.composeFile?.message}>
                        <Input id="central-env-compose" className="font-mono" placeholder="Vazio: o padrão do projeto" {...form.register("environment.composeFile")} />
                    </Field>
                    <Field id="central-env-port-var" label="Variável da porta" error={errors?.portEnvVar?.message}>
                        <Input id="central-env-port-var" className="font-mono" {...form.register("environment.portEnvVar")} aria-invalid={errors?.portEnvVar ? true : undefined} />
                    </Field>
                    <Field id="central-env-host" label="Endereço da prévia" error={errors?.previewHost?.message}>
                        <Input id="central-env-host" className="font-mono" placeholder="localhost ou 192.168.0.64" {...form.register("environment.previewHost")} aria-invalid={errors?.previewHost ? true : undefined} />
                    </Field>
                    <Field id="central-env-health" label="Caminho do teste de saúde" error={errors?.healthPath?.message}>
                        <Input id="central-env-health" className="font-mono" placeholder="/" {...form.register("environment.healthPath")} aria-invalid={errors?.healthPath ? true : undefined} />
                    </Field>
                    <Field id="central-env-timeout" label="Tempo máximo do build (minutos)" error={errors?.buildTimeoutMinutes?.message}>
                        <Input id="central-env-timeout" type="number" min={2} max={120} {...form.register("environment.buildTimeoutMinutes", { valueAsNumber: true })} aria-invalid={errors?.buildTimeoutMinutes ? true : undefined} />
                    </Field>
                    <Field id="central-env-port-min" label="Porta inicial da prévia" error={errors?.previewPortMin?.message}>
                        <Input id="central-env-port-min" type="number" min={1024} max={65535} {...form.register("environment.previewPortMin", { valueAsNumber: true })} aria-invalid={errors?.previewPortMin ? true : undefined} />
                    </Field>
                    <Field id="central-env-port-max" label="Porta final da prévia" error={errors?.previewPortMax?.message}>
                        <Input id="central-env-port-max" type="number" min={1024} max={65535} {...form.register("environment.previewPortMax", { valueAsNumber: true })} aria-invalid={errors?.previewPortMax ? true : undefined} />
                    </Field>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                    O botão &quot;Abrir em nova guia&quot; usa http://{env.previewHost || "localhost"}:&lt;porta&gt;. Abrindo o app de outra máquina, use o IP do servidor, não localhost.
                </p>
            </CardContent>
        </Card>
    )
}
