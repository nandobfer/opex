/** @vitest-environment jsdom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import { draftFrom } from "@/features/integrations/components/detail/draft"
import { getIntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a> }))
vi.mock("@/features/integrations/components/detail/CronJobsCard", () => ({ CronJobsCard: () => <div data-testid="cron-jobs" /> }))
vi.mock("@/features/integrations/components/detail/ApiDocsCard", () => ({ ApiDocsCard: () => <div data-testid="api-docs" /> }))

import { CronsEditorForm } from "@/features/integrations/components/detail/CronsEditorForm"

const def = getIntegrationDef("crons")!
const data: IntegrationDetailDto = {
    id: "crons",
    name: "Crons",
    description: "Rotinas agendadas",
    environment: "interno",
    debugMode: false,
    publicValues: { schedulerEnabled: true, internalBaseUrl: null, jobs: [] },
    secrets: { cronSecret: { configured: true, source: "db", unreadable: false } },
    encryptionKeyConfigured: true,
    stored: true,
    health: { status: "ok" },
    swaggerUrl: null,
    explorerAuth: null,
    cronStates: [],
}

function renderForm() {
    render(
        <CronsEditorForm
            def={def}
            data={data}
            draft={draftFrom(data)}
            setDraft={vi.fn()}
            dirty={false}
            pending={false}
            onSave={async () => true}
            onUndo={vi.fn()}
            onExplore={vi.fn()}
        />,
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/integracoes/crons")
})
afterEach(cleanup)

describe("CronsEditorForm", () => {
    it("tem as abas Geral e Rotinas; a lista de rotinas fica em Rotinas", () => {
        renderForm()
        expect(screen.getByRole("tab", { name: "Geral" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Rotinas" })).toBeTruthy()

        expect(screen.getByTestId("api-docs")).toBeTruthy()
        expect(screen.queryByTestId("cron-jobs")).toBeNull()

        fireEvent.click(screen.getByRole("tab", { name: "Rotinas" }))
        expect(screen.getByTestId("cron-jobs")).toBeTruthy()
    })
})
