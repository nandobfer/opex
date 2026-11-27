"use client"

import { useEffect, useRef, useState } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, ChevronDown, FileSearch, Plus, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OptionTabs } from "@/components/ui/option-tabs"
import { SearchPicker } from "@/components/ui/search-picker"
import { cn } from "@/lib/utils"
import { useComposeRead } from "../hooks/useFormComposeRead"
import { runningServiceNames } from "../limits-form"
import { EMPTY_COMPOSE_OVERRIDES, SERVICE_FIELDS, type ComposeOverrides, type EnvironmentInput, type ServiceField } from "../schemas"
import { composeOverridesShortText } from "../service-overrides"
import { addOverrideService, orphanOverrideServices, removeOverrideService, setOverrideField } from "../services-form"
import type { EnvironmentDto } from "../types"
import { ComposeOverridesYamlField } from "./services/ComposeOverridesYamlField"
import { ServiceOverrideItem } from "./services/ServiceOverrideItem"
import { ServicesSkeleton } from "./services/ServicesSkeleton"

type Tab = "guided" | "yaml"
const TAB_OPTIONS = [
    { value: "guided", label: "Guiado", title: "Campos por serviço" },
    { value: "yaml", label: "YAML avançado" },
] as const

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

/**
 * Serviços do compose (OPE-211): ajustes por serviço (imagem, command, environment, portas, volumes...) e o
 * YAML avançado, gravados no override do próximo deploy. Em Editar, o compose é lido uma vez ao abrir para
 * mostrar os valores "Do compose".
 */
