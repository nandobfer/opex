import { describe, expect, it } from "vitest"
import { computeServiceAmounts, formatHoursInput, formatMoneyInput, parseHoursInput, parseMoneyInput, todayDateInput } from "@/features/services/logic"

/**
 * Regras puras dos Serviços: a relação dos três campos reativos (o último editado manda) e a
 * conversão `H:mm`/R$ ↔ números. Cobre o caminho feliz e as bordas de divisão por zero.
 */

describe("computeServiceAmounts", () => {
    it("duração real é a origem: infla pelo fator e fatura pelo custo/hora", () => {
        expect(computeServiceAmounts({ origin: "hours", hours: 2, clientHours: 0, billingBrl: 0, factor: 2, hourlyRate: 100 })).toEqual({ hours: 2, clientHours: 4, billingBrl: 400 })
    })

    it("duração inflada é a origem: volta para as horas reais e calcula o faturamento", () => {
        expect(computeServiceAmounts({ origin: "clientHours", hours: 0, clientHours: 5, billingBrl: 0, factor: 2, hourlyRate: 100 })).toEqual({ hours: 2.5, clientHours: 5, billingBrl: 500 })
    })

    it("faturamento é a origem: deriva a inflada e a real", () => {
        expect(computeServiceAmounts({ origin: "billingBrl", hours: 0, clientHours: 0, billingBrl: 600, factor: 2, hourlyRate: 150 })).toEqual({ billingBrl: 600, clientHours: 4, hours: 2 })
    })

    it("faturamento com custo/hora zero: preserva o digitado e zera os não deriváveis", () => {
        expect(computeServiceAmounts({ origin: "billingBrl", hours: 3, clientHours: 9, billingBrl: 100, factor: 2, hourlyRate: 0 })).toEqual({ billingBrl: 100, clientHours: 0, hours: 0 })
    })

    it("fator zero: a inflada é zero (origem real) e a real não é derivada (origem inflada)", () => {
        expect(computeServiceAmounts({ origin: "hours", hours: 3, clientHours: 0, billingBrl: 0, factor: 0, hourlyRate: 50 })).toEqual({ hours: 3, clientHours: 0, billingBrl: 0 })
        expect(computeServiceAmounts({ origin: "clientHours", hours: 0, clientHours: 4, billingBrl: 0, factor: 0, hourlyRate: 50 })).toEqual({ clientHours: 4, billingBrl: 200, hours: 0 })
    })

    it("arredonda a 2 casas e nunca devolve NaN/Infinity", () => {
        expect(computeServiceAmounts({ origin: "hours", hours: 1.333, clientHours: 0, billingBrl: 0, factor: 1.5, hourlyRate: 99.9 })).toEqual({ hours: 1.33, clientHours: 2, billingBrl: 199.8 })
        expect(computeServiceAmounts({ origin: "billingBrl", hours: 0, clientHours: 0, billingBrl: 10, factor: Number.NaN, hourlyRate: Number.NaN })).toEqual({ billingBrl: 10, clientHours: 0, hours: 0 })
    })

    it("zero é permitido nos três campos", () => {
        expect(computeServiceAmounts({ origin: "hours", hours: 0, clientHours: 0, billingBrl: 0, factor: 2, hourlyRate: 100 })).toEqual({ hours: 0, clientHours: 0, billingBrl: 0 })
    })
})

describe("parseHoursInput / formatHoursInput", () => {
    it("lê o hh:mm completo (reusa o helper da estimativa da tarefa)", () => {
        expect(parseHoursInput("1:30")).toBe(1.5)
        expect(parseHoursInput("0:05")).toBe(0.08)
        expect(parseHoursInput("1:5")).toBe(1.08)
        expect(parseHoursInput(" 3:00 ")).toBe(3)
    })

    it("devolve null enquanto a digitação não fecha o formato ou o valor é inválido", () => {
        expect(parseHoursInput("")).toBeNull()
        expect(parseHoursInput("2")).toBeNull()
        expect(parseHoursInput("2:")).toBeNull()
        expect(parseHoursInput("1:75")).toBeNull()
        expect(parseHoursInput("-1")).toBeNull()
        expect(parseHoursInput("abc")).toBeNull()
    })

    it("formata horas decimais como hh:mm, acima de 24 inclusive", () => {
        expect(formatHoursInput(1.5)).toBe("01:30")
        expect(formatHoursInput(0)).toBe("00:00")
        expect(formatHoursInput(25.5)).toBe("25:30")
    })
})

describe("parseMoneyInput / formatMoneyInput", () => {
    it("lê reais em pt-BR e em formato decimal", () => {
        expect(parseMoneyInput("1.234,56")).toBe(1234.56)
        expect(parseMoneyInput("1234.56")).toBe(1234.56)
        expect(parseMoneyInput("0")).toBe(0)
        expect(parseMoneyInput("")).toBeNull()
        expect(parseMoneyInput("abc")).toBeNull()
    })

    it("formata reais sem o prefixo", () => {
        expect(formatMoneyInput(1234.56)).toBe("1.234,56")
        expect(formatMoneyInput(0)).toBe("0,00")
    })
})

describe("todayDateInput", () => {
    it("devolve o dia local em yyyy-MM-dd", () => {
        expect(todayDateInput(new Date(2026, 9, 5))).toBe("2026-10-05")
    })
})
