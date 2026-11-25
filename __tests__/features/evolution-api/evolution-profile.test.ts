import { describe, expect, it } from "vitest"
import { formatPhoneNumber, profileSecondLine } from "@/features/evolution-api/phone"
import { filledProfileFields } from "@/features/evolution-api/webhook-parse"

describe("formatPhoneNumber", () => {
    it("formata celular e fixo do Brasil", () => {
        expect(formatPhoneNumber("5541984556795")).toBe("+55 (41) 9 8455-6795")
        expect(formatPhoneNumber("554133334444")).toBe("+55 (41) 3333-4444")
    })

    it("outros países só ganham o + e entrada sem dígitos devolve null", () => {
        expect(formatPhoneNumber("14155552671")).toBe("+14155552671")
        expect(formatPhoneNumber("")).toBeNull()
        expect(formatPhoneNumber(null)).toBeNull()
        expect(formatPhoneNumber("abc")).toBeNull()
    })
})

describe("profileSecondLine", () => {
    it("junta o @usuário e o número formatado; sem usuário, só o número", () => {
        expect(profileSecondLine("nandoburgos", "5541984556795")).toBe("@nandoburgos · +55 (41) 9 8455-6795")
        expect(profileSecondLine("@nando", null)).toBe("@nando")
        expect(profileSecondLine(null, "5541984556795")).toBe("+55 (41) 9 8455-6795")
        expect(profileSecondLine("  ", null)).toBeNull()
    })
})

describe("filledProfileFields", () => {
    it("ignora campos vazios para não apagar o perfil já salvo", () => {
        expect(filledProfileFields({ ownerJid: "5541@s.whatsapp.net", profileName: null, profilePictureUrl: "" })).toEqual({ ownerJid: "5541@s.whatsapp.net" })
    })
})
