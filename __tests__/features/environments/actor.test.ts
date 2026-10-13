import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/local-user", () => ({ getLocalUser: () => ({ id: "local", name: "Dono" }) }))

import { assertCanAccessProject, assertCanManage, assertCanManageSecrets, canAccessProject, fromClientActor, ownerActor } from "@/features/environments/server/actor"
import type { ClientActor } from "@/features/auth/server/context"

const clientActor = (overrides: Partial<ClientActor> = {}): ClientActor =>
    ({
        userId: "u1",
        displayName: "Fulano",
        username: "fulano",
        email: null,
        isAdmin: true,
        preview: false,
        client: { _id: "cli1", projectIds: ["p1"] } as never,
        ...overrides,
    }) as ClientActor

describe("actor — escopo de projetos", () => {
    it("o dono acessa qualquer projeto", () => {
        const actor = ownerActor()
        expect(actor.kind).toBe("owner")
        expect(canAccessProject(actor, "p9")).toBe(true)
    })

    it("o cliente só acessa os projetos vinculados", () => {
        const actor = fromClientActor(clientActor())
        expect(actor.projectIds).toEqual(["p1"])
        expect(canAccessProject(actor, "p1")).toBe(true)
        expect(canAccessProject(actor, "p2")).toBe(false)
        expect(() => assertCanAccessProject(actor, "p2")).toThrowError(/acesso/i)
    })
})

describe("actor — papéis", () => {
    it("admin do cliente pode gerenciar; usuário comum não", () => {
        expect(() => assertCanManage(fromClientActor(clientActor({ isAdmin: true })))).not.toThrow()
        expect(() => assertCanManage(fromClientActor(clientActor({ isAdmin: false })))).toThrowError(/administradores/i)
    })

    it("segredos são exclusivos do dono", () => {
        expect(() => assertCanManageSecrets(ownerActor())).not.toThrow()
        expect(() => assertCanManageSecrets(fromClientActor(clientActor()))).toThrowError(/dono do Opex/i)
    })
})
