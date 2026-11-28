"use client"

import { useState } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { motion } from "framer-motion"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { overrideYamlKeys } from "../../override-yaml"
import { EMPTY_COMPOSE_OVERRIDES, type ComposeOverrides, type EnvironmentInput, type ServiceField, type ServiceValues } from "../../schemas"
import { serviceOverrideText } from "../../service-overrides"
import { emptyOverride, initialFieldValue, removeOverrideService, SERVICE_FIELD_GROUPS, SERVICE_FIELD_LABELS, setOverrideField, shadowedEnvKeys, unforwardedPorts, type ServiceListItem } from "../../services-form"
import type { ComposeServicesDto, EnvironmentDto, HostCapacityDto } from "../../types"
import { ServiceFieldRow } from "./ServiceFieldRow"
import { ServiceLimitsGroup } from "./ServiceLimitsGroup"

/** Primeira mensagem de erro dentro de um objeto de erros do react-hook-form. */
function firstMessage(errors: unknown): string | undefined {
    if (!errors || typeof errors !== "object") return undefined
    const own = (errors as { message?: unknown }).message
    if (typeof own === "string" && own) return own
    for (const value of Object.values(errors as Record<string, unknown>)) {
        if (value && typeof value === "object" && !("nodeType" in value)) {
            const nested = firstMessage(value)
            if (nested) return nested
        }
    }
    return undefined
}

interface Props {
    form: UseFormReturn<EnvironmentInput>
    item: ServiceListItem
    read: ComposeServicesDto | null
    env: EnvironmentDto | null
    host: HostCapacityDto | null
    machine: string
    /** Serviços do compose (dependências). */
    services: string[]
    onOpenYaml: () => void
}

/**
 * Painel do serviço escolhido: os campos em grupos (Imagem e comando, Rede, Armazenamento, Saúde e ciclo,
 * Variáveis e labels, Recursos), cada um com o valor do compose ou o personalizado, e "Desfazer os ajustes".
 */
export function ServicePanel({ form, item, read, env, host, machine, services, onOpenYaml }: Props) {
    const overrides = (useWatch({ control: form.control, name: "composeOverrides" }) ?? EMPTY_COMPOSE_OVERRIDES) as ComposeOverrides
    const envVars = useWatch({ control: form.control, name: "env" }) ?? []
    const ports = useWatch({ control: form.control, name: "ports" }) ?? []
    const runOn = useWatch({ control: form.control, name: "runOn" }) ?? "server"
    const [confirmReset, setConfirmReset] = useState(false)
    const service = item.name
    const index = overrides.services.findIndex((entry) => entry.service === service)
    const override = overrides.services[index] ?? emptyOverride(service)
    const unreadable = read?.services.find((entry) => entry.name === service)?.unreadable
    const yamlKeys = overrideYamlKeys(overrides.yaml)[service] ?? []
    const errors = (form.formState.errors.composeOverrides as { services?: Record<string, unknown>[] } | undefined)?.services?.[index]
    const current = () => (form.getValues("composeOverrides") ?? EMPTY_COMPOSE_OVERRIDES) as ComposeOverrides
    const setOverrides = (next: ComposeOverrides) => form.setValue("composeOverrides", next, { shouldValidate: true, shouldDirty: true })
    const setField = <F extends ServiceField>(field: F, value: ServiceValues[F]) => setOverrides(setOverrideField(current(), service, field, value))
    const revert = <F extends ServiceField>(field: F) => {
        const previous = override[field]
        setField(field, null)
        toast(`${SERVICE_FIELD_LABELS[field]} de ${service} voltou ao do compose`, { action: { label: "Desfazer", onClick: () => setField(field, previous) } })
    }
    const warnings = (field: ServiceField): string[] => {
        const list: string[] = []
        if ((field === "ports" || field === "volumes") && unreadable?.[field].length) list.push(`Não foi possível ler este item do compose: ${unreadable[field].join(", ")}. Ao editar, ele sai do serviço: inclua-o à mão se precisar.`)
        if (field === "environment") {
            const shadowed = shadowedEnvKeys(
                override,
                envVars.map((entry) => entry.key),
            )
            if (shadowed.length) list.push(`O environment do serviço vence as Variáveis extras com o mesmo nome: ${shadowed.join(", ")}.`)
        }
        if (field === "ports") {
            const unforwarded = unforwardedPorts(override, ports, runOn)
            if (unforwarded.length) list.push(`Executando no PC, o repasse para o servidor só vale para as Portas do ambiente: inclua ${unforwarded.join(", ")} em Execução › Portas.`)
        }
        return list
    }
    const summary = serviceOverrideText(override)

    return (
        <motion.div key={service} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="min-w-0 space-y-4" aria-label={`Serviço ${service}`}>
            <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3">
                <div className="min-w-0 space-y-1">
                    <h3 className="font-mono text-base font-semibold">{service}</h3>
                    <p className="text-xs text-muted-foreground">
                        {item.orphan ? "Este serviço não está no compose lido: os ajustes dele são ignorados no deploy." : summary ? `Ajustes: ${summary}.` : "Sem ajustes: tudo vem do compose."}
                        {item.outside ? " Fora dos serviços escolhidos na Origem: não sobe no ambiente." : ""}
                    </p>
                </div>
                {item.customized > 0 && (
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmReset(true)}>
                        <Trash2 className="h-4 w-4" aria-hidden /> Desfazer os ajustes deste serviço
                    </Button>
                )}
            </div>
            {override.image !== null && <p className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">Com imagem própria o serviço não faz build nem passa pelo registry; a imagem é baixada (pull) a cada deploy.</p>}
            {SERVICE_FIELD_GROUPS.map((group) => (
                <section key={group.id} aria-labelledby={`servico-${group.id}`} className="rounded-lg border px-4">
                    <h4 id={`servico-${group.id}`} className="border-b py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.title}
                    </h4>
                    <div className="divide-y">
                        {group.fields.map((field) => (
                            <ServiceFieldRow
                                key={field}
                                service={service}
                                field={field}
                                value={override[field]}
                                compose={item.compose}
                                services={services}
                                error={firstMessage(errors?.[field])}
                                warnings={warnings(field)}
                                onEdit={() => setField(field, initialFieldValue(field, item.compose ?? null))}
                                onChange={(value) => setField(field, value)}
                                onRevert={() => revert(field)}
                            />
                        ))}
                    </div>
                </section>
            ))}
            <section id="servico-recursos" aria-labelledby="servico-recursos-titulo" className="rounded-lg border px-4">
                <h4 id="servico-recursos-titulo" className="border-b py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recursos
                </h4>
                <ServiceLimitsGroup form={form} service={service} env={env} read={read} host={host} machine={machine} />
            </section>
            {yamlKeys.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span>No YAML avançado:</span>
                    {yamlKeys.map((key) => (
                        <Badge key={key} variant="outline" className="font-mono">
                            {key}
                        </Badge>
                    ))}
                    <Button type="button" variant="link" size="sm" className="h-auto px-1 text-xs" onClick={onOpenYaml}>
                        Abrir o YAML avançado
                    </Button>
                </div>
            )}
            <ConfirmDialog
                open={confirmReset}
                onOpenChange={setConfirmReset}
                title={`Desfazer os ajustes de ${service}?`}
                description="Todos os campos voltam ao valor do compose. A mudança só vale depois de salvar."
                confirmLabel="Desfazer os ajustes"
                variant="destructive"
                onConfirm={() => {
                    setOverrides(removeOverrideService(current(), service))
                    setConfirmReset(false)
                }}
            />
        </motion.div>
    )
}
