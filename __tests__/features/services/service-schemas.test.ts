import { describe, expect, it } from "vitest"
import { serviceFormSchema, serviceInputSchema, serviceWriteSchema } from "@/features/services/schemas"

/** Contratos do serviço: mesmos schemas na API e no formulário. */

const id = (n: number) => n.toString(16).padStart(24, "0")

describe("serviceInputSchema", () => {
    it("aceita um serviço mínimo (cliente + descrição + data + valores) com zero permitido", () => {
        const parsed = serviceInputSchema.parse({ clientId: id(1), description: "Consultoria", serviceDate: "2026-10-08", origin: "hours", hours: 0, clientHours: 0, billingBrl: 0 })
        expect(parsed).toMatchObject({ clientId: id(1), origin: "hours", hours: 0 })
    })

    it("exige cliente, descrição e data válida", () => {
        expect(serviceInputSchema.safeParse({ clientId: "x", description: "", serviceDate: "hoje", origin: "hours", hours: 1, clientHours: 1, billingBrl: 1 }).success).toBe(false)
    })

    it("recusa valor negativo", () => {
        expect(serviceInputSchema.safeParse({ clientId: id(1), description: "x", serviceDate: "2026-10-08", origin: "hours", hours: -1, clientHours: 0, billingBrl: 0 }).success).toBe(false)
    })

    it("aceita repositório e tarefa opcionais", () => {
        const parsed = serviceInputSchema.parse({ clientId: id(1), projectId: id(2), taskId: id(3), description: "x", serviceDate: "2026-10-08", origin: "billingBrl", hours: 0, clientHours: 0, billingBrl: 10 })
        expect(parsed.projectId).toBe(id(2))
        expect(parsed.taskId).toBe(id(3))
    })
})

describe("serviceWriteSchema", () => {
    it("aceita os anexos enviados no formulário", () => {
        const parsed = serviceWriteSchema.parse({ clientId: id(1), description: "x", serviceDate: "2026-10-08", origin: "hours", hours: 1, clientHours: 1, billingBrl: 1, attachmentIds: [id(4)] })
        expect(parsed.attachmentIds).toEqual([id(4)])
    })
})

describe("serviceFormSchema", () => {
    it("exige o cliente e a descrição e aceita repositório/tarefa vazios", () => {
        expect(serviceFormSchema.safeParse({ clientId: "", projectId: "", taskId: "", description: "", serviceDate: "2026-10-08", title: "", summary: "" }).success).toBe(false)
        const parsed = serviceFormSchema.parse({ clientId: id(1), projectId: "", taskId: "", description: "x", serviceDate: "2026-10-08", title: "", summary: "" })
        expect(parsed.projectId).toBe("")
    })
})
