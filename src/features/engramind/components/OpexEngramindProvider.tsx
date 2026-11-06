"use client"

import { useCallback, useMemo, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import axios from "axios"
import { toast } from "sonner"
// A lib não importa CSS: as folhas do React Flow (canvas) e do react-day-picker (filtro de período) entram aqui.
import "@xyflow/react/dist/style.css"
import "react-day-picker/style.css"
import { EngramindError } from "@engramind/client"
import { EngramindProvider, type ConfigureTarget, type EngramindDataSource, type FooterContext, type NavigationAdapter, type PartialMessages, type RenderLinkProps } from "@engramind/client/react"
import { api, apiErrorCode, apiErrorMessage, unwrapApi } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import type { ApiResponse } from "@/lib/types/api"
import { useCentrals } from "@/features/agentic/hooks/useAgentic"
import { ENGRAMIND_INTEGRATION_HREF, ENGRAMIND_PAGE_HREF, OPEX_APP_SLUG } from "../constants"
import { useAgentActivity } from "../hooks/useAgentActivity"
import { useUniverseLayout } from "../hooks/useUniverseLayout"
import { centralChannelLabels } from "../network/channel-labels"
import { agentIcon } from "./network/agent-icons"
import { AboutCard } from "./page/AboutCard"
import { ChannelSettingsCard } from "./page/channels/ChannelSettingsCard"

/** SSE da lib (`GET /api/engramind/events`, só o dono): a rede e os universos atualizam por ele. */
export const ENGRAMIND_EVENTS_URL = withBasePath("/api/engramind/events")

/** Erro do axios (resposta `ApiResponse` do Opex) → `EngramindError` da lib (mensagem e código pt-BR). */
export function toLibError(error: unknown): unknown {
    if (!axios.isAxiosError(error)) return error
    const status = error.response?.status ?? 0
    const details = (error.response?.data as { details?: unknown } | undefined)?.details
    const retryAfter = Number(error.response?.headers?.["retry-after"])
    return new EngramindError(status, apiErrorMessage(error, "Não foi possível falar com o Engramind."), apiErrorCode(error) ?? `HTTP_${status}`, details, Number.isFinite(retryAfter) ? retryAfter : null)
}

/**
 * Fonte de dados da lib pelas rotas `/api/engramind/**` do Opex (proxy do gestor, com o catálogo de
 * operações, a auditoria e o Pusher das abas de gestor), pelo axios do projeto.
 */
export const opexEngramindSource: EngramindDataSource = {
    async request<T>(method: "get" | "post" | "put" | "patch" | "delete", path: string, options: { params?: Record<string, unknown>; body?: unknown } = {}) {
        const url = `/engramind/${path}`
        try {
            const response =
                method === "get" ? await api.get<ApiResponse<T>>(url, { params: options.params }) : method === "delete" ? await api.delete<ApiResponse<T>>(url) : await api[method]<ApiResponse<T>>(url, options.body ?? {})
            return unwrapApi(response.data)
        } catch (error) {
            throw toLibError(error)
        }
    },
}

const navigation: NavigationAdapter = { useRouter, usePathname, useSearchParams }
const renderLink = ({ href, children, ...props }: RenderLinkProps) => (
    <Link href={href} {...(props as Record<string, unknown>)}>
        {children}
    </Link>
)
const notify = (kind: "success" | "error" | "info" | "warning", message: string) => toast[kind](message)
/** Textos do Opex onde a lib fala da configuração (o gestor é a integração do Opex). */
const messages: PartialMessages = {
    "network.noAgents.description": "Crie ou ative um agente deste app em Integrações › Engramind › Identidades.",
    "network.noApps.description": "Crie um app e os agentes dele na aba Identidades da integração para ver a rede.",
}
const hrefs = { network: ENGRAMIND_PAGE_HREF, channel: (slug: string) => `${ENGRAMIND_PAGE_HREF}/canais/${encodeURIComponent(slug)}` }

/**
 * `EngramindProvider` do Opex (OPE-116): a lib `@engramind/client` no **modo gestor** (Apps x canais,
 * token admin pelo proxy do Opex), com o tempo real pelo SSE da lib, os rótulos das centrais, os ícones
 * e as gravações dos agentes do Opex, o card "O que é o Engramind" no fim da rede e as configurações do
 * canal no painel e no detalhe. `channelLabels = false` não busca as centrais.
 */
export function OpexEngramindProvider({ children, channelLabels = true }: { children: ReactNode; channelLabels?: boolean }) {
    const router = useRouter()
    const centrals = useCentrals(channelLabels)
    const labels = useMemo(() => centralChannelLabels(Array.isArray(centrals.data) ? centrals.data : []), [centrals.data])
    const activity = useAgentActivity()
    // Layout dos universos (aba Visualização): vale para a rede, os universos de IA e os dos rotineiros; muda ao vivo.
    const universeLayout = useUniverseLayout({ realtime: true })
    // Gravadas (auditoria do Opex): só os agentes do app do Opex (`opex/<identidade>`).
    const agentWrites = useCallback(
        (id: string) => {
            const [app, slug] = id.split("/")
            if (app !== OPEX_APP_SLUG || !slug) return null
            const row = activity.byAgent.get(slug as never)
            return { total: row?.total ?? 0, last7d: row?.last7d ?? 0 }
        },
        [activity.byAgent],
    )
    const onConfigure = useCallback((target?: ConfigureTarget) => router.push(`${ENGRAMIND_INTEGRATION_HREF}?aba=${target === "identities" ? "identidades" : "conexao"}`), [router])
    const slots = useMemo(
        () => ({
            footer: (context: FooterContext) => <AboutCard onConfigure={() => onConfigure("connection")} layout={context.layout} />,
            channelDetail: (slug: string) => <ChannelSettingsCard channel={slug} />,
        }),
        [onConfigure],
    )
    return (
        <EngramindProvider
            dataSource={opexEngramindSource}
            mode="manager"
            events={ENGRAMIND_EVENTS_URL}
            notify={notify}
            navigation={navigation}
            renderLink={renderLink}
            hrefs={hrefs}
            agentIcon={agentIcon}
            agentWrites={agentWrites}
            channelLabels={labels}
            onConfigure={onConfigure}
            messages={messages}
            slots={slots}
            universeLayout={universeLayout.data?.config}
            storagePrefix=""
        >
            {children}
        </EngramindProvider>
    )
}
