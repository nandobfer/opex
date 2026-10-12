/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("@/features/time/hooks/useTime", async (original) => ({
    ...(await original<typeof import("@/features/time/hooks/useTime")>()),
    useActiveTimers: () => ({ data: [] }),
    useTimeRealtime: vi.fn(),
}))
vi.mock("@/features/agentic/hooks/useAgentic", async (original) => ({
    ...(await original<typeof import("@/features/agentic/hooks/useAgentic")>()),
    useWorkbenchesInProgress: () => ({ data: [] }),
    useWorkbenchProgressRealtime: vi.fn(),
}))

import DashboardLayout from "@/app/(app)/dashboard/layout"
import { useWorkbenchProgress } from "@/features/agentic/components/WorkbenchProgressProvider"
import { useTimer } from "@/features/time/components/TimerProvider"

/** Sonda: só passa com os dois contextos presentes (sem eles o indicador some em silêncio). */
function Probe() {
    const timer = useTimer()
    const progress = useWorkbenchProgress()
    return <span data-testid="probe">{timer && progress ? "contextos" : "sem contextos"}</span>
}

afterEach(cleanup)

describe("DashboardLayout", () => {
    it("fornece os contextos de períodos ativos e de mesas em andamento aos filhos", () => {
        render(
            <DashboardLayout>
                <Probe />
            </DashboardLayout>,
        )
        expect(screen.getByTestId("probe").textContent).toBe("contextos")
    })
})
