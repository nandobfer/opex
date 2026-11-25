import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SECRETARY_SETTINGS } from "@/features/secretary-agent/schemas"
import { emptyPersonality } from "@/features/secretary-agent/personality"
import { DomainError } from "@/lib/api/route"

type Row = Record<string, unknown> & { _id: string }

const mocks = vi.hoisted(() => {
    const rows: (Record<string, unknown> & { _id: string })[] = []
    const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) =>
        Object.entries(filter).every(([key, value]) => (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) ? true : row[key] === value))
    const model = {
        createIndexes: async () => undefined,
        updateMany: async () => ({ modifiedCount: 0 }),
        exists: async (filter: Record<string, unknown>) => rows.find((row) => matches(row, filter)) ?? null,
        create: async (row: Record<string, unknown> & { _id: string }) => {
            if (row.status === "running" && rows.some((item) => item.status === "running")) throw Object.assign(new Error("dup"), { code: 11000 })
            rows.push({ ...row })
        },
        updateOne: async (filter: Record<string, unknown>, update: { $set?: Record<string, unknown>; $inc?: Record<string, number>; $push?: Record<string, { $each: unknown[] }> }) => {
            const row = rows.find((item) => matches(item, filter))
            if (!row) return { matchedCount: 0 }
            Object.assign(row, update.$set ?? {})
            for (const [key, value] of Object.entries(update.$push ?? {})) row[key] = [...((row[key] as unknown[]) ?? []), ...value.$each]
            for (const [key, value] of Object.entries(update.$inc ?? {})) row[key] = Number(row[key] ?? 0) + value
            return { matchedCount: 1 }
        },
        findOne: (filter: Record<string, unknown>) => ({ lean: async () => rows.find((row) => matches(row, filter)) ?? null }),
        find: () => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) }),
    }
    return {
        rows,
        model,
        jobs: [] as (() => Promise<void>)[],
        writeVersion: vi.fn(async (..._args: unknown[]): Promise<string> => "v1"),
        publish: vi.fn(),
        inference: vi.fn(),
        messages: vi.fn(),
        audit: vi.fn(),
    }
})

vi.mock("mongoose", async (importOriginal) => {
    const actual = (await importOriginal()) as { models: Record<string, unknown>; default: Record<string, unknown> }
    const models = { ...actual.models, SecretaryAnalysis: mocks.model }
    return { ...actual, models, default: { ...actual.default, models } }
})
vi.mock("@/lib/db", () => ({ dbConnect: vi.fn(), AcaoAuditoria: { EXECUTAR: "EXECUTAR" }, recordAudit: mocks.audit }))
vi.mock("@/lib/db/models/AiConsumption", () => ({ AiConsumption: { aggregate: async () => [{ cost: 0.01 }] } }))
vi.mock("@/lib/after-response", () => ({ runAfterResponse: (_label: string, job: () => Promise<void>) => mocks.jobs.push(job) }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publish }))
vi.mock("ai", () => ({ tool: (definition: unknown) => definition }))
vi.mock("@/features/evolution-api/server/client", () => ({ evolution: { findChats: async () => [], findMessages: mocks.messages } }))
vi.mock("@/features/secretary-agent/server/models", () => ({ SecretarySent: { find: () => ({ select: () => ({ lean: async () => [] }) }) } }))
vi.mock("@/features/secretary-agent/server/ai", () => ({ secretaryInference: mocks.inference }))
vi.mock("@/features/secretary-agent/server/personality", () => ({ loadPersonality: async () => ({ versionId: "v0", snapshot: { base: emptyPersonality(), variants: [] } }), writeVersion: mocks.writeVersion }))
vi.mock("@/features/secretary-agent/server/settings", () => ({
    loadSecretarySettings: async () => ({ settings: { ...DEFAULT_SECRETARY_SETTINGS, instance: "opex", main: { ...DEFAULT_SECRETARY_SETTINGS.main, provider: "opencode-go", model: "m" } } }),
}))

import { cancelAnalysis, startAnalysis } from "@/features/secretary-agent/server/analysis"

const A = "5531911111111@s.whatsapp.net"
const B = "5531922222222@s.whatsapp.net"
const first = (): Row => mocks.rows[0]! as Row
const page = (fromMe: boolean) => ({ total: 1, pages: 1, page: 1, records: [{ key: { id: `m-${Math.random()}`, remoteJid: A, fromMe }, message: { conversation: "kkkk bora" } }] })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.rows.length = 0
    mocks.jobs.length = 0
    mocks.messages.mockReset()
    mocks.messages.mockResolvedValue(page(true))
    mocks.writeVersion.mockReset()
    mocks.writeVersion.mockResolvedValue("v1")
    mocks.inference.mockResolvedValue({ blocks: [{ key: "emojis", title: "Emojis, risadas e pontuação", content: "Usa kkkk" }], variant: null })
})

