/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

const createButton = () => screen.getByRole("button", { name: "Criar cliente" })

afterEach(() => cleanup())

beforeEach(() => {
    vi.clearAllMocks()
    withOptions(PROJECTS)
})

describe("ClienteDialog — seleção de repositórios", () => {
    it("mostra os repositórios no rótulo real do GitHub e permite escolher vários", () => {
        renderDialog()
        fireEvent.click(screen.getByRole("button", { name: "Repositórios (opcional)" }))

        expect(screen.getByText("acme/app")).toBeTruthy()
        expect(screen.getByText("Portal do cliente")).toBeTruthy()
        expect(screen.getByText("acme/site")).toBeTruthy()
        expect(screen.getByText("Site institucional")).toBeTruthy()
        expect(screen.getByLabelText("Privado")).toBeTruthy()

        fireEvent.click(screen.getByText("acme/app"))
        fireEvent.click(screen.getByText("acme/site"))

        expect(screen.getByText("2 selecionados")).toBeTruthy()
    })
})

describe("ClienteDialog — repositórios opcionais", () => {
    it("permite criar o cliente sem selecionar nenhum repositório", async () => {
        const onSubmit = vi.fn().mockResolvedValue(null)
        renderDialog({ onSubmit })

        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Acme" } })
        await waitFor(() => expect(createButton().hasAttribute("disabled")).toBe(false))

        fireEvent.click(createButton())

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
        expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Acme", projectIds: [] })
    })

    it("sem repositórios cadastrados, avisa no campo sem bloquear o salvar", async () => {
        withOptions([])
        renderDialog()

        expect(screen.getByRole("button", { name: "Repositórios (opcional)" })).toBeTruthy()
        expect(screen.getByText("Nenhum repositório vinculado")).toBeTruthy()
        // Sem repositórios válidos o envio segue bloqueado apenas enquanto o formulário está inválido.
        expect(createButton().hasAttribute("disabled")).toBe(true)

        fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Acme" } })
        await waitFor(() => expect(createButton().hasAttribute("disabled")).toBe(false))
    })

    it("continua bloqueando o salvamento enquanto o formulário está inválido", () => {
        renderDialog()
        expect(createButton().hasAttribute("disabled")).toBe(true)
    })

    it("não envia enquanto uma submissão está em andamento", () => {
        renderDialog({ submitting: true, client: null })
        expect(createButton().hasAttribute("disabled")).toBe(true)
    })
})
