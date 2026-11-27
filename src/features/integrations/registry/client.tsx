"use client"

import type { ReactNode } from "react"
import { Bot, Gauge, KeyRound, Puzzle, ServerCog, Sparkles, SquareSlash } from "lucide-react"
import { defineIntegrationClient, IntegrationsProvider, type IntegrationClientAdapter, type IntegrationEditorFormProps, type IntegrationsRealtimeClient } from "@nandobfer/integracoes/react"
import { aiClientAdapters, type AiHubTab, type AiProviderExtraTab } from "@nandobfer/integracoes/ia/react"
import { internalApiClient } from "@nandobfer/integracoes/internal-api/react"
import { api } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { useRealtimeConnection } from "@/lib/pusher/useRealtimeConnection"
import { AGENT_CATALOG } from "@/features/agent-metrics/catalog"
import { AI_TAB_ALIASES, type AiTab } from "@/features/ai/constants"
import { useAiFeatureRealtime } from "@/features/ai/hooks/useAi"
import { OrcamentistaTab } from "@/features/ai/components/orcamentista/OrcamentistaTab"
import { CatalogadorTab } from "@/features/ai/components/catalogador/CatalogadorTab"
import { TaskRefinementTab } from "@/features/ai/components/task-refinement/TaskRefinementTab"
import { SecretaryAgentTab } from "@/features/secretary-agent/components/SecretaryAgentTab"
import { AgenticTab } from "@/features/agentic/components/settings/AgenticTab"
import { CentralPage } from "@/features/agentic/components/central/CentralPage"
import { PrReviewTab } from "@/features/pr-review/components/PrReviewTab"
import { OpexAgentTab } from "@/features/opex-agent/components/settings/OpexAgentTab"
import { MaddoxAgentTab } from "@/features/maddox-agent/components/settings/MaddoxAgentTab"
import { AdversarialAgentTab } from "@/features/adversarial-agent/components/settings/AdversarialAgentTab"
import { MentorAgentTab } from "@/features/adversarial-agent/components/mentor/MentorAgentTab"
import { ArchitectAgentTab } from "@/features/architect-agent/components/settings/ArchitectAgentTab"
import { RoutineAgentsTab } from "@/features/routine-agents/components/settings/RoutineAgentsTab"
import { OpencodeAccountsCard } from "@/features/opencode-accounts/components/OpencodeAccountsCard"
import { OpencodeResourceTab } from "@/features/opencode-resources/components/OpencodeResourceTab"
import { OpencodeControlsTab } from "@/features/opencode-service/components/OpencodeControlsTab"
import { GithubEditorForm } from "@/features/github/components/GithubEditorForm"
import { OrcamentosEditorForm } from "@/features/orcamentos/components/OrcamentosEditorForm"
import { ClienteConfigPage } from "@/features/orcamentos/components/clients/ClienteConfigPage"
import { BuilderMachineEditorForm } from "@/features/local-docker/components/BuilderMachineEditorForm"
import { EngramindEditorForm } from "@/features/engramind/components/integration/EngramindEditorForm"
import { EvolutionEditorForm } from "@/features/evolution-api/components/EvolutionEditorForm"
import { ApiTokensCard } from "@/features/integrations/components/internal-api/ApiTokensCard"
import { integrationsRegistry } from "./definitions"

/**
 * Partes de cliente das integrações do Opex (formulários, abas, cards e páginas) e o provedor da
 * central montado no layout do app.
 */

type HubTabComponent = AiHubTab["component"]

/** Componente de cada aba de agente (a ordem e os rótulos vêm do catálogo de agentes, como na sidebar). */
const AGENT_TAB_COMPONENTS: Record<Exclude<AiTab, "provedores">, HubTabComponent> = {
    "agente-opex": OpexAgentTab,
    "agente-maddox": MaddoxAgentTab,
    "agente-secretario": SecretaryAgentTab,
    orcamentista: OrcamentistaTab,
    catalogador: CatalogadorTab,
    "refinar-tarefa": TaskRefinementTab,
    "desenvolvimento-agentico": AgenticTab,
    "agente-arquiteto": ArchitectAgentTab,
    "agente-adversario": AdversarialAgentTab,
    "revisao-pr": PrReviewTab,
    "agente-mentor": MentorAgentTab,
    rotineiros: () => <RoutineAgentsTab />,
}

