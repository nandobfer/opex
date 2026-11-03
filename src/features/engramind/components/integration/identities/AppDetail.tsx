"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IDENTITY_HELP } from "../../../help/identities"
import { appTokenInUse, tokensOfApp } from "../../../identities"
import type { EngramindAgent, EngramindApp, EngramindSubscription, EngramindToken } from "../../../types"
import { HelpBadge } from "../../shared/Badges"
import { formatDateTime } from "../../shared/format"
import { Section } from "../../shared/Section"
import { AgentsCard } from "./AgentsCard"
import { AppDialog } from "./AppDialog"
import { InUseTokenCard } from "./InUseTokenCard"
import { TokensCard } from "./TokensCard"

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.18 } } as const

interface AppDetailProps {
    app: EngramindApp
    apps: EngramindApp[]
    agents: EngramindAgent[]
    tokens: EngramindToken[]
    subscriptions: EngramindSubscription[]
    ownTokenIds: readonly (string | null | undefined)[]
    own: boolean
    onBack: () => void
    onOpenAgent: (agent: EngramindAgent) => void
}

/** Detalhe do app (OPE-117): Visão geral (token em uso no topo) · Agentes · Tokens (sem agente) · Webhook. */
export function AppDetail({ app, apps, agents, tokens, subscriptions, ownTokenIds, own, onBack, onOpenAgent }: AppDetailProps) {
    const [editing, setEditing] = useState(false)
    const appAgents = agents.filter((agent) => agent.app.slug === app.slug)
    const inUse = appTokenInUse(tokens, app, ownTokenIds)
    const loose = tokensOfApp(tokens, app, inUse)
    return (
        <div className="flex flex-col gap-4" data-testid={`app-detail-${app.slug}`}>
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden /> Apps
                </Button>
                <h3 className="flex flex-wrap items-center gap-1.5 text-base font-semibold">
                    {app.name} <span className="font-mono text-xs text-muted-foreground">{app.slug}</span>
                    {own && <HelpBadge value="Este Opex" tone="secondary" help="App do próprio Opex na rede." />}
                    {app.disabled_at && <HelpBadge value="desativado" tone="warning" help={IDENTITY_HELP.disabled} />}
                </h3>
            </div>
            <InUseTokenCard token={inUse} own={Boolean(inUse && ownTokenIds.includes(inUse.id))} apps={apps} agents={agents} />
            <Tabs defaultValue="overview">
                <TabsList>
                    <TabsTrigger value="overview">Visão geral</TabsTrigger>
                    <TabsTrigger value="agents">Agentes ({appAgents.length})</TabsTrigger>
                    <TabsTrigger value="tokens">Tokens ({loose.length})</TabsTrigger>
                    <TabsTrigger value="webhook">Webhook</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                    <motion.div {...fade}>
                        <Section title="Visão geral" info={IDENTITY_HELP.app} actions={<Button type="button" size="sm" variant="outline" className="bg-transparent" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Editar app</Button>}>
                            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                <div><dt className="text-xs text-muted-foreground">Nome</dt><dd>{app.name}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Slug</dt><dd className="font-mono">{app.slug}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Status</dt><dd>{app.disabled_at ? `Desativado em ${formatDateTime(app.disabled_at)}` : "Ativo"}</dd></div>
                                <div><dt className="text-xs text-muted-foreground">Criado em</dt><dd>{formatDateTime(app.created_at)}</dd></div>
                                <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Descrição</dt><dd>{app.description ?? "—"}</dd></div>
                            </dl>
                        </Section>
                    </motion.div>
                </TabsContent>
                <TabsContent value="agents">
                    <motion.div {...fade}>
                        <AgentsCard agents={appAgents} apps={[app]} subscriptions={subscriptions} onOpen={onOpenAgent} />
                    </motion.div>
                </TabsContent>
                <TabsContent value="tokens">
                    <motion.div {...fade}>
                        <TokensCard title="Tokens do app" info="Tokens do app sem agente (de app e administrativos). O token em uso fica fixo no topo. O vínculo do token não muda: para outro dono, emita um novo." tokens={loose} apps={apps} agents={agents} ownTokenIds={ownTokenIds} issuePreset={{ app: app.slug }} emptyDescription="Nenhum outro token deste app." />
                    </motion.div>
                </TabsContent>
                <TabsContent value="webhook">
                    <motion.div {...fade}>
                        <Section title="Webhook" info="Destino dos eventos do app (memórias, canais, assinaturas, configurações e identidades)." actions={<Button type="button" size="sm" variant="outline" className="bg-transparent" onClick={() => setEditing(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Editar webhook</Button>}>
                            <p className="break-all text-sm" data-testid="app-webhook">{app.webhook?.url ?? "Não configurado"}</p>
                            {app.webhook && <p className="text-xs text-muted-foreground">Segredo {app.webhook.secret.configured ? `gravado em ${formatDateTime(app.webhook.secret.updated_at)}` : "ausente"}</p>}
                        </Section>
                    </motion.div>
                </TabsContent>
            </Tabs>
            {editing && <AppDialog app={app} open onOpenChange={setEditing} />}
        </div>
    )
}
