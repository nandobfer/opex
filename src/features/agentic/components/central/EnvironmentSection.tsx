"use client"

import { useWatch } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID_WIDE } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { AnimatePresence, motion } from "framer-motion"
import { PREVIEW_PORT_MAX, PREVIEW_PORT_MIN } from "../../constants"
import { DockerBuilderField } from "./DockerBuilderField"
import { LocalDockerCentralCard } from "@/features/local-docker/components/LocalDockerCentralCard"
import { useBuilderMachineActive } from "@/features/local-docker/hooks/useLocalDocker"
import type { CentralForm } from "./form"

/**
 * Aba Ambiente: o **fluxo padrão da mesa** (publicar a prévia ou abrir o PR direto — OPE-79) e a
 * prévia em si (docker compose, faixa de portas, variável da porta, endereço, teste de saúde e
 * backup do banco). Sem publicar a prévia, os ajustes ficam guardados e só o switch aparece. Com a
 * integração Builder Machine ativa e a prévia Local, o card da Builder Machine escolhe se a central usa o PC.
 */
export function EnvironmentSection({ form, centralId }: { form: CentralForm; centralId: string }) {
    const errors = form.formState.errors.environment
    const env = useWatch({ control: form.control, name: "environment" })
    const publishPreview = env.publishPreview !== false
    const builderMachine = useBuilderMachineActive() && env.previewMethod !== "github"
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Prévia (Docker Compose)</CardTitle>
                    <CardDescription>O fluxo padrão das mesas novas desta central e como a prévia é construída e publicada.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormToggleCard
                        control={form.control}
                        name="environment.publishPreview"
                        id="central-env-publish"
                        label="Publicar prévia"
                        description="Depois da implementação, a mesa sobe a prévia e espera a sua aprovação antes de abrir o Pull Request. Desligado, o agente pula a prévia e abre o PR direto (PR automático). A escolha feita na tarefa tem prioridade sobre este padrão."
                        onLabel="Publicar prévia"
                        offLabel="PR automático"
                    />
                    <AnimatePresence initial={false}>
                        {publishPreview ? (
                            <motion.div key="preview-fields" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                                <p className="mt-4 text-sm text-muted-foreground">
                                    Cada mesa recebe uma porta livre entre {env.previewPortMin || PREVIEW_PORT_MIN} e {env.previewPortMax || PREVIEW_PORT_MAX}. {env.previewMethod === "github" ? "O GitHub constrói a imagem e o agente publica sem build local." : "O agente constrói no worktree."}{" "}
                                    <code className="font-mono text-foreground">
                                        {env.previewMethod !== "github" && env.dockerBuilder ? `BUILDX_BUILDER=${env.dockerBuilder} ` : ""}
                                        {env.portEnvVar || "PORT"}={env.previewPortMin || PREVIEW_PORT_MIN} docker compose -p &lt;projeto&gt;{env.composeFile ? ` -f ${env.composeFile}` : ""} up -d {env.previewMethod === "github" ? "--no-build --pull never" : "--build"}
                                    </code>{" "}
                                    no worktree.
                                </p>
                                <div className={`mt-4 ${FORM_GRID_WIDE}`}>
                                    <Field id="central-preview-method" label="Construir prévia">
                                        <OptionTabs id="central-preview-method" aria-label="Método de construção da prévia" value={env.previewMethod ?? "local"} options={[{ value: "local", label: "Local" }, { value: "github", label: "GitHub Action" }]} onChange={(value) => form.setValue("environment.previewMethod", value, { shouldDirty: true, shouldValidate: true })} />
                                    </Field>
                                    <AnimatePresence initial={false}>
                                        {env.previewMethod === "github" && <motion.div className="col-span-full space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                                            <p className="text-sm text-muted-foreground">Testes e build no GitHub, sem fila local. A branch é publicada antes da aprovação, sem abrir PR. Instale o workflow e scripts com a skill setup-preview-workflow.</p>
                                            <Field id="central-preview-workflow" label="Workflow do GitHub" error={errors?.githubWorkflow?.message}><Input id="central-preview-workflow" {...form.register("environment.githubWorkflow")} /></Field>
                                            <Field id="central-preview-service" label="Serviço do Compose" error={errors?.previewService?.message}><Input id="central-preview-service" {...form.register("environment.previewService")} /></Field>
                                        </motion.div>}
                                    </AnimatePresence>
                                    <Field id="central-env-compose" label="Arquivo do compose" error={errors?.composeFile?.message}>
                                        <Input id="central-env-compose" className="font-mono" placeholder="Vazio: o padrão do projeto" {...form.register("environment.composeFile")} />
                                    </Field>
                                    {env.previewMethod !== "github" && <DockerBuilderField form={form} centralId={centralId} />}
                                    {env.previewMethod === "github" && <p className="col-span-full text-xs text-muted-foreground">O builder do host é usado somente na prévia Local. No GitHub Action, o builder é definido pelo workflow do runner.</p>}
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
                                <div className="mt-4">
                                    <FormToggleCard
                                        control={form.control}
                                        name="environment.backupDatabase"
                                        id="central-env-backup"
                                        label="Backup do Banco de Dados"
                                        description="Antes de publicar, o agente cria um dump (mongodump) do banco do projeto e a prévia só é aceita com ele; a mesa remove o backup na conclusão. Desligue em projetos sem banco de dados."
                                        onLabel="Ativado"
                                        offLabel="Desativado"
                                    />
                                </div>
                                <p className="mt-4 text-xs text-muted-foreground">
                                    O botão &quot;Abrir prévia&quot; usa http://{env.previewHost || "localhost"}:&lt;porta&gt;. Abrindo o app de outra máquina, use o IP do servidor, não localhost.
                                </p>
                            </motion.div>
                        ) : (
                            <motion.p key="preview-off" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-4 text-sm text-muted-foreground">
                                As mesas novas seguem em PR automático: a implementação termina e o agente abre o Pull Request direto, sem prévia. Os ajustes de compose, portas e backup continuam salvos e voltam a valer se você religar a prévia.
                            </motion.p>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>
            <AnimatePresence initial={false}>{builderMachine && <LocalDockerCentralCard key="builder-machine" centralId={centralId} />}</AnimatePresence>
        </>
    )
}
