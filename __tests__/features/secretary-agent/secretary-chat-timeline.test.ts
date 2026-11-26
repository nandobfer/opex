import { describe, expect, it } from "vitest"
import type { ChatMessageDto } from "@/features/evolution-api/chat-message"
import { buildTimelineRows, filterConversations, mergeTimelinePages, parseCoordinates, quotedAuthorLabel } from "@/features/secretary-agent/chat-timeline"
import type { ChatTimelinePageDto } from "@/features/secretary-agent/types"

const message = (id: string, timestamp: string, fromMe = false): ChatMessageDto => ({
    id, chatJid: "x", fromMe, author: null, authorName: null, timestamp, kind: "text", text: id, media: null, quoted: null, location: null, contacts: [], reactions: [], edited: false, status: null,
})
const page = (n: number, items: ChatMessageDto[], decisions: ChatTimelinePageDto["decisions"] = [], agentMessageIds: string[] = [], effects: ChatTimelinePageDto["effects"] = { reactions: [], edits: [], revoked: [] }): ChatTimelinePageDto => ({ page: n, items, effects, decisions, agentMessageIds, hasOlder: false })

describe("linha do tempo da aba Conversas (OPE-197)", () => {
    it("junta as páginas sem repetir mensagens nem decisões e em ordem", () => {
        const decision = { id: "d1", decision: "replied" as const, reason: "ok", at: "2026-11-26T10:00:30Z" }
        const merged = mergeTimelinePages([page(1, [message("b", "2026-11-26T10:01:00Z")], [decision], ["b"]), page(2, [message("a", "2026-11-26T10:00:00Z"), message("b", "2026-11-26T10:01:00Z")], [decision])])
        expect(merged.messages.map((item) => item.id)).toEqual(["a", "b"])
        expect(merged.decisions).toHaveLength(1)
        expect([...merged.agentIds]).toEqual(["b"])
    })

    it("reação, edição e apagar numa página valem sobre a mensagem que está em outra página", () => {
        const target = { ...message("M", "2026-11-26T09:00:00Z"), reactions: [{ emoji: "😂", fromMe: true, author: null }] }
        const newest = page(1, [message("N", "2026-11-26T11:00:00Z")], [], [], {
            reactions: [{ targetId: "M", at: "2026-11-26T10:30:00Z", reaction: { emoji: "👍", fromMe: true, author: null } }, { targetId: "M", at: "2026-11-26T10:31:00Z", reaction: { emoji: "❤️", fromMe: false, author: null } }],
            edits: [{ targetId: "E", at: "2026-11-26T10:40:00Z", text: "certo" }],
            revoked: ["X"],
        })
        const older = page(2, [target, message("E", "2026-11-26T09:01:00Z"), message("X", "2026-11-26T09:02:00Z")])
        const merged = mergeTimelinePages([newest, older])
        const byId = new Map(merged.messages.map((item) => [item.id, item]))
        expect(byId.get("M")!.reactions).toEqual([{ emoji: "👍", fromMe: true, author: null }, { emoji: "❤️", fromMe: false, author: null }])
        expect(byId.get("E")).toMatchObject({ text: "certo", edited: true })
        expect(byId.get("X")).toMatchObject({ kind: "deleted", text: "" })
    })

    it("D3: pílula da decisão entre as mensagens, selo do Secretário e cauda no primeiro balão de cada lado", () => {
        const rows = buildTimelineRows(
            [message("a", "2026-11-26T10:00:00Z"), message("b", "2026-11-26T10:01:00Z", true), message("c", "2026-11-26T10:02:00Z", true)],
            [{ id: "d1", decision: "replied", reason: "ok", at: "2026-11-26T10:00:30Z" }],
            new Set(["b"]),
            new Date("2026-11-26T12:00:00Z"),
        )
        expect(rows.map((row) => (row.type === "message" ? `${row.message.id}:${row.firstOfSequence}:${row.fromAgent}` : row.type === "divider" ? row.label : "pill"))).toEqual(["Hoje", "a:true:false", "pill", "b:true:true", "c:false:false"])
    })

    it("chips Não lidas e o filtro do estado do Secretário", () => {
        const rows = [{ unreadCount: 2, state: "active" as const }, { unreadCount: 0, state: "paused" as const }, { state: "excluded" as const }]
        expect(filterConversations(rows, "nao_lidas", [])).toEqual([rows[0]])
        expect(filterConversations(rows, "todas", ["paused", "excluded"])).toEqual([rows[1], rows[2]])
    })

    it("autor da citação e coordenadas do link do Maps", () => {
        expect(quotedAuthorLabel("5531999999999@s.whatsapp.net", "5531999999999", "Ana", false)).toBe("Ana")
        expect(quotedAuthorLabel("5541984556795@s.whatsapp.net", "5531999999999", "Ana", false)).toBe("Você")
        expect(parseCoordinates("https://www.google.com/maps/@-19.9167,-43.9345,15z")).toEqual({ latitude: -19.9167, longitude: -43.9345 })
        expect(parseCoordinates("rua tal")).toBeNull()
    })
})
