import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { financeQueryRange } from "@/features/finance/filters"
import { formatDate } from "@/features/tasks/format"
import {
    computeServiceAmounts,
    formatHoursInput,
    formatMoneyInput,
    formatServiceDate,
    parseHoursInput,
    parseMoneyInput,
    serviceDateFromInput,
    serviceDateKey,
    serviceRangeBound,
    todayDateInput,
} from "@/features/services/logic"

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

describe("data do serviço sem deslocamento de fuso (OPE-125, America/Sao_Paulo)", () => {
    const previousTz = process.env.TZ
    beforeAll(() => {
        process.env.TZ = "America/Sao_Paulo"
    })
    afterAll(() => {
        process.env.TZ = previousTz
    })

    it("grava o dia escolhido ao meio-dia UTC, inclusive o 1º e o último dia do mês", () => {
        expect(serviceDateFromInput("2026-11-01")?.toISOString()).toBe("2026-11-01T12:00:00.000Z")
        expect(serviceDateFromInput("2026-10-31")?.toISOString()).toBe("2026-10-31T12:00:00.000Z")
    })

    it("recusa data malformada ou inexistente", () => {
        expect(serviceDateFromInput("2026-13-01")).toBeNull()
        expect(serviceDateFromInput("2026-02-30")).toBeNull()
        expect(serviceDateFromInput("01/11/2026")).toBeNull()
    })

    it("exibe o dia gravado (01/11) também na formatação local, e a chave volta ao dia escolhido", () => {
        const stored = serviceDateFromInput("2026-11-01")!.toISOString()
        expect(formatServiceDate(stored)).toBe("01/11/2026")
        expect(formatDate(stored)).toBe("01/11/2026")
        expect(serviceDateKey(stored)).toBe("2026-11-01")
        expect(formatServiceDate(null)).toBe("—")
    })

    it("registro antigo à meia-noite UTC ainda é exibido no dia escolhido", () => {
        expect(formatServiceDate("2026-11-01T00:00:00.000Z")).toBe("01/11/2026")
    })

    it("o período local do mês inclui o 1º e o último dia e exclui os vizinhos", () => {
        const range = financeQueryRange({ from: "2026-11-01", to: "2026-11-30" })
        const inside = (value: string) => {
            const time = serviceDateFromInput(value)!.getTime()
            return time >= new Date(range.from).getTime() && time <= new Date(range.to).getTime()
        }
        expect(range.from).toBe("2026-11-01T03:00:00.000Z")
        expect(inside("2026-11-01")).toBe(true)
        expect(inside("2026-11-30")).toBe(true)
        expect(inside("2026-10-31")).toBe(false)
        expect(inside("2026-12-01")).toBe(false)
    })
})

describe("serviceRangeBound", () => {
    it("só data vira o dia UTC inteiro; ISO completo vale como veio", () => {
        expect(serviceRangeBound("2026-11-01", "from").toISOString()).toBe("2026-11-01T00:00:00.000Z")
        expect(serviceRangeBound("2026-11-30", "to").toISOString()).toBe("2026-11-30T23:59:59.999Z")
        expect(serviceRangeBound("2026-12-01T02:59:59.999Z", "to").toISOString()).toBe("2026-12-01T02:59:59.999Z")
    })
})