describe("análise de personalidade", () => {
    it("bloqueia uma segunda análise enquanto outra está em andamento", async () => {
        await startAnalysis({ scope: "selected", jids: [A], months: 6 }, "local")
        await expect(startAnalysis({ scope: "selected", jids: [A], months: 6 }, "local")).rejects.toThrow("Já há uma análise em andamento")
    })

    it("lê as conversas, marca as sem conteúdo útil, publica o progresso e aplica a versão", async () => {
        mocks.messages.mockImplementation(async (_instance: string, input: { remoteJid: string }) => page(input.remoteJid === A))
        await startAnalysis({ scope: "selected", jids: [A, B], months: 6 }, "local")
        await mocks.jobs[0]!()
        const row = mocks.rows[0]! as Row
        expect(row).toMatchObject({ status: "done", versionId: "v1" })
        expect(row.chats).toEqual([{ jid: A, state: "read" }, { jid: B, state: "empty" }])
        expect(mocks.publish).toHaveBeenCalledWith("secretary-analysis-updated", { id: row._id })
        expect(mocks.writeVersion).toHaveBeenCalledWith(expect.objectContaining({ base: expect.objectContaining({ blocks: expect.arrayContaining([expect.objectContaining({ key: "emojis", content: "Usa kkkk" })]) }) }), "analysis", "local", "v0")
    })

    it("cancelar mantém o que já foi aplicado numa versão \"Análise cancelada\"", async () => {
        await startAnalysis({ scope: "selected", jids: [A, B], months: 6 }, "local")
        let calls = 0
        mocks.inference.mockImplementation(async () => {
            if (++calls === 1) return { blocks: [{ key: "tom", title: "Tom e formalidade", content: "Informal" }], variant: null }
            throw new Error("não deveria ler a segunda")
        })
        mocks.messages.mockImplementationOnce(async () => page(true)).mockImplementationOnce(async () => {
            await cancelAnalysis(mocks.rows[0]!._id)
            return page(true)
        })
        await mocks.jobs[0]!()
        expect(mocks.rows[0]).toMatchObject({ status: "cancelled" })
        expect(mocks.writeVersion).toHaveBeenCalledWith(expect.objectContaining({ base: expect.objectContaining({ blocks: expect.arrayContaining([expect.objectContaining({ key: "tom", content: "Informal" })]) }) }), "analysis-cancelled", "local")
    })

    it("a ferramenta report_progress persiste a descoberta e publica o progresso", async () => {
        mocks.inference.mockImplementationOnce(async (input: { tools: { report_progress: { execute: (args: { discovery: string }) => Promise<unknown> } } }) => {
            await input.tools.report_progress.execute({ discovery: "Usa kkkk em vez de haha" })
            return { blocks: [], variant: null }
        })
        await startAnalysis({ scope: "selected", jids: [A], months: 6 }, "local")
        mocks.publish.mockClear()
        await mocks.jobs[0]!()
        expect(first().discoveries).toEqual(["Usa kkkk em vez de haha"])
        expect(mocks.publish).toHaveBeenCalledWith("secretary-analysis-updated", { id: first()._id })
    })

    it("falha numa conversa marca só ela e a análise segue até o fim", async () => {
        mocks.messages.mockImplementation(async (_instance: string, input: { remoteJid: string }) => {
            if (input.remoteJid === A) throw new Error("timeout da Evolution")
            return page(true)
        })
        await startAnalysis({ scope: "selected", jids: [A, B], months: 6 }, "local")
        await mocks.jobs[0]!()
        expect(first()).toMatchObject({ status: "done" })
        expect(first().chats).toEqual([
            { jid: A, state: "failed" },
            { jid: B, state: "read" },
        ])
    })

    it("personalidade editada durante a análise guarda o aprendizado numa versão não aplicada", async () => {
        mocks.writeVersion.mockImplementation(async (...args: unknown[]) => {
            if (args[1] === "analysis") throw new DomainError(409, "mudou", "SECRETARY_PERSONALITY_CHANGED")
            return "v-unapplied"
        })
        await startAnalysis({ scope: "selected", jids: [A], months: 6 }, "local")
        await mocks.jobs[0]!()
        expect(first()).toMatchObject({ status: "failed", versionId: "v-unapplied" })
        expect(String(first().error)).toContain("editada durante a análise")
        expect(mocks.writeVersion).toHaveBeenLastCalledWith(expect.anything(), "analysis-unapplied", "local")
    })

    it("iniciar e cancelar são auditados com contagens, sem texto de mensagem", async () => {
        await startAnalysis({ scope: "selected", jids: [A, B], months: 6 }, "local")
        await cancelAnalysis(first()._id, "local")
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entidade: "AgenteSecretario", depois: expect.objectContaining({ acao: "iniciar análise", conversas: 2 }) }))
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ depois: { acao: "cancelar análise" } }))
    })

    it("cancelar sem análise em andamento é recusado", async () => {
        await expect(cancelAnalysis("nada", "local")).rejects.toThrow("não está em andamento")
    })
})
