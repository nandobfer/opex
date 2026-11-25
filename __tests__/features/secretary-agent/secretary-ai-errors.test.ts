import { describe, expect, it } from "vitest"
import { providerErrorMessage } from "@/features/secretary-agent/ai-errors"

describe("providerErrorMessage", () => {
    it("identifica a recusa do formato sem publicar o corpo nem dados privados", () => {
        const reason = providerErrorMessage({ statusCode: 400, responseBody: JSON.stringify({ error: { message: "response_format inválido\nconversa privada" } }), requestBodyValues: { prompt: "prompt privado" }, responseHeaders: { authorization: "credencial" } }, "command-code")
        expect(reason).toBe("Command Code recusou a chamada (HTTP 400). O provedor não aceitou o formato da resposta.")
    })

    it("não repassa diagnósticos desconhecidos nem mensagens internas", () => {
        expect(providerErrorMessage({ statusCode: 400, responseBody: '{"error":{"message":"abcdef"}}' })).not.toContain("abcdef")
        expect(providerErrorMessage(new Error("stack privada"))).toBe("Não foi possível concluir a operação. Confira a conexão e tente novamente.")
    })
})
