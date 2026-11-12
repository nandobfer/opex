"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { AgentPageHeader } from "@/components/list/AgentPageHeader"
import { OptionTabs } from "@/components/ui/option-tabs"

const tabMotion = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.18 } }

export interface AgentPageFrameProps {
    id: string
    icon: LucideIcon
    title: string
    description: string
    settingsHref?: string
    /** Seta de voltar antes do ícone (OPE-160) e o rótulo acessível dela. */
    backHref?: string
    backLabel?: string
    /** "Configurar" sem navegar (abre o editor na própria página). */
    onSettings?: () => void
    /** Ações à direita do Configurar. */
    actions?: ReactNode
    /** Entre o cabeçalho e as abas (ex.: aviso de disponibilidade). */
    notice?: ReactNode
    tabs: readonly { value: string; label: string }[]
    tab: string
    onTabChange: (value: string) => void
    /** Abaixo das abas (ex.: filtros da Visão geral). */
    filters?: ReactNode
    /** Conteúdo da aba atual (troca animada). */
    children: ReactNode
}

/**
 * Moldura das páginas de agente (OPE-122; extraída na OPE-130): cabeçalho com Configurar, aviso, abas
 * (`OptionTabs`) e o conteúdo da aba com troca animada. Usada pela `AgentPage` (agentes do catálogo) e
 * pela página de cada agente rotineiro; o estado da aba (URL) fica com quem usa.
 */
export function AgentPageFrame({ id, icon, title, description, settingsHref, backHref, backLabel, onSettings, actions, notice, tabs, tab, onTabChange, filters, children }: AgentPageFrameProps) {
    const reduceMotion = useReducedMotion()
    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <AgentPageHeader icon={icon} title={title} description={description} settingsHref={settingsHref} onSettings={onSettings} backHref={backHref} backLabel={backLabel}>
                {actions}
            </AgentPageHeader>
            {notice}
            <OptionTabs<string> id={`agent-page-tab-${id}`} aria-label={`Abas do ${title}`} options={[...tabs]} value={tab} onChange={onTabChange} className="w-full" />
            {filters}
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} {...tabMotion}>
                    {children}
                </motion.div>
            </AnimatePresence>
        </motion.section>
    )
}