const AI_HUB_TABS: readonly AiHubTab[] = AGENT_CATALOG.map((agent) => ({
    id: agent.settingsTab,
    label: agent.navLabel,
    icon: agent.icon,
    component: AGENT_TAB_COMPONENTS[agent.settingsTab as Exclude<AiTab, "provedores">],
}))

const resource = (kind: "skill" | "agent" | "command" | "plugin" | "mcp"): AiProviderExtraTab["component"] =>
    function OpencodeResource({ dirty }) {
        return <OpencodeResourceTab key={kind} kind={kind} dirty={dirty} />
    }

/** Abas extras do OpenCode de sessão (serviço no host e recursos do `opencode.jsonc`). */
const OPENCODE_TABS: readonly AiProviderExtraTab[] = [
    { id: "controles", label: "Controles", icon: Gauge, component: OpencodeControlsTab, position: "beforeModels" },
    { id: "contas", label: "Contas", icon: KeyRound, component: OpencodeAccountsCard },
    { id: "skills", label: "Skills", icon: Sparkles, component: resource("skill") },
    { id: "agentes", label: "Agentes", icon: Bot, component: resource("agent") },
    { id: "comandos", label: "Comandos", icon: SquareSlash, component: resource("command") },
    { id: "plugins", label: "Plugins", icon: Puzzle, component: resource("plugin") },
    { id: "mcps", label: "MCPs", icon: ServerCog, component: resource("mcp") },
]

const noop = () => undefined

const editor = (id: string, Component: (props: IntegrationEditorFormProps) => ReactNode): IntegrationClientAdapter => defineIntegrationClient({ id, editor: Component })

export const OPEX_CLIENT_ADAPTERS: readonly IntegrationClientAdapter[] = [
    internalApiClient({ cards: ApiTokensCard }),
    editor("github", (props) => <GithubEditorForm {...props} onExplore={props.onExplore ?? noop} />),
    ...aiClientAdapters({
        tabs: AI_HUB_TABS,
        aliases: AI_TAB_ALIASES,
        useHubEffects: useAiFeatureRealtime,
        providerTabs: { opencode: OPENCODE_TABS },
        hubPages: [{ path: "centrais/:id", component: ({ params }) => <CentralPage id={params.id!} /> }],
    }),
    defineIntegrationClient({
        id: "orcamentos",
        editor: ({ def, data }) => <OrcamentosEditorForm def={def} data={data} />,
        pages: [{ path: ":clientId", component: ({ params }) => <ClienteConfigPage clientId={params.clientId!} /> }],
    }),
    editor("builder_machine", BuilderMachineEditorForm),
    editor("engramind", (props) => <EngramindEditorForm {...props} onExplore={props.onExplore ?? noop} />),
    editor("evolution-api", EvolutionEditorForm),
]

/** Pusher do app (contagem de referências por canal) para a central. */
const realtime: IntegrationsRealtimeClient = {
    isAvailable: isPusherClientAvailable,
    acquire: (channel) => acquireChannel(channel),
    release: releaseChannel,
    useConnectionState() {
        const state = useRealtimeConnection()
        return state === "disabled" ? "unavailable" : state
    },
}

/** Provedor da central de integrações (montado no layout: páginas, sidebar e diálogos usam o mesmo registro). */
export function OpexIntegrationsProvider({ children }: { children: ReactNode }) {
    return (
        <IntegrationsProvider registry={integrationsRegistry} clients={OPEX_CLIENT_ADAPTERS} api={api} apiBasePath={withBasePath("/api")} realtime={realtime} appChannel={appChannel()}>
            {children}
        </IntegrationsProvider>
    )
}
