/** @vitest-environment jsdom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import type { GithubLinkDto, GithubRepoOption } from "@/features/github/types"

const mocks = vi.hoisted(() => ({ links: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/github/components/links/GithubLinkDialog", () => ({ GithubLinkDialog: () => null }))
vi.mock("@/features/github/components/links/RemoveLinkDialog", () => ({ RemoveLinkDialog: () => null }))
vi.mock("@/features/github/hooks/useGithub", () => ({
    useGithubLinks: mocks.links,
    useSaveLink: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useGithubRepoIndex: () => new Map<string, GithubRepoOption>([["acme/alpha", { fullName: "acme/alpha", htmlUrl: "https://github.com/acme/alpha", description: "Repo Alpha", private: false, ownerAvatarUrl: null }]]),
}))

import { GithubLinksTab } from "@/features/github/components/links/GithubLinksTab"

const link = (overrides: Partial<GithubLinkDto>): GithubLinkDto => ({
    id: "1",
    repo: "acme/alpha",
    repoUrl: "https://github.com/acme/alpha",
    name: "Alpha",
    sigla: "ALP",
    entryColumnKey: "entrada",
    entryColumnName: "Entrada",
    closedColumnKey: null,
    closedColumnName: null,
    enabled: true,
    initialImportAt: null,
    lastSync: null,
    taskCount: 0,
    ...overrides,
})

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("GithubLinksTab", () => {
    it("renderiza o repositório com o componente do GitHub (avatar/nome)", () => {
        mocks.links.mockReturnValue({ data: [link({})], isLoading: false, isError: false })
        render(<GithubLinksTab configured />)
        expect(screen.getByText("acme/alpha")).toBeTruthy()
        expect(screen.getByText("Repo Alpha")).toBeTruthy()
    })

    it("a busca filtra os vínculos e distingue lista vazia de nenhum resultado", () => {
        mocks.links.mockReturnValue({ data: [link({}), link({ id: "2", repo: "acme/beta", name: "Beta", sigla: "BET", repoUrl: "https://github.com/acme/beta" })], isLoading: false, isError: false })
        render(<GithubLinksTab configured />)
        fireEvent.change(screen.getByLabelText("Buscar vínculo"), { target: { value: "beta" } })
        expect(screen.queryByText("acme/alpha")).toBeNull()
        expect(screen.getByText("acme/beta")).toBeTruthy()

        fireEvent.change(screen.getByLabelText("Buscar vínculo"), { target: { value: "zzz" } })
        expect(screen.getByText("Nenhum vínculo encontrado")).toBeTruthy()
    })

    it("sem token configurado mostra o aviso em vez da lista", () => {
        render(<GithubLinksTab configured={false} />)
        expect(screen.getByText(/Cadastre o token de acesso do GitHub/)).toBeTruthy()
    })
})
