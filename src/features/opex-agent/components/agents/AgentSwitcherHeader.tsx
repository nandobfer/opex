"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { History, Maximize2, MessageSquarePlus, Minimize2, Settings, X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { agentColorStyle } from "@/features/maddox-agent/colors"
import { ModelOverridePicker, type ModelChoiceInput } from "@/features/ai/components/model-picker/ModelOverridePicker"
import { useMaddoxModels } from "@/features/maddox-agent/hooks/useMaddoxModels"
import type { ChatAgentId } from "../../agents"
import { useOpexView } from "../../hooks/useOpexSettings"
import { OpexScopeProvider, useOpexScope } from "../OpexScopeProvider"
import { useAgentSwitch } from "./AgentSwitchProvider"

export interface SessionModelChoice {
    /** Modelo da sessão (ou da "Nova sessão"): `null` = padrão do agente. */
    override: { model: string; variant: string | null } | null
    onChange: (next: { model: string; variant: string | null } | null) => void
    disabled?: boolean
}

interface AgentSwitcherHeaderProps {
    listOpen: boolean
    onToggleList: () => void
    onNew: () => void
    maximized: boolean
    onToggleMaximize?: () => void
    onClose: () => void
    sessionModel: SessionModelChoice | null
}

/**
 * Cabeçalho do popover dos agentes: à esquerda o agente ativo (avatar, nome e modelo — no Maddox o
 * modelo é o seletor da sessão); ao lado, o **outro agente**, menor, apagado e em tons de cinza, que
 * acende com a cor dele no hover/foco e troca o agente do popover e do item da barra lateral ao clicar.
 * Depois, as ações: sessões, nova sessão, configuração (só no dono), maximizar e fechar.
 */
export function AgentSwitcherHeader({ listOpen, onToggleList, onNew, maximized, onToggleMaximize, onClose, sessionModel }: AgentSwitcherHeaderProps) {
    const scope = useOpexScope()
    const { other, scopes } = useAgentSwitch()
    const router = useRouter()
    const settingsHref = scope.settingsHref
    return (
        <header className="flex items-center gap-2.5 border-b bg-gradient-to-r from-primary/15 via-transparent to-transparent px-3 py-2.5">
            <ActiveAgent sessionModel={sessionModel} />
            {other && (
                <OpexScopeProvider value={scopes[other]}>
                    <OtherAgentButton id={other} />
                </OpexScopeProvider>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <HeaderButton label={listOpen ? "Fechar a lista de sessões" : "Todas as sessões"} onClick={onToggleList} active={listOpen}>
                    <History className="h-4 w-4" />
                </HeaderButton>
                <HeaderButton label="Nova sessão" onClick={onNew}>
                    <MessageSquarePlus className="h-4 w-4" />
                </HeaderButton>
                {settingsHref && (
                    <HeaderButton
                        label={`Configurar o ${scope.agent.label}`}
                        onClick={() => {
                            router.push(settingsHref)
                            onClose()
                        }}
                    >
                        <Settings className="h-4 w-4" />
                    </HeaderButton>
                )}
                {onToggleMaximize && (
                    <HeaderButton label={maximized ? "Restaurar tamanho" : "Maximizar"} onClick={onToggleMaximize}>
                        {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </HeaderButton>
                )}
                <HeaderButton label="Fechar" onClick={onClose}>
                    <X className="h-4 w-4" />
                </HeaderButton>
            </div>
        </header>
    )
}

/** Agente ativo: avatar na cor dele, nome e a linha do modelo (seletor da sessão no Maddox). */
function ActiveAgent({ sessionModel }: { sessionModel: SessionModelChoice | null }) {
    const { agent } = useOpexScope()
    const view = useOpexView()
    const Icon = agent.icon
    const modelLabel = view.data?.modelLabel ?? null
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div key={agent.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.18 }} className="flex min-w-0 shrink items-center gap-2.5" data-testid="agent-active">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_16px_-4px_hsl(var(--primary))]" aria-hidden>
                    <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-tight">{agent.label}</p>
                    {agent.modelPicker && sessionModel ? (
                        <SessionModelPicker choice={sessionModel} defaultModel={view.data?.defaultModel ?? null} />
                    ) : (
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.p key={modelLabel ?? "none"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="truncate text-[11px] text-muted-foreground">
                                {modelLabel ?? "Sem modelo configurado"}
                            </motion.p>
                        </AnimatePresence>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    )
}

/** Seletor de modelo da sessão (Maddox): troca só a sessão atual; sessões novas começam no padrão. */
function SessionModelPicker({ choice, defaultModel }: { choice: SessionModelChoice; defaultModel: { model: string; variant: string | null } | null }) {
    const models = useMaddoxModels()
    const current = choice.override ?? defaultModel
    const onChange = (input: ModelChoiceInput) => choice.onChange(input.model ? { model: input.model, variant: input.variant } : null)
    return (
        <ModelOverridePicker
            id="agent-session-model"
            label="Modelo desta sessão"
            className="mt-0.5 [&_button]:h-6 [&_button]:px-1.5 [&_button]:text-[11px] [&_button[aria-label^='Esforço']]:w-6"
            choice={{ model: current?.model ?? null, variant: current?.variant ?? null, overridden: Boolean(choice.override) }}
            models={models}
            disabled={choice.disabled}
            onChange={onChange}
        />
    )
}

/** O outro agente: menor, apagado e desligado; acende com a cor dele no hover/foco; clicar troca. */
function OtherAgentButton({ id }: { id: ChatAgentId }) {
    const { agent } = useOpexScope()
    const { setActive, colors, busy } = useAgentSwitch()
    const view = useOpexView()
    const reduceMotion = useReducedMotion() ?? false
    const Icon = agent.icon
    const modelLabel = view.data?.modelLabel ?? null
    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <motion.button
                        type="button"
                        onClick={() => setActive(id)}
                        aria-label={`Trocar para o ${agent.label}`}
                        data-testid="agent-switch-other"
                        data-agent={id}
                        style={agentColorStyle(colors[id])}
                        whileHover={reduceMotion ? undefined : { scale: 1.03 }}
                        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                        className={cn(
                            "group relative flex min-w-0 max-w-[45%] shrink items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-1.5 py-1 text-left opacity-50 grayscale transition-[opacity,filter,border-color,box-shadow] duration-200",
                            "hover:border-primary/60 hover:opacity-100 hover:shadow-[0_0_14px_-4px_hsl(var(--primary))] hover:grayscale-0",
                            "focus-visible:border-primary/60 focus-visible:opacity-100 focus-visible:grayscale-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
                        )}
                    >
                        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-focus-visible:bg-primary group-focus-visible:text-primary-foreground" aria-hidden>
                            <Icon className="h-3.5 w-3.5" />
                            {busy[id] && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-popover" data-testid="agent-switch-other-busy" />}
                        </span>
                        <span className="hidden min-w-0 sm:block">
                            <span className="block truncate text-[11px] font-medium leading-tight">{agent.label}</span>
                            <span className="block truncate text-[10px] leading-tight text-muted-foreground">{modelLabel ?? "Sem modelo configurado"}</span>
                        </span>
                    </motion.button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                    Trocar para o {agent.label} ({agent.shortcutLabel})
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

function HeaderButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={onClick}
                        aria-label={label}
                        aria-pressed={active}
                        className={cn("rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70", active && "bg-muted text-foreground")}
                    >
                        {children}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
