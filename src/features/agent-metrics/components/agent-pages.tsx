"use client"

import { DeveloperMemoriesSection } from "@/features/agentic/components/DeveloperMemoriesSection"
import { MemoriesSection as ArchitectMemoriesSection } from "@/features/architect-agent/components/settings/MemoriesSection"
import { OpexMemoriesSection } from "@/features/opex-agent/components/settings/OpexMemoriesSection"
import { AgentPage, type AgentPageTab } from "./AgentPage"

/** Páginas dos agentes novos (OPE-122): Visão geral, Histórico e, com lista de memórias, Memórias. */

const memories = (render: AgentPageTab["render"]): AgentPageTab[] => [{ value: "memorias", label: "Memórias", render }]

const OPEX_TABS = memories(() => <OpexMemoriesSection tab="agente-opex" />)
const MADDOX_TABS = memories(() => <OpexMemoriesSection tab="agente-maddox" />)
const DEVELOPER_TABS = memories(() => <DeveloperMemoriesSection />)
const ARCHITECT_TABS = memories(() => <ArchitectMemoriesSection />)

export const OpexAgentMetricsPage = () => <AgentPage agent="opex" tabs={OPEX_TABS} />
export const MaddoxAgentMetricsPage = () => <AgentPage agent="maddox" tabs={MADDOX_TABS} />
export const OrcamentistaAgentPage = () => <AgentPage agent="orcamentista" />
export const CatalogadorAgentPage = () => <AgentPage agent="catalogador" />
export const RefinadorAgentPage = () => <AgentPage agent="refinador" />
export const DesenvolvedorAgentPage = () => <AgentPage agent="desenvolvedor" tabs={DEVELOPER_TABS} />
export const ArquitetoAgentPage = () => <AgentPage agent="arquiteto" tabs={ARCHITECT_TABS} />
