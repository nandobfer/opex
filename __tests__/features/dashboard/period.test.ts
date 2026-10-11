import { describe, expect, it } from "vitest"
import { endOfDay, startOfDay, startOfMonth, subDays } from "date-fns"
import { DEFAULT_DASHBOARD_PERIOD, dashboardPeriodSchema, DASHBOARD_PERIODS, isDailyRange, periodRange } from "@/features/dashboard/period"

describe("período global do dashboard", () => {
    it("7/30/90 dias cobrem do início do primeiro dia até o fim do dia atual", () => {
        const now = new Date(2026, 9, 11, 14, 30)
        for (const [period, days] of [
            ["7d", 7],
            ["30d", 30],
            ["90d", 90],
        ] as const) {
            const { from, to } = periodRange(period, now)
            expect(new Date(from).getTime()).toBe(startOfDay(subDays(now, days - 1)).getTime())
            expect(new Date(to).getTime()).toBe(endOfDay(now).getTime())
        }
    })

    it("mês atual começa no primeiro dia do mês", () => {
        const now = new Date(2026, 9, 11, 14, 30)
        const { from, to } = periodRange("month", now)
        expect(new Date(from).getTime()).toBe(startOfMonth(now).getTime())
        expect(new Date(to).getTime()).toBe(endOfDay(now).getTime())
    })

    it("modo diário até 31 dias, semanal acima", () => {
        expect(isDailyRange(new Date(2026, 8, 11), new Date(2026, 9, 11))).toBe(true)
        expect(isDailyRange(new Date(2026, 6, 11), new Date(2026, 9, 11))).toBe(false)
    })

    it("schema aceita só as opções conhecidas e o padrão é 30 dias", () => {
        expect(DEFAULT_DASHBOARD_PERIOD).toBe("30d")
        for (const period of DASHBOARD_PERIODS) expect(dashboardPeriodSchema.safeParse(period).success).toBe(true)
        expect(dashboardPeriodSchema.safeParse("1d").success).toBe(false)
    })
})
