import { describe, expect, it } from "vitest"
import { clientPeriodRange } from "@/features/orcamentos/portal/period"
import { randomUsernameSuffix, usernameFromName, USERNAME_PATTERN } from "@/features/orcamentos/logic"

describe("período do portal", () => {
    const now = new Date(2026, 2, 15, 14, 30)

    it("mês atual vai do dia 1 ao fim de hoje", () => {
        const range = clientPeriodRange("month", now)
        const from = new Date(range.from)
        expect(from.getDate()).toBe(1)
        expect(from.getMonth()).toBe(2)
        expect(new Date(range.to).getTime()).toBeGreaterThanOrEqual(now.getTime())
    })

    it("30 e 90 dias contam para trás a partir de hoje", () => {
        const r30 = clientPeriodRange("30", now)
        const days30 = (now.getTime() - new Date(r30.from).getTime()) / 86_400_000
        expect(days30).toBeGreaterThan(29)
        expect(days30).toBeLessThan(30)

        const r90 = clientPeriodRange("90", now)
        const days90 = (now.getTime() - new Date(r90.from).getTime()) / 86_400_000
        expect(days90).toBeGreaterThan(89)
        expect(days90).toBeLessThan(90)
    })
})

describe("username do usuário de cliente", () => {
    it("gera slug a partir do nome (sem acento, minúsculo, hífen)", () => {
        expect(usernameFromName("Acme Corp")).toBe("acme-corp")
        expect(usernameFromName("  Loja São João! ")).toBe("loja-sao-joao")
        expect(usernameFromName("###")).toBe("cliente")
    })

    it("o slug sempre passa na regra de username", () => {
        for (const name of ["Acme Corp", "Loja São João!", "###"]) {
            expect(USERNAME_PATTERN.test(usernameFromName(name))).toBe(true)
        }
    })

    it("o sufixo de desempate é alfabético curto e determinístico com o random injetado", () => {
        expect(randomUsernameSuffix(4, () => 0)).toBe("aaaa")
        expect(randomUsernameSuffix(4, () => 0.999999)).toMatch(/^[a-z]{4}$/)
        expect(randomUsernameSuffix(4)).toMatch(/^[a-z]{4}$/)
    })
})
