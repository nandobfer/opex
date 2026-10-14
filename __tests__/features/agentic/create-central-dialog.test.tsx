/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

const mocks = vi.hoisted(() => ({
    options: undefined as unknown,
    repoIndex: new Map() as unknown,
    refetch: vi.fn(),
    push: vi.fn(),
    create: vi.fn(),
}))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/features/tasks/hooks/useTasks", () => ({ useTaskOptions: () => mocks.options }))
vi.mock("@/features/github/hooks/useGithub", () => ({ useGithubRepoIndex: () => mocks.repoIndex }))
vi.mock("@/features/agentic/hooks/useAgentic", () => ({ useCreateCentral: () => ({ mutateAsync: mocks.create, isPending: false }) }))
vi.mock("@/lib/api", () => ({ apiErrorMessage: (_error: unknown, fallback: string) => fallback }))

import { CreateCentralDialog } from "@/features/agentic/components/settings/CreateCentralDialog"
import { AGENTIC_CODE_ROOT, centralSettingsPath } from "@/features/agentic/constants"
import { defaultSessionDirectory } from "@/features/agentic/logic"
import type { CentralDto } from "@/features/agentic/types"
import type { GithubRepoOption } from "@/features/github/types"
import type { ProjectRef } from "@/features/tasks/types"

const APP_ID = "a".repeat(24)
const SITE_ID = "b".repeat(24)

const PROJECTS: ProjectRef[] = [
    { id: APP_ID, name: "App", repo: "acme/app", sigla: "APP" },
    { id: SITE_ID, name: "Site", repo: "acme/site", sigla: "SITE" },
]

const repoOption = (fullName: string, description: string | null, isPrivate: boolean, ownerAvatarUrl: string | null = null): GithubRepoOption => ({
    fullName,
    htmlUrl: `https://github.com/${fullName}`,
    description,
    private: isPrivate,
    ownerAvatarUrl,
})

const REPO_INDEX = new Map<string, GithubRepoOption>([
    ["acme/app", repoOption("acme/app", "Portal do cliente", true, "https://avatars.githubusercontent.com/u/1")],
    ["acme/site", repoOption("acme/site", "Site institucional", false)],
])

const withOptions = (projects: ProjectRef[], extra: Record<string, unknown> = {}) => {
    mocks.options = { data: { projects }, isLoading: false, isError: false, error: null, refetch: mocks.refetch, ...extra }
}

const central = (projectId: string): CentralDto => ({ projectId } as unknown as CentralDto)

const renderDialog = (existing: readonly CentralDto[] = []) => render(<CreateCentralDialog open onOpenChange={vi.fn()} existing={existing} />)

/** Gatilho do campo "Projeto (repositório)": o rótulo do campo é o nome acessível do botão. */
const trigger = () => screen.getByRole("button", { name: "Projeto (repositório)" })
const openPicker = () => fireEvent.click(trigger())
const searchInput = () => screen.getByLabelText("Buscar repositório")
const createButton = () => screen.getByRole("button", { name: "Criar central" })
/** Repositórios visíveis na lista (o item de cada opção é o `owner/repo` do GitHub). */
const shownRepos = () => screen.queryAllByRole("option").length

afterEach(() => cleanup())

beforeEach(() => {
    vi.clearAllMocks()
    mocks.repoIndex = REPO_INDEX
    mocks.create.mockResolvedValue({ id: "c1", projectName: "App" })
    withOptions(PROJECTS)
})