export function EnvironmentServicesField({ form, env }: { form: UseFormReturn<EnvironmentInput>; env: EnvironmentDto | null }) {
    const overrides = (useWatch({
        control: form.control,
        name: "composeOverrides",
    }) ?? EMPTY_COMPOSE_OVERRIDES) as ComposeOverrides
    const envVars = useWatch({ control: form.control, name: "env" }) ?? []
    const ports = useWatch({ control: form.control, name: "ports" }) ?? []
    const runOn = useWatch({ control: form.control, name: "runOn" }) ?? "server"
    const read = useComposeRead()
    const [tab, setTab] = useState<Tab>("guided")
    // Recolhido até o dono abrir (aberto quando já há ajustes salvos): só então o compose é lido.
    const [expanded, setExpanded] = useState(() => overrides.services.length > 0 || Boolean(overrides.yaml.trim()))
    const autoRead = useRef(false)
    useEffect(() => {
        if (!expanded || !env || autoRead.current || !read.canRead || read.result || read.isPending) return
        autoRead.current = true
        read.read({ explicit: false })
    }, [expanded, env, read])

    const errors = form.formState.errors.composeOverrides as { services?: unknown[]; yaml?: { message?: string }; message?: string } | undefined
    const setOverrides = (next: ComposeOverrides) =>
        form.setValue("composeOverrides", next, {
            shouldValidate: true,
            shouldDirty: true,
        })
    const known = read.names ?? (env ? runningServiceNames(env) : [])
    const addable = known.filter((name) => !overrides.services.some((item) => item.service === name))
    const orphans = orphanOverrideServices(overrides, read.names)
    const envKeys = envVars.map((item) => item.key)
    const summary = composeOverridesShortText(overrides)
    const fieldErrors = (index: number): Partial<Record<ServiceField, string>> => {
        const item = errors?.services?.[index] as Record<string, unknown> | undefined
        return Object.fromEntries(SERVICE_FIELDS.map((field) => [field, firstMessage(item?.[field])]).filter(([, message]) => message)) as Partial<Record<ServiceField, string>>
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" aria-expanded={expanded} aria-controls="environment-services-body" className="flex items-center gap-2 text-left" onClick={() => setExpanded((value) => !value)}>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden />
                    <span className="text-sm font-medium leading-none">Serviços do compose</span>
                    {!expanded && summary && <span className="text-xs text-muted-foreground">{summary}</span>}
                </button>
                {expanded && (
                    <Button type="button" variant="ghost" size="sm" className="gap-1" aria-label="Ler o compose dos serviços" disabled={read.isPending || !read.canRead} onClick={() => read.read({ explicit: true })}>
                        <FileSearch className="h-4 w-4" aria-hidden /> {read.isPending ? "Lendo…" : "Ler compose"}
                    </Button>
                )}
            </div>
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div id="environment-services-body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-3 overflow-hidden">
                        <OptionTabs<Tab> id="environment-services-tab" aria-label="Edição dos serviços" options={TAB_OPTIONS} value={tab} onChange={setTab} className="w-full" />
                        <p className="text-xs text-muted-foreground">Ajustes por cima do compose, aplicados no próximo deploy pelo override (Reiniciar e Levantar não aplicam). Campo sem &quot;Personalizar&quot; continua com o valor do compose.</p>
                        {read.isError && !read.isPending && read.canRead && (
                            <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
                                <span className="flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> A leitura do compose falhou: os valores &quot;Do compose&quot; não aparecem (os ajustes continuam valendo).
                                </span>
                                <Button type="button" variant="outline" size="sm" className="gap-1" aria-label="Tentar ler o compose dos serviços de novo" onClick={() => read.read({ explicit: true })}>
                                    <RotateCw className="h-4 w-4" aria-hidden /> Tentar novamente
                                </Button>
                            </div>
                        )}
                        {tab === "guided" && errors?.yaml?.message && <p className="text-xs text-destructive">YAML avançado com erro: {errors.yaml.message}</p>}
                        <AnimatePresence initial={false} mode="wait">
                            {tab === "guided" ? (
                                <motion.div key="guided" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-2">
                                    {read.isPending && !overrides.services.length ? (
                                        <ServicesSkeleton />
                                    ) : (
                                        <AnimatePresence initial={false}>
                                            {overrides.services.map((item, index) => (
                                                <motion.div key={item.service} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                                                    <ServiceOverrideItem
                                                        override={item}
                                                        compose={read.result ? (read.result.services.find((service) => service.name === item.service)?.values ?? null) : undefined}
                                                        orphan={orphans.includes(item.service)}
                                                        services={known}
                                                        envKeys={envKeys}
                                                        ports={ports}
                                                        runOn={runOn}
                                                        errors={fieldErrors(index)}
                                                        onFieldChange={(field, value) => setOverrides(setOverrideField(form.getValues("composeOverrides") ?? EMPTY_COMPOSE_OVERRIDES, item.service, field, value))}
                                                        onRemove={() => setOverrides(removeOverrideService(form.getValues("composeOverrides") ?? EMPTY_COMPOSE_OVERRIDES, item.service))}
                                                    />
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    )}
                                    {!overrides.services.length && !read.isPending && <p className="text-xs text-muted-foreground">Nenhum serviço ajustado: o compose vale como está.</p>}
                                    <SearchPicker
                                        trigger={
                                            <Button type="button" variant="outline" size="sm" className="gap-1" disabled={!addable.length}>
                                                <Plus className="h-4 w-4" aria-hidden /> Adicionar serviço
                                            </Button>
                                        }
                                        items={addable}
                                        getKey={(name) => name}
                                        renderItem={(name) => <span className="font-mono text-sm">{name}</span>}
                                        onPick={(name) => setOverrides(addOverrideService(form.getValues("composeOverrides") ?? EMPTY_COMPOSE_OVERRIDES, name))}
                                        filterItems={(items, term) => items.filter((name) => name.toLowerCase().includes(term.toLowerCase()))}
                                        disabled={!addable.length}
                                        searchLabel="Buscar serviço"
                                        listLabel="Serviços do compose"
                                        emptyText="Leia o compose para listar os serviços."
                                        emptySearchText="Nenhum serviço encontrado."
                                    />
                                    {!known.length && read.canRead && <p className="text-xs text-muted-foreground">Leia o compose para listar os serviços.</p>}
                                    {!read.canRead && <p className="text-xs text-muted-foreground">{env ? "Escolha a origem para ler o compose." : "Escolha a origem para ler o compose (no compose gerenciado, salve o ambiente primeiro)."}</p>}
                                </motion.div>
                            ) : (
                                <motion.div key="yaml" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                    <ComposeOverridesYamlField
                                        value={overrides.yaml}
                                        onChange={(yaml) =>
                                            setOverrides({
                                                ...(form.getValues("composeOverrides") ?? EMPTY_COMPOSE_OVERRIDES),
                                                yaml,
                                            })
                                        }
                                        error={errors?.yaml?.message}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {errors?.services && !Array.isArray(errors.services) && firstMessage(errors.services) && <p className="text-xs text-destructive">{firstMessage(errors.services)}</p>}
                    </motion.div>
                )}
            </AnimatePresence>
            {!expanded && errors && <p className="text-xs text-destructive">Há um erro nos serviços do compose: abra para corrigir.</p>}
        </div>
    )
}
