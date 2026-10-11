/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { EstimateCard } from "@/features/orcamentos/components/preview/EstimateCard"
import { PreviewTitleCard } from "@/features/orcamentos/components/preview/PreviewTitleCard"
import { RepoMetaCard } from "@/features/orcamentos/components/preview/RepoMetaCard"
import { TypePriorityMetaCard } from "@/features/orcamentos/components/preview/TypePriorityMetaCard"
import type { ClienteRepoDto, DraftPreviewDto } from "@/features/orcamentos/types"

const preview: DraftPreviewDto = { title: "Ajustar o rodapé", taskType: "bugfix", priority: "medium", technicalSpec: "## Passos", summary: "Corrige o rodapé do site" }

describe("revisão da prévia (portal)", () => {
    it("mostra o nome como título, o resumo como subtítulo e a descrição, sem o texto 'Prévia da IA'", () => {
        render(<PreviewTitleCard preview={preview} description="# Descrição do cliente" generating={false} notice={null} />)
        expect(screen.getByText("Ajustar o rodapé")).toBeTruthy()
        expect(screen.getByText("Corrige o rodapé do site")).toBeTruthy()
        expect(screen.getByText("Descrição do cliente")).toBeTruthy()
        expect(screen.queryByText("Prévia da IA")).toBeNull()
    })

    it("enquanto gera a prévia mostra skeleton e não expõe o JSON cru da IA", () => {
        render(<PreviewTitleCard preview={null} description='{"title":"x"}' generating notice={null} />)
        expect(screen.getByText(/Gerando a prévia/)).toBeTruthy()
        expect(screen.getByLabelText("Gerando prévia")).toBeTruthy()
        expect(screen.queryByText(/"title"/)).toBeNull()
    })

    it("o card de horas mostra o progresso e, depois, as horas e o custo do cliente", () => {
        const { rerender } = render(<EstimateCard estimate={null} estimating status="Consultando (banco)…" error={null} onRetry={() => {}} />)
        expect(screen.getByText("Consultando (banco)…")).toBeTruthy()

        rerender(<EstimateCard estimate={{ hours: 2, clientHours: 20, billingBrl: 800 }} estimating={false} error={null} onRetry={() => {}} />)
        expect(screen.getByText("20:00 h")).toBeTruthy()
        expect(screen.getByText("R$ 800,00")).toBeTruthy()
    })

    it("o card de horas mostra o erro com 'Tentar novamente'", () => {
        render(<EstimateCard estimate={null} estimating={false} error="Falha na estimativa" onRetry={() => {}} />)
        expect(screen.getByText("Falha na estimativa")).toBeTruthy()
        expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeTruthy()
    })

    it("o card de repositório mostra o componente do GitHub: avatar, descrição e privacidade", () => {
        const repo: ClienteRepoDto = { id: "p", name: "acme/app", repo: "acme/app", sigla: "APP", ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1", description: "App do Acme", private: true }
        const { container } = render(<RepoMetaCard repo={repo} />)
        expect(screen.getByText("acme/app")).toBeTruthy()
        expect(screen.getByText("App do Acme")).toBeTruthy()
        expect(container.querySelector("img")?.getAttribute("src")).toBe("https://avatars.githubusercontent.com/u/1")
        expect(container.querySelector('[aria-label="Privado"]')).toBeTruthy()
    })

    it("o card de repositório cai na inicial quando não há avatar", () => {
        const repo: ClienteRepoDto = { id: "p", name: "acme/app", repo: "acme/app", sigla: "APP", ownerAvatarUrl: null, description: null, private: false }
        const { container } = render(<RepoMetaCard repo={repo} />)
        expect(container.querySelector("img")).toBeNull()
        expect(container.querySelector("span[aria-hidden]")?.textContent).toBe("a")
    })

    it("o card de repositório mostra um traço quando não há repositório", () => {
        render(<RepoMetaCard repo={null} />)
        expect(screen.getByText("—")).toBeTruthy()
    })

    it("o card de tipo e prioridade é editável com onPriorityChange e somente leitura sem ele", () => {
        const { rerender } = render(<TypePriorityMetaCard taskType="bugfix" priority="medium" />)
        expect(screen.queryByRole("button", { name: "Prioridade: alterar" })).toBeNull()
        rerender(<TypePriorityMetaCard taskType="bugfix" priority="medium" onPriorityChange={() => {}} />)
        expect(screen.getByRole("button", { name: "Prioridade: alterar" })).toBeTruthy()
    })
})
