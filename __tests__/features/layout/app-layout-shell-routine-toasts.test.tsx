/** @vitest-environment happy-dom */

import React from "react"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

/**
 * O `AppLayoutShell` monta os toasts de atenção dos agentes rotineiros (OPE-130) em qualquer tela:
 * `routine-run-attention` no `private-app` vira o toast com a ação "Abrir execução", que leva à
 * execução na página do agente.
 */

const mocks = vi.hoisted(() => ({
    handlers: new Map<string, Set<(payload: unknown) => void>>(),
    push: vi.fn(),
    toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("sonner", () => ({ toast: mocks.toast, Toaster: () => null }))
vi.mock("next/navigation", () => ({ usePathname: () => "/tarefas", useRouter: () => ({ push: mocks.push }) }))
vi.mock("next/link", () => ({
    default: React.forwardRef<HTMLAnchorElement, { children: React.ReactNode; href: string } & Record<string, unknown>>(function MockLink({ children, href, ...props }, ref) {
        return (
            <a ref={ref} href={href} {...props}>
                {children}
            </a>
        )
    }),
}))
vi.mock("@/lib/pusher/client", () => ({
    isPusherClientAvailable: () => true,
    acquireChannel: () => ({
        bind: (event: string, handler: (payload: unknown) => void) => {
            if (!mocks.handlers.has(event)) mocks.handlers.set(event, new Set())
            mocks.handlers.get(event)!.add(handler)
        },
        unbind: (event: string, handler: (payload: unknown) => void) => mocks.handlers.get(event)?.delete(handler),
    }),
    releaseChannel: () => undefined,
}))
vi.mock("@/lib/pusher/RealtimeStatusBanner", () => ({ RealtimeStatusBanner: () => null }))
vi.mock("@/features/opex-agent/components/agents/AgentChatNavItem", () => ({ AgentChatNavItem: () => <li data-testid="agent-nav-item-mock" /> }))
vi.mock("@/features/host-metrics/components/ServerQuotaSidebarItem", () => ({ ServerQuotaSidebarItem: () => <li data-testid="server-quota-item-mock" /> }))
vi.mock("@/features/integrations/hooks/useIntegrations", () => ({ useIntegrations: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }) }))
vi.mock("@/features/integrations/hooks/useIntegrationStatusLive", () => ({ useIntegrationStatusLive: vi.fn() }))
vi.mock("@/features/integrations/components/IntegrationTestDialog", () => ({ IntegrationTestDialog: () => null }))
vi.mock("@/features/integrations/components/IntegrationDebugDialog", () => ({ IntegrationDebugDialog: () => null }))

import { AppLayoutShell } from "@/features/layout/components/AppLayoutShell"
import { routineAgentHref } from "@/features/routine-agents/constants"

const emit = (event: string, payload: unknown) => act(() => mocks.handlers.get(event)?.forEach((handler) => handler(payload)))

beforeEach(() => {
    mocks.handlers.clear()
    mocks.push.mockClear()
    Object.values(mocks.toast).forEach((fn) => fn.mockClear())
})
afterEach(cleanup)

describe("AppLayoutShell — toasts de atenção dos agentes rotineiros (OPE-130)", () => {
    it("routine-run-attention vira toast com \"Abrir execução\", que abre a execução", () => {
        render(
            <AppLayoutShell ownerName="Ana">
                <p>conteúdo</p>
            </AppLayoutShell>,
        )
        expect(mocks.handlers.get("routine-run-attention")?.size).toBe(1)
        emit("routine-run-attention", { id: "r1", agentId: "a1", kind: "confirmation", status: "awaiting_confirmation", agentName: "Vagas" })
        expect(mocks.toast.warning).toHaveBeenCalledTimes(1)
        const [message, options] = mocks.toast.warning.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
        expect(message).toBe('O agente "Vagas" aguarda sua confirmação')
        expect(options.action.label).toBe("Abrir execução")
        options.action.onClick()
        expect(mocks.push).toHaveBeenCalledWith(routineAgentHref("a1", "r1"))
    })

    it("fim de execução vira toast de sucesso/erro com \"Abrir execução\"", () => {
        render(
            <AppLayoutShell ownerName="Ana">
                <p>conteúdo</p>
            </AppLayoutShell>,
        )
        emit("routine-run-attention", { id: "r2", agentId: "a1", kind: "finished", status: "completed", agentName: "Vagas" })
        emit("routine-run-attention", { id: "r3", agentId: "a1", kind: "finished", status: "error", agentName: "Vagas" })
        const [done, doneOptions] = mocks.toast.success.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }]
        expect(done).toBe('Execução do agente "Vagas" concluída')
        expect(doneOptions.action.label).toBe("Abrir execução")
        doneOptions.action.onClick()
        expect(mocks.push).toHaveBeenCalledWith(routineAgentHref("a1", "r2"))
        expect(mocks.toast.error).toHaveBeenCalledTimes(1)
    })

    it("ao desmontar o shell, a assinatura sai", () => {
        const view = render(
            <AppLayoutShell ownerName="Ana">
                <p>conteúdo</p>
            </AppLayoutShell>,
        )
        view.unmount()
        expect(mocks.handlers.get("routine-run-attention")?.size ?? 0).toBe(0)
    })
})
