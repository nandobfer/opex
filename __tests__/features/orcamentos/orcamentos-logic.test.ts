import { describe, expect, it } from "vitest"
import { computeClientEstimate, formatFactorLabel, formatHoursLabel, repoLabel, repoLabelFrom, repoLabelIndex } from "@/features/orcamentos/logic"
import type { ClienteRepoDto } from "@/features/orcamentos/types"

describe("orçamento do cliente", () => {
    it("aplica o fator de lucro nas horas e calcula o faturamento (exemplo R$ 40 × 20:00 = R$ 800)", () => {
        expect(computeClientEstimate(2, 10, 40)).toEqual({ hours: 2, clientHours: 20, billingBrl: 800 })
    })

    it("aceita fator fracionário e arredonda o faturamento", () => {
        expect(computeClientEstimate(3, 1.5, 10)).toEqual({ hours: 3, clientHours: 4.5, billingBrl: 45 })
    })

    it("não deixa as horas negativas nem o fator abaixo de 1", () => {
        expect(computeClientEstimate(-5, 0.5, -10)).toEqual({ hours: 0, clientHours: 0, billingBrl: 0 })
    })

    it("formata horas em H:mm e o fator com x", () => {
        expect(formatHoursLabel(2)).toBe("2:00")
        expect(formatHoursLabel(1.5)).toBe("1:30")
        expect(formatHoursLabel(0)).toBe("0:00")
        expect(formatFactorLabel(10)).toBe("10x")
        expect(formatFactorLabel(2.5)).toBe("2.5x")
    })

    it("monta o rótulo do GitHub a partir do repositório do cliente", () => {
        const repo: ClienteRepoDto = { id: "p", name: "acme/app", repo: "acme/app", sigla: "APP", ownerAvatarUrl: "https://avatar/acme.png", description: "App do Acme", private: true }
        expect(repoLabel(repo)).toEqual({ fullName: "acme/app", ownerAvatarUrl: "https://avatar/acme.png", description: "App do Acme", private: true })
    })

    it("indexa pelo repo em minúsculas e cai na inicial quando o repositório não está no índice", () => {
        const repo: ClienteRepoDto = { id: "p", name: "acme/app", repo: "Acme/App", sigla: "APP", ownerAvatarUrl: "https://avatar/acme.png", description: null, private: false }
        const index = repoLabelIndex([repo])
        expect(repoLabelFrom("acme/app", index).ownerAvatarUrl).toBe("https://avatar/acme.png")
        expect(repoLabelFrom("outro/repo", index)).toEqual({ fullName: "outro/repo", ownerAvatarUrl: null, description: null, private: false })
    })
})
