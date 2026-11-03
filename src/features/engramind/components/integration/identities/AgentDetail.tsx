"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Pencil, Power } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isOpexMemoryAgent, MEMORY_IDENTITIES, type MemoryIdentity } from "@/features/ai/agents"
import { AgentMemoryActivity } from "@/features/ai/components/memories/AgentMemoryActivity"
import { IDENTITY_HELP, SUBSCRIPTION_MODE_HELP } from "../../../help/identities"
import { tokensOfAgent } from "../../../identities"
import type { EngramindAgent, EngramindApp, EngramindMemory, EngramindSubscription, EngramindToken } from "../../../types"
import { engramindSend, route, useEngramindList, useEngramindMutation } from "../../../hooks/useEngramind"
import { useAgentActivity } from "../../../hooks/useAgentActivity"
import { HelpBadge } from "../../shared/Badges"
import { formatDateTime } from "../../shared/format"
import { Section } from "../../shared/Section"
import { AgentDialog } from "./AgentDialog"
import { TokensCard } from "./TokensCard"

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.18 } } as const

interface AgentDetailProps {
    agent: EngramindAgent
    apps: EngramindApp[]
    agents: EngramindAgent[]
    tokens: EngramindToken[]
    subscriptions: EngramindSubscription[]
    ownTokenIds: readonly (string | null | undefined)[]
    onBack: () => void
}

/** Memórias ativas dos canais que o agente alcança (pelas assinaturas), por canal. */
function AccessibleMemories({ channels }: { channels: string[] }) {
    const memories = useEngramindList<EngramindMemory>(channels.length ? "memories" : null, "memories", { channels: channels.join(","), status: "active,permanent" }, { all: true })
    const byChannel = useMemo(() => {
        const counts = new Map<string, number>()
        for (const memory of memories.items) counts.set(memory.channel, (counts.get(memory.channel) ?? 0) + 1)
        return counts
    }, [memories.items])
    if (!channels.length) return <p className="text-sm text-muted-foreground">Sem assinaturas: o agente não alcança nenhum canal.</p>
    return (
        <div className="space-y-1 text-sm" data-testid="accessible-memories">
            <p className="font-medium">{memories.isLoading ? "…" : memories.items.length} memória(s) acessível(is)</p>
            {channels.map((channel) => (
                <p key={channel} className="flex justify-between gap-2 text-xs">
                    <span className="truncate font-mono">{channel}</span>
                    <span className="text-muted-foreground">{memories.isLoading ? "…" : (byChannel.get(channel) ?? 0)}</span>
                </p>
            ))}
        </div>
    )
}

