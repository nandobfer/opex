import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    findById: vi.fn(),
    findOne: vi.fn(),
    dbConnect: vi.fn(async () => undefined),
    session: vi.fn(),
    preview: vi.fn(async () => null),
    portal: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ dbConnect: mocks.dbConnect }))
vi.mock("@/lib/db/models/DevTask", () => ({ DevTask: { findById: mocks.findById, findOne: mocks.findOne } }))
vi.mock("@/features/auth/server/context", () => ({
    sessionFromCookies: mocks.session,
    previewClientFromCookies: mocks.preview,
    resolvePortalContext: mocks.portal,
}))

import { clienteTarefaPath } from "@/features/orcamentos/constants"
import { resolveClienteTaskRoute } from "@/features/orcamentos/server/task-route"
import { taskPath, taskPathOrId } from "@/features/tasks/constants"
import { parseTaskRouteRef, withSearchParams } from "@/features/tasks/route-ref"
import { resolveTaskRoute } from "@/features/tasks/server/resolve-route"

const ID = "6aee2de28d89a2641930701f"
const TASK = { _id: ID, code: "OPE-145", clientId: "cli-1" }

/** Consulta encadeada do Mongoose (`.select().lean()`) que resolve com o documento. */
const query = (doc: unknown) => ({ select: () => ({ lean: async () => doc }) })
const failing = () => ({ select: () => ({ lean: async () => Promise.reject(new Error("mongo fora")) }) })

const ownerOptions = { pathFor: (code: string) => taskPath({ code }) }

beforeEach(() => {
    vi.clearAllMocks()
    mocks.findById.mockImplementation((id: string) => query(id === ID ? TASK : null))
    mocks.findOne.mockImplementation((filter: { code: string }) => query(filter.code === "OPE-145" ? TASK : null))
})

describe("endereço da tarefa (puro)", () => {
    it("classifica id, código (em maiúsculas) e valores inválidos", () => {
        expect(parseTaskRouteRef(ID)).toEqual({ kind: "id", id: ID })
        expect(parseTaskRouteRef("ope-145")).toEqual({ kind: "code", code: "OPE-145" })
        expect(parseTaskRouteRef("OPE-145")).toEqual({ kind: "code", code: "OPE-145" })
        for (const value of ["", "nova", "ope-", "ope-12a", "-12", "ope 12"]) expect(parseTaskRouteRef(value)).toEqual({ kind: "invalid" })
    })

    it("links da tarefa usam o código em minúsculas; sem código, o id", () => {
        expect(taskPath({ code: "OPE-145" })).toBe("/tarefas/ope-145")
        expect(clienteTarefaPath({ code: "OPE-145" })).toBe("/cliente/tarefa/ope-145")
        expect(taskPathOrId("OPE-145", ID)).toBe("/tarefas/ope-145")
        expect(taskPathOrId(null, ID)).toBe(`/tarefas/${ID}`)
    })

    it("preserva a query string no redirecionamento", () => {
        expect(withSearchParams("/tarefas/ope-145", { aba: "spec", t: ["1", "2"], vazio: undefined })).toBe("/tarefas/ope-145?aba=spec&t=1&t=2")
        expect(withSearchParams("/tarefas/ope-145", {})).toBe("/tarefas/ope-145")
        expect(withSearchParams("/tarefas/ope-145")).toBe("/tarefas/ope-145")
    })
})

describe("resolveTaskRoute (página do dono)", () => {
    it("id existente redireciona para o código em minúsculas (fallback da URL antiga)", async () => {
        await expect(resolveTaskRoute(ID, ownerOptions)).resolves.toEqual({ kind: "redirect", path: "/tarefas/ope-145" })
    })

    it("código canônico renderiza a página com o id", async () => {
        await expect(resolveTaskRoute("ope-145", ownerOptions)).resolves.toEqual({ kind: "render", id: ID })
        expect(mocks.findOne).toHaveBeenCalledWith({ code: "OPE-145" })
    })

    it("código em maiúsculas redireciona para a forma canônica", async () => {
        await expect(resolveTaskRoute("OPE-145", ownerOptions)).resolves.toEqual({ kind: "redirect", path: "/tarefas/ope-145" })
    })

    it("código ou id inexistente segue para o \"não encontrado\" com o próprio valor", async () => {
        await expect(resolveTaskRoute("ope-999", ownerOptions)).resolves.toEqual({ kind: "render", id: "ope-999" })
        const missing = "65f0a1b2c3d4e5f6a7b8c9d0"
        await expect(resolveTaskRoute(missing, ownerOptions)).resolves.toEqual({ kind: "render", id: missing })
    })

    it("valor inválido não consulta o banco", async () => {
        await expect(resolveTaskRoute("qualquer", ownerOptions)).resolves.toEqual({ kind: "render", id: "qualquer" })
        expect(mocks.dbConnect).not.toHaveBeenCalled()
    })

    it("falha do banco não derruba a página: segue com o valor recebido", async () => {
        mocks.findOne.mockImplementation(failing)
        await expect(resolveTaskRoute("ope-145", ownerOptions)).resolves.toEqual({ kind: "render", id: "ope-145" })
    })
})

describe("resolveClienteTaskRoute (portal)", () => {
    const portal = (clientId: string) => ({ client: { _id: clientId } })

    it("id da tarefa do cliente redireciona para /cliente/tarefa/<código>", async () => {
        mocks.session.mockResolvedValue({ kind: "client" })
        mocks.portal.mockResolvedValue(portal("cli-1"))
        await expect(resolveClienteTaskRoute(ID)).resolves.toEqual({ kind: "redirect", path: "/cliente/tarefa/ope-145" })
        await expect(resolveClienteTaskRoute("ope-145")).resolves.toEqual({ kind: "render", id: ID })
    })

    it("tarefa de outro cliente não revela o código: segue como não encontrada", async () => {
        mocks.session.mockResolvedValue({ kind: "client" })
        mocks.portal.mockResolvedValue(portal("cli-2"))
        await expect(resolveClienteTaskRoute(ID)).resolves.toEqual({ kind: "render", id: ID })
        await expect(resolveClienteTaskRoute("ope-145")).resolves.toEqual({ kind: "render", id: "ope-145" })
    })

    it("sem contexto do portal, não consulta a tarefa", async () => {
        mocks.session.mockResolvedValue(null)
        await expect(resolveClienteTaskRoute(ID)).resolves.toEqual({ kind: "render", id: ID })
        expect(mocks.findById).not.toHaveBeenCalled()
    })
})
