import { describe, expect, it } from "vitest"
import { evaluateAudience } from "@/features/secretary-agent/criteria"
import { DEFAULT_SECRETARY_SETTINGS } from "@/features/secretary-agent/schemas"

const PN = "554196988060@s.whatsapp.net"
const LID = "158879933534209@lid"
const criteria = (audience: Partial<typeof DEFAULT_SECRETARY_SETTINGS.criteria.audience>) => ({
    ...DEFAULT_SECRETARY_SETTINGS.criteria,
    audience: { ...DEFAULT_SECRETARY_SETTINGS.criteria.audience, ...audience },
})

describe("critérios com as duas identidades da conversa (OPE-207)", () => {
    it("Nunca responder salvo no @lid vale para a conversa pelo número", () => {
        expect(evaluateAudience(criteria({ blocked: [LID] }), { jid: PN, aliases: [LID], isGroup: false, mentioned: false }).failure?.rule).toBe("blocked")
        expect(evaluateAudience(criteria({ blocked: [LID] }), { jid: PN, isGroup: false, mentioned: false }).failure).toBeNull()
    })

    it("escolhido pelo @lid continua escolhido pelo número", () => {
        expect(evaluateAudience(criteria({ mode: "selected", selected: [LID] }), { jid: PN, aliases: [LID], isGroup: false, mentioned: false }).failure).toBeNull()
        expect(evaluateAudience(criteria({ mode: "selected", selected: [LID] }), { jid: PN, isGroup: false, mentioned: false }).failure?.rule).toBe("not-selected")
    })
})