/** Detalhe do agente (OPE-117): Configuração · Tokens · Assinaturas · Memórias gravadas · Memórias acessíveis. */
export function AgentDetail({ agent, apps, agents, tokens, subscriptions, ownTokenIds, onBack }: AgentDetailProps) {
    const [editing, setEditing] = useState(false)
    const own = subscriptions.filter((subscription) => subscription.agent.id === agent.id)
    const reached = [...new Set(own.flatMap((subscription) => subscription.reaches))]
    const opexIdentity = isOpexMemoryAgent(agent.app.slug, agent.slug) && (MEMORY_IDENTITIES as readonly string[]).includes(agent.slug) ? (agent.slug as MemoryIdentity) : null
    const activity = useAgentActivity(Boolean(opexIdentity))
    const toggle = useEngramindMutation(() => engramindSend("patch", route("agents", agent.qualified_slug), { disabled: !agent.disabled_at }), { invalidate: ["agents"], success: agent.disabled_at ? "Agente reativado" : "Agente desativado" })
    return (
        <div className="flex flex-col gap-4" data-testid={`agent-detail-${agent.qualified_slug}`}>
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> {agent.app.slug}
                </Button>
                <h3 className="flex flex-wrap items-center gap-1.5 text-base font-semibold">
                    {agent.name} <span className="font-mono text-xs text-muted-foreground">{agent.qualified_slug}</span>
                    {agent.disabled_at && <HelpBadge value="desativado" tone="warning" help={IDENTITY_HELP.disabled} />}
                </h3>
            </div>
            <Tabs defaultValue="config">
                <TabsList className="flex-wrap">
                    <TabsTrigger value="config">Configuração</TabsTrigger>
                    <TabsTrigger value="tokens">Tokens</TabsTrigger>
                    <TabsTrigger value="subscriptions">Assinaturas ({own.length})</TabsTrigger>
                    <TabsTrigger value="written">Memórias gravadas</TabsTrigger>
                    <TabsTrigger value="reachable">Memórias acessíveis</TabsTrigger>
                </TabsList>
                <TabsContent value="config">
                    <motion.div {...fade}>
                        <Section
                            title="Configuração"
                            info={IDENTITY_HELP.agent}
                            actions={
                                <>
                                    <Button type="button" size="sm" variant="outline" className="bg-transparent" onClick={() => toggle.mutate(undefined as never)} disabled={toggle.isPending}>
                                        <Power className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {agent.disabled_at ? "Reativar" : "Desativar"}
                                    </Button>
                                    <Button type="button" size="sm" variant="outline" className="bg-transparent" onClick={() => setEditing(true)}>
                                        <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Editar
                                    </Button>
                                </>
                            }
                        >
                            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                <div><dt className="text-xs text-muted-foreground">Nome</dt><dd>{agent.name}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Status</dt><dd>{agent.disabled_at ? `Desativado em ${formatDateTime(agent.disabled_at)}` : "Ativo"}</dd></div>
                                <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Descrição</dt><dd>{agent.description ?? "—"}</dd></div>
                                <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Categorias</dt><dd className="text-xs text-muted-foreground">As categorias são globais (Configurações › Categorias); os canais do agente são as assinaturas.</dd></div>
                            </dl>
                        </Section>
                    </motion.div>
                </TabsContent>
                <TabsContent value="tokens">
                    <motion.div {...fade}>
                        <TokensCard title="Tokens do agente" info="Tokens agent deste agente: alcançam só os canais que ele assina." tokens={tokensOfAgent(tokens, agent)} apps={apps} agents={agents} ownTokenIds={ownTokenIds} issuePreset={{ app: agent.app.slug, agent: agent.qualified_slug }} emptyDescription="Nenhum token deste agente." />
                    </motion.div>
                </TabsContent>
                <TabsContent value="subscriptions">
                    <motion.div {...fade}>
                        <Section title="Assinaturas" info="Canais que o agente lê e grava (modo e alcance).">
                            {own.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Sem assinaturas.</p>
                            ) : (
                                <div className="space-y-1">
                                    {own.map((subscription) => (
                                        <p key={subscription.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                                            <HelpBadge value={`${subscription.target} · ${subscription.mode}`} help={SUBSCRIPTION_MODE_HELP[subscription.mode]} />
                                            <span className="text-muted-foreground">alcança {subscription.reaches.length} canal(is)</span>
                                        </p>
                                    ))}
                                </div>
                            )}
                        </Section>
                    </motion.div>
                </TabsContent>
                <TabsContent value="written">
                    <motion.div {...fade}>
                        <Section title="Memórias gravadas" info="Gravações do próprio agente na auditoria do Opex (só os agentes de memórias do Opex).">
                            {opexIdentity ? <AgentMemoryActivity agent={opexIdentity} activity={activity.byAgent.get(opexIdentity)} loading={activity.query.isLoading} /> : <p className="text-sm text-muted-foreground">Sem registro no Opex: só os agentes de memórias do Opex têm a auditoria das gravações.</p>}
                        </Section>
                    </motion.div>
                </TabsContent>
                <TabsContent value="reachable">
                    <motion.div {...fade}>
                        <Section title="Memórias acessíveis" info="Memórias ativas dos canais que as assinaturas alcançam.">
                            <AccessibleMemories channels={reached} />
                        </Section>
                    </motion.div>
                </TabsContent>
            </Tabs>
            {editing && <AgentDialog agent={agent} apps={apps} open onOpenChange={setEditing} />}
        </div>
    )
}
