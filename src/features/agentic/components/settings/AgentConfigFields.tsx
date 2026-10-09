"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { FORM_GRID } from "@/components/ui/form-grid"
import { OptionTabs } from "@/components/ui/option-tabs"
import { SearchPicker } from "@/components/ui/search-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiErrorMessage } from "@/lib/api"
import type { AiAgentDto, AiModelDto } from "@/lib/ai/providers"
import type { AgentConfig } from "../../schemas"

const DEFAULT_OPTION = "__default__"
const EMPTY: AgentConfig = { agent: null, model: null, variant: null }

interface AgentConfigFieldsProps {
    id: string
    value: AgentConfig | null
    onChange: (next: AgentConfig | null) => void
    agents: { data?: AiAgentDto[]; isError: boolean; error: unknown }
    models: { data?: AiModelDto[]; isError: boolean; isLoading: boolean; error: unknown }
    /** Override da central: `null` herda o padrão (`inherited`, mostrado como resumo). */
    inherited?: AgentConfig
    error?: string
}

export function describeAgentConfig(config: AgentConfig, models?: AiModelDto[]): string {
    const model = config.model ? (models?.find((item) => item.id === config.model)?.name ?? config.model) : "modelo padrão do agente"
    return `${config.agent ?? "agente padrão"} · ${model}${config.variant ? ` (${config.variant})` : ""}`
}

/** Agente, modelo e variante do OpenCode para uma etapa (com opção de herdar o padrão). */
export function AgentConfigFields({ id, value, onChange, agents, models, inherited, error }: AgentConfigFieldsProps) {
    const inheriting = inherited !== undefined && value === null
    const current = value ?? EMPTY
    const model = models.data?.find((item) => item.id === current.model)
    const set = (patch: Partial<AgentConfig>) => onChange({ ...current, ...patch })

    return (
        <div className="space-y-3">
            {inherited !== undefined && (
                <OptionTabs<"inherit" | "custom">
                    id={`${id}-mode`}
                    options={[
                        { value: "inherit", label: "Padrão da aba" },
                        { value: "custom", label: "Personalizar" },
                    ]}
                    value={inheriting ? "inherit" : "custom"}
                    onChange={(mode) => onChange(mode === "inherit" ? null : { ...inherited })}
                    className="w-full"
                />
            )}
            <AnimatePresence mode="wait" initial={false}>
                {inheriting ? (
                    <motion.p key="inherit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="text-sm text-muted-foreground">
                        {describeAgentConfig(inherited!, models.data)}
                    </motion.p>
                ) : (
                    <motion.div key="custom" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className={FORM_GRID}>
                        <Field id={`${id}-agent`} label="Agente" error={error ?? (agents.isError ? apiErrorMessage(agents.error, "Não foi possível listar os agentes") : undefined)}>
                            <Select value={current.agent ?? DEFAULT_OPTION} onValueChange={(next) => set({ agent: next === DEFAULT_OPTION ? null : next })}>
                                <SelectTrigger id={`${id}-agent`} className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={DEFAULT_OPTION}>Padrão do servidor</SelectItem>
                                    {current.agent && !agents.data?.some((agent) => agent.id === current.agent) && <SelectItem value={current.agent}>{current.agent}</SelectItem>}
                                    {(agents.data ?? []).map((agent) => (
                                        <SelectItem key={agent.id} value={agent.id}>
                                            {agent.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field id={`${id}-model`} label="Modelo" error={models.isError ? apiErrorMessage(models.error, "Não foi possível listar os modelos") : undefined}>
                            <SearchPicker<AiModelDto>
                                trigger={<FieldTrigger id={`${id}-model`} placeholder="Modelo padrão do agente" value={model ? model.name : current.model || undefined} />}
                                items={models.data ?? []}
                                getKey={(item) => item.id}
                                searchKeys={["name", "id", "group"]}
                                renderItem={(item) => (
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium">{item.name}</span>
                                        <span className="block truncate font-mono text-[11px] text-muted-foreground">{item.id}</span>
                                    </span>
                                )}
                                onPick={(item) => set({ model: item.id, variant: null })}
                                loading={models.isLoading}
                                matchTriggerWidth
                                placeholder="Buscar modelo"
                                searchLabel="Buscar modelo"
                                listLabel="Modelos"
                                emptyText="Nenhum modelo disponível"
                                emptySearchText="Nenhum modelo encontrado"
                                footer={
                                    current.model ? (
                                        <button type="button" className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => set({ model: null, variant: null })}>
                                            Usar o modelo padrão do agente
                                        </button>
                                    ) : undefined
                                }
                            />
                        </Field>
                        {model && model.variants.length > 0 && (
                            <Field id={`${id}-variant`} label="Variante (raciocínio)">
                                <Select value={current.variant ?? DEFAULT_OPTION} onValueChange={(next) => set({ variant: next === DEFAULT_OPTION ? null : next })}>
                                    <SelectTrigger id={`${id}-variant`} className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={DEFAULT_OPTION}>Padrão do modelo</SelectItem>
                                        {model.variants.map((variant) => (
                                            <SelectItem key={variant} value={variant}>
                                                {variant}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
