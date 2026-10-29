/** @vitest-environment happy-dom */

import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    mutate: vi.fn(),
    pending: false,
    clients: [] as Array<Record<string, unknown>>,
}))

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock("@/features/tasks/hooks/useTasks", () => ({
    useSetTaskClient: () => ({ mutate: mocks.mutate, isPending: mocks.pending }),
}))
vi.mock("@/features/orcamentos/hooks/useOrcamentos", () => ({
    useOrcamentoClients: () => ({ data: mocks.clients }),
}))

import { TaskClientCard } from "@/features/tasks/components/detail/TaskClientCard"
import type { ClienteOrcamentoDto } from "@/features/orcamentos/types"
import type { TaskDetailDto } from "@/features/tasks/types"

const PROJECT_ID = "p".repeat(24)
const OTHER_ID = "q".repeat(24)

const client = (overrides: Partial<ClienteOrcamentoDto> = {}): ClienteOrcamentoDto => ({
    id: "c".repeat(24),
    name: "ACME",
    tokenPrefix: "cli_x",
    portalPath: "/cliente?t=x",
    projectIds: [PROJECT_ID],
    projects: [],
    hourlyRate: 100,
    profitFactor: 2,
    active: true,
    createdAt: null,
    updatedAt: null,
    ...overrides,
})

const task = (overrides: Partial<TaskDetailDto> = {}): TaskDetailDto => ({
    id: "t".repeat(24),
    code: "OPX-1",
    columnId: "todo",
    order: 0,
    title: "Tarefa",
    summary: null,
    tags: [],
    taskType: "feature",
    priority: "medium",
    archived: false,
    project: { id: PROJECT_ID, name: "Portal", repo: "o/portal", sigla: "POR" },
    estimate: null,
    createdAt: null,
    updatedAt: null,
    clientId: null,
    description: null,
    technicalSpec: null,
    comments: [],
    history: [],
    timeLogs: [],
    totalTimeLogged: 0,
    estimateClientName: null,
    ...overrides,
})

beforeEach(() => {
    vi.clearAllMocks()
    mocks.pending = false
    mocks.clients = []
})

describe("TaskClientCard", () => {
    it("sem cliente: lista só os ativos que cobrem o repositório e adiciona o escolhido", () => {
        mocks.clients = [
            client({ id: "c".repeat(24), name: "ACME", projectIds: [PROJECT_ID] }),
            client({ id: "d".repeat(24), name: "Globex", projectIds: [OTHER_ID] }),
            client({ id: "e".repeat(24), name: "Inativo", projectIds: [PROJECT_ID], active: false }),
        ]
        render(<TaskClientCard task={task()} />)
        expect(screen.getByText("Cliente")).toBeTruthy()

        fireEvent.click(screen.getByRole("button", { name: "Adicionar cliente" }))
        expect(screen.getByLabelText("Buscar cliente")).toBeTruthy()
        const options = screen.getAllByRole("option")
        expect(options.map((option) => option.textContent)).toEqual(["ACME"])

        fireEvent.click(options[0])
        expect(mocks.mutate).toHaveBeenCalledWith("c".repeat(24))
    })

    it("com cliente: mostra o nome, permite trocar e remover com confirmação", () => {
        const acme = client({ id: "c".repeat(24), name: "ACME" })
        mocks.clients = [acme]
        render(<TaskClientCard task={task({ clientId: acme.id, estimateClientName: "ACME" })} />)

        expect(screen.getByText("ACME")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Remover cliente" }))
        expect(screen.getByText("Remover o cliente de OPX-1?")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /^Remover$/ }))
        expect(mocks.mutate).toHaveBeenCalledWith(null)
    })

    it("troca: abre o seletor e envia o novo cliente", () => {
        const acme = client({ id: "c".repeat(24), name: "ACME" })
        const globex = client({ id: "d".repeat(24), name: "Globex" })
        mocks.clients = [acme, globex]
        render(<TaskClientCard task={task({ clientId: acme.id })} />)

        fireEvent.click(screen.getByRole("button", { name: "Trocar" }))
        const options = screen.getAllByRole("option")
        expect(options.map((option) => option.textContent)).toEqual(["ACME", "Globex"])
        fireEvent.click(options[1])
        expect(mocks.mutate).toHaveBeenCalledWith(globex.id)
    })

    it("sem cliente elegível: orienta a cadastrar em Integrações › Clientes", () => {
        mocks.clients = [client({ id: "d".repeat(24), name: "Globex", projectIds: [OTHER_ID] })]
        render(<TaskClientCard task={task()} />)
        expect(screen.getByText(/Nenhum cliente ativo inclui o repositório da tarefa/)).toBeTruthy()
        const link = screen.getByRole("link", { name: /Cadastre em Integrações/ })
        expect(link.getAttribute("href")).toBe("/integracoes/clientes")
    })
})
