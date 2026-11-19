"use client"

import { useMemo } from "react"
import { Controller, useWatch, type Control, type FieldErrors } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { Blocks } from "lucide-react"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { FORM_GRID } from "@/components/ui/form-grid"
import { OptionTabs } from "@/components/ui/option-tabs"
import { SearchPicker } from "@/components/ui/search-picker"
import { PLUGIN_SCOPE_LABELS, PLUGIN_SCOPES, type PluginScope } from "@/features/plugins/constants"
import { usePlugins } from "@/features/plugins/hooks/usePlugins"
import { useOrcamentoClients } from "@/features/orcamentos/hooks/useOrcamentos"
import type { TaskFormValues, TaskPluginTarget } from "../schemas"

/**
 * Alvo da tarefa do tipo Plugin (OPE-172): escopo (dono ou cliente), o cliente no escopo cliente e,
 * opcionalmente, o plugin existente a alterar (sem ele, a mesa cria um plugin novo).
 */

const SCOPE_OPTIONS = PLUGIN_SCOPES.map((scope) => ({
    value: scope,
    label: PLUGIN_SCOPE_LABELS[scope],
    tooltip: scope === "owner" ? "App do dono: código de servidor (rotas, crons, ferramentas) e interface" : "Portal de um cliente: só interface, com os dados que o cliente já acessa",
}))

const NEW_PLUGIN = { id: "", name: "Plugin novo" }

export function TaskPluginTargetFields({ control, errors }: { control: Control<TaskFormValues>; errors: FieldErrors<TaskFormValues> }) {
    const target = useWatch({ control, name: "pluginTarget" }) as TaskPluginTarget | null | undefined
    const scope: PluginScope = target?.scope ?? "owner"
    const clients = useOrcamentoClients({ enabled: scope === "client" })
    const plugins = usePlugins(scope === "client" ? (target?.clientId ? { scope, clientId: target.clientId } : { scope }) : { scope })
    const pluginItems = useMemo(() => [NEW_PLUGIN, ...(plugins.data ?? []).filter((plugin) => scope === "owner" || plugin.clientId === target?.clientId).map((plugin) => ({ id: plugin.id, name: plugin.name }))], [plugins.data, scope, target?.clientId])
    const client = clients.data?.find((item) => item.id === target?.clientId) ?? null
    const plugin = pluginItems.find((item) => item.id === (target?.pluginId ?? "")) ?? NEW_PLUGIN
    const targetErrors = errors.pluginTarget as (FieldErrors<TaskPluginTarget> & { message?: string }) | undefined

    return (
        <Controller
            control={control}
            name="pluginTarget"
            render={({ field }) => {
                const current: TaskPluginTarget = field.value ?? { scope: "owner", clientId: null, pluginId: null }
                return (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4" data-testid="task-plugin-target">
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Blocks className="h-3.5 w-3.5 text-primary" aria-hidden />A mesa gera e publica uma versão de plugin: prévia ao vivo, aprovação, testes e consolidação, sem PR, build nem deploy.
                        </p>
                        <Field id="task-plugin-scope" label="Escopo do plugin" error={targetErrors?.message}>
                            <OptionTabs id="task-plugin-scope" aria-label="Escopo do plugin" options={SCOPE_OPTIONS} value={current.scope} onChange={(value) => field.onChange({ scope: value, clientId: value === "client" ? (current.clientId ?? null) : null, pluginId: null })} className="w-full" />
                        </Field>
                        <div className={FORM_GRID}>
                            <AnimatePresence initial={false}>
                                {current.scope === "client" && (
                                    <motion.div key="client" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                        <Field id="task-plugin-client" label="Cliente" error={targetErrors?.clientId?.message}>
                                            <SearchPicker
                                                trigger={<FieldTrigger id="task-plugin-client" placeholder="Escolha o cliente" invalid={Boolean(targetErrors?.clientId)} value={client ? <span className="text-sm">{client.name}</span> : undefined} />}
                                                items={clients.data ?? []}
                                                getKey={(item) => item.id}
                                                searchKeys={["name"]}
                                                renderItem={(item) => <span className="text-sm">{item.name}</span>}
                                                onPick={(item) => field.onChange({ ...current, clientId: item.id, pluginId: null })}
                                                matchTriggerWidth
                                                searchLabel="Buscar cliente"
                                                listLabel="Clientes"
                                                emptyText="Nenhum cliente: cadastre em Integrações › Clientes"
                                                emptySearchText="Nenhum cliente encontrado"
                                            />
                                        </Field>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <Field id="task-plugin-existing" label="Plugin a alterar (opcional)">
                                <SearchPicker
                                    trigger={<FieldTrigger id="task-plugin-existing" placeholder="Plugin novo" value={<span className="text-sm">{plugin.name}</span>} />}
                                    items={pluginItems}
                                    getKey={(item) => item.id || "new"}
                                    searchKeys={["name", "id"]}
                                    renderItem={(item) => <span className={item.id ? "text-sm" : "text-sm text-muted-foreground"}>{item.name}</span>}
                                    onPick={(item) => field.onChange({ ...current, pluginId: item.id || null })}
                                    matchTriggerWidth
                                    searchLabel="Buscar plugin"
                                    listLabel="Plugins"
                                    emptyText="Nenhum plugin"
                                    emptySearchText="Nenhum plugin encontrado"
                                />
                            </Field>
                        </div>
                    </motion.div>
                )
            }}
        />
    )
}
