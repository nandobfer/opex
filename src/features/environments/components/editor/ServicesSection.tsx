"use client"

import { useState } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, useReducedMotion } from "framer-motion"
import { AlertCircle, Boxes, RotateCw } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { FormSection } from "@/components/form-page/FormSection"
import { scrollToSection } from "@/components/form-page/FormSectionNav"
import { Button } from "@/components/ui/button"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { sectionAnchor } from "../../editor-sections"
import { SERVICES_GRID } from "../../environment-editor-layout"
import { useComposeRead } from "../../hooks/useFormComposeRead"
import { runningServiceNames } from "../../limits-form"
import { DEFAULT_ENVIRONMENT_LIMITS, EMPTY_COMPOSE_OVERRIDES, type ComposeOverrides, type EnvironmentInput, type EnvironmentLimits } from "../../schemas"
import { serviceListItems } from "../../services-form"
import type { EnvironmentDto, HostCapacityDto } from "../../types"
import { ComposeOverridesYamlField } from "../services/ComposeOverridesYamlField"
import { CollapsibleBlock } from "./CollapsibleBlock"
import { DeployPreview } from "./DeployPreview"
import { ServiceList, ServiceListSkeleton } from "./ServiceList"
import { ServicePanel } from "./ServicePanel"
import { SERVICE_PARAM_DEFAULTS, SERVICE_PARAM_SCHEMA } from "./service-param"

const YAML_BLOCK_ID = "ambiente-yaml-avancado"

/**
 * Serviços do compose (OPE-211): a lista dos serviços (lida sozinha) e o painel do escolhido, o YAML avançado
 * e "O que muda no deploy". Os ajustes valem no próximo deploy, pelo override.
 */
export function ServicesSection({ form, env, host, machine }: { form: UseFormReturn<EnvironmentInput>; env: EnvironmentDto | null; host: HostCapacityDto | null; machine: string }) {
    const reduced = useReducedMotion()
    const read = useComposeRead()
    const overrides = (useWatch({ control: form.control, name: "composeOverrides" }) ?? EMPTY_COMPOSE_OVERRIDES) as ComposeOverrides
    const limits = (useWatch({ control: form.control, name: "limits" }) ?? DEFAULT_ENVIRONMENT_LIMITS) as EnvironmentLimits
    const selectedServices = ((useWatch({ control: form.control, name: "source.services" }) as string[] | undefined) ?? []).filter(Boolean)
    const [{ servico }, setParams] = useUrlFilters(SERVICE_PARAM_DEFAULTS, SERVICE_PARAM_SCHEMA)
    const [yamlOpen, setYamlOpen] = useState(() => Boolean(overrides.yaml.trim()))
    const [previewOpen, setPreviewOpen] = useState(false)
    const yamlError = (form.formState.errors.composeOverrides as { yaml?: { message?: string } } | undefined)?.yaml?.message

    const items = serviceListItems({
        read: read.result?.services ?? null,
        overrides,
        limitServices: limits.mode === "service" ? limits.services.map((row) => row.service) : [],
        selected: selectedServices,
        running: env ? runningServiceNames(env) : [],
    })
    const selected = items.find((item) => item.name === servico) ?? items[0] ?? null
    const openYaml = () => {
        setYamlOpen(true)
        requestAnimationFrame(() => scrollToSection(YAML_BLOCK_ID, { smooth: !reduced }))
    }

    return (
        <FormSection
            id={sectionAnchor("servicos")}
            title="Serviços do compose"
            description="Ajustes por cima do compose de cada serviço (imagem, comando, portas, volumes...), aplicados no próximo deploy. Campo sem ajuste continua com o valor do compose."
            actions={
                read.canRead && !(env === null && form.getValues("source")?.kind === "managed") ? (
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={read.isPending} onClick={read.read}>
                        <RotateCw className={read.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden /> {read.isPending ? "Lendo o compose…" : "Ler de novo"}
                    </Button>
                ) : null
            }
        >
            {read.isError && !read.isPending && (
                <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> Não foi possível ler o compose da origem. Os ajustes salvos continuam valendo.
                    </span>
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={read.read}>
                        <RotateCw className="h-4 w-4" aria-hidden /> Tentar novamente
                    </Button>
                </div>
            )}
            {!items.length ? (
                read.isPending ? (
                    <ServiceListSkeleton />
                ) : (
                    <EmptyState
                        icon={Boxes}
                        title={read.canRead ? "Nenhum serviço no compose" : "Escolha a origem para ver os serviços"}
                        description={read.canRead ? "O compose lido não declara serviços." : "Com a origem completa, o compose é lido sozinho."}
                    />
                )
            ) : (
                <div className={SERVICES_GRID}>
                    <div className="min-w-0">{read.isPending && !read.result ? <ServiceListSkeleton /> : <ServiceList items={items} selected={selected?.name ?? null} onSelect={(name) => setParams({ servico: name })} />}</div>
                    <AnimatePresence mode="wait" initial={false}>
                        {selected && <ServicePanel key={selected.name} form={form} item={selected} read={read.result} env={env} host={host} machine={machine} services={read.names ?? items.map((item) => item.name)} onOpenYaml={openYaml} />}
                    </AnimatePresence>
                </div>
            )}
            <CollapsibleBlock id={YAML_BLOCK_ID} title="YAML avançado" description="Chaves que o bloco guiado não cobre, por serviço (ex.: stop_grace_period, extra_hosts)." open={yamlOpen} onOpenChange={setYamlOpen}>
                <ComposeOverridesYamlField
                    value={overrides.yaml}
                    onChange={(yaml) => form.setValue("composeOverrides", { ...((form.getValues("composeOverrides") ?? EMPTY_COMPOSE_OVERRIDES) as ComposeOverrides), yaml }, { shouldValidate: true, shouldDirty: true })}
                    error={yamlError}
                />
            </CollapsibleBlock>
            {yamlError && !yamlOpen && <p className="text-xs text-destructive">YAML avançado com erro: {yamlError}</p>}
            <CollapsibleBlock id="ambiente-previa-deploy" title="O que muda no deploy" description="O docker-compose.opex.yml que o próximo deploy vai gerar (valores do environment ocultos)." open={previewOpen} onOpenChange={setPreviewOpen}>
                <DeployPreview form={form} env={env} />
            </CollapsibleBlock>
        </FormSection>
    )
}
