/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({ options: undefined as unknown }))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/tasks/hooks/useTasks", () => ({ useTaskOptions: () => mocks.options }))

import { ClienteDialog } from "@/features/orcamentos/components/clients/ClienteDialog"
import type { GithubRepoOption } from "@/features/github/types"
import type { ProjectRef } from "@/features/tasks/types"

const PROJECTS: ProjectRef[] = [
    { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "App", repo: "acme/app", sigla: "APP" },
    { id: "bbbbbbbbbbbbbbbbbbbbbbbb", name: "Site", repo: "acme/site", sigla: "SITE" },
]

const repoOption = (fullName: string, description: string | null, isPrivate: boolean): GithubRepoOption => ({
    fullName,
    htmlUrl: `https://github.com/${fullName}`,
    description,
    private: isPrivate,
    ownerAvatarUrl: null,
})

const REPO_INDEX = new Map<string, GithubRepoOption>([
    ["acme/app", repoOption("acme/app", "Portal do cliente", true)],
    ["acme/site", repoOption("acme/site", "Site institucional", false)],
])

const withOptions = (projects: ProjectRef[], extra: Record<string, unknown> = {}) => {
    mocks.options = { data: { projects }, isLoading: false, isError: false, ...extra }
}

const renderDialog = (props: Partial<Parameters<typeof ClienteDialog>[0]> = {}) =>
    render(<ClienteDialog open client={null} submitting={false} repoIndex={REPO_INDEX} onSubmit={vi.fn()} onClose={vi.fn()} {...props} />)

afterEach(() => cleanup())

beforeEach(() => {
    vi.clearAllMocks()
    withOptions(PROJECTS)
})

describe("ClienteDialog — seleção de repositórios", () => {
    it("mostra os repositórios no rótulo real do GitHub e permite escolher vários", () => {
        renderDialog()
        fireEvent.click(screen.getByRole("button", { name: "Repositórios" }))

        expect(screen.getByText("acme/app")).toBeTruthy()
        expect(screen.getByText("Portal do cliente")).toBeTruthy()
        expect(screen.getByText("acme/site")).toBeTruthy()
        expect(screen.getByText("Site institucional")).toBeTruthy()
        expect(screen.getByLabelText("Privado")).toBeTruthy()

        fireEvent.click(screen.getByText("acme/app"))
        fireEvent.click(screen.getByText("acme/site"))

        expect(screen.getByText("2 selecionados")).toBeTruthy()
    })

    it("sem repositórios vinculados, avisa no campo e bloqueia o salvar", () => {
        withOptions([])
        renderDialog()

        expect(screen.getByRole("button", { name: "Repositórios" })).toBeTruthy()
        expect(screen.getByText("Nenhum repositório vinculado")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Criar cliente" }).hasAttribute("disabled")).toBe(true)
    })
})