describe("CreateCentralDialog — seletor de repositório", () => {
    it("mostra o repositório com avatar, descrição e cadeado de privado e seleciona pelo `owner/repo`", () => {
        renderDialog()
        openPicker()

        expect(screen.getByText("acme/app")).toBeTruthy()
        expect(screen.getByText("Portal do cliente")).toBeTruthy()
        expect(screen.getByText("acme/site")).toBeTruthy()
        expect(screen.getByText("Site institucional")).toBeTruthy()
        expect(screen.getByLabelText("Privado")).toBeTruthy()

        fireEvent.click(screen.getByText("acme/app"))
        expect(trigger().textContent).toContain("acme/app")
    })

    it("busca pelo repositório, pela sigla e tolera erro de digitação", () => {
        renderDialog()
        openPicker()

        fireEvent.change(searchInput(), { target: { value: "site" } })
        expect(screen.getByText("acme/site")).toBeTruthy()
        expect(screen.queryByText("acme/app")).toBeNull()

        fireEvent.change(searchInput(), { target: { value: "APP" } })
        expect(screen.getByText("acme/app")).toBeTruthy()
        expect(screen.queryByText("acme/site")).toBeNull()

        fireEvent.change(searchInput(), { target: { value: "acme/ape" } })
        expect(screen.getByText("acme/app")).toBeTruthy()
        expect(screen.queryByText("acme/site")).toBeNull()

        fireEvent.change(searchInput(), { target: { value: "zzzzzz" } })
        expect(screen.getByText("Nenhum repositório encontrado")).toBeTruthy()
        expect(shownRepos()).toBe(0)
    })

    it("sem metadados do GitHub, mantém o `owner/repo` do projeto com fallback e selecionável", () => {
        mocks.repoIndex = new Map()
        renderDialog()
        openPicker()

        expect(screen.getByText("acme/app")).toBeTruthy()
        expect(screen.queryByLabelText("Privado")).toBeNull()

        fireEvent.click(screen.getByText("acme/app"))
        expect(trigger().textContent).toContain("acme/app")
    })

    it("ao escolher, sugere o diretório das sessões e envia os dados do projeto", async () => {
        renderDialog()
        openPicker()
        fireEvent.click(screen.getByText("acme/app"))

        const directory = defaultSessionDirectory(AGENTIC_CODE_ROOT, "App")
        expect((screen.getByLabelText("Diretório das sessões") as HTMLInputElement).value).toBe(directory)

        await waitFor(() => expect(createButton().hasAttribute("disabled")).toBe(false))
        fireEvent.click(createButton())

        await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
        expect(mocks.create.mock.calls[0][0]).toEqual({ projectId: APP_ID, projectName: "App", sessionDirectory: directory })
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(centralSettingsPath("c1")))
    })

    it("projeto que já tem central fica bloqueado com o motivo e não pode ser escolhido", () => {
        renderDialog([central(APP_ID)])
        openPicker()

        const blocked = screen.getAllByRole("option")[0]
        expect(blocked.getAttribute("title")).toBe("Este projeto já tem uma central")
        expect(blocked.hasAttribute("disabled")).toBe(true)

        fireEvent.click(blocked)
        expect(screen.getByLabelText("Buscar repositório")).toBeTruthy()
        expect(trigger().textContent).toContain("Escolha o repositório")
    })

    it("sem projetos vinculados, avisa no campo e na lista", () => {
        withOptions([])
        renderDialog()
        openPicker()

        expect(screen.getByText("Nenhum repositório vinculado: vincule um em Integrações › GitHub")).toBeTruthy()
    })

    it("carregando, mostra o estado de carregamento na lista", () => {
        withOptions([], { isLoading: true })
        renderDialog()
        openPicker()

        expect(screen.getByText("Carregando…")).toBeTruthy()
    })

    it("falha ao listar projetos mostra a mensagem e permite tentar novamente", () => {
        withOptions([], { data: undefined, isError: true, error: new Error("boom") })
        renderDialog()

        expect(screen.getByRole("alert").textContent).toBe("Não foi possível listar os projetos")

        openPicker()
        expect(screen.getByText("Não foi possível listar os repositórios (confira o token em Integrações › GitHub)")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }))
        expect(mocks.refetch).toHaveBeenCalledTimes(1)
    })

    it("reabrir o diálogo limpa a seleção anterior", () => {
        const { rerender } = render(<CreateCentralDialog open onOpenChange={vi.fn()} existing={[]} />)
        openPicker()
        fireEvent.click(screen.getByText("acme/app"))
        expect(trigger().textContent).toContain("acme/app")

        rerender(<CreateCentralDialog open={false} onOpenChange={vi.fn()} existing={[]} />)
        rerender(<CreateCentralDialog open onOpenChange={vi.fn()} existing={[]} />)

        expect(trigger().textContent).toContain("Escolha o repositório")
        expect((screen.getByLabelText("Diretório das sessões") as HTMLInputElement).value).toBe("")
    })
})
