/** @vitest-environment jsdom */

import { existsSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
    notFound: vi.fn(() => {
        throw new Error("NEXT_NOT_FOUND")
    }),
}))

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: vi.fn() }))
vi.mock("@/features/integrations/components/IntegrationDetailPage", () => ({
    IntegrationDetailPage: ({ id }: { id: string }) => <div data-testid="detail">{id}</div>,
}))

import ProvedorIaPage from "@/app/(app)/integracoes/ia/[provider]/page"
import { hasCustomIntegrationPath, INTEGRATION_IDS, integrationPath } from "@/lib/integrations/catalog"

const APP_DIR = path.resolve(__dirname, "../../src/app/(app)")

afterEach(() => cleanup())

describe("páginas dos Provedores de IA", () => {
    it("toda integração com rota própria tem uma página que atende o endereço", () => {
        for (const id of INTEGRATION_IDS.filter(hasCustomIntegrationPath)) {
            const segments = integrationPath(id).split("/").filter(Boolean)
            // Último segmento pode ser estático (`ia/page.tsx`) ou dinâmico (`ia/[provider]/page.tsx`).
            const parent = segments.slice(0, -1).join("/")
            const exact = path.join(APP_DIR, ...segments, "page.tsx")
            const dynamic = path.join(APP_DIR, parent, "[provider]", "page.tsx")
            expect(existsSync(exact) || (segments.length > 2 && existsSync(dynamic)), `${id} → ${integrationPath(id)}`).toBe(true)
        }
    })

    it.each([
        ["opencode", "ai_opencode"],
        ["gemini", "ai_gemini"],
        ["anthropic", "ai_anthropic"],
        ["openai", "ai_openai"],
        ["deepseek", "ai_deepseek"],
        ["jev", "ai_jev"],
    ])("/integracoes/ia/%s abre a integração %s", async (provider, id) => {
        render(await ProvedorIaPage({ params: Promise.resolve({ provider }) }))
        expect(screen.getByTestId("detail").textContent).toBe(id)
    })

    it("provedor desconhecido cai no 404", async () => {
        await expect(ProvedorIaPage({ params: Promise.resolve({ provider: "mistral" }) })).rejects.toThrow("NEXT_NOT_FOUND")
    })
})
