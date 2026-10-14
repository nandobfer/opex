import { describe, expect, it } from "vitest"
import { applyEnvChanges, diffEnvRows, isSecretEnvKey, parseEnvFile } from "@/features/environments/logic"

describe("logic — chaves sensíveis do .env", () => {
    it("detecta chaves de segredo e libera as comuns", () => {
        for (const key of ["DB_PASSWORD", "API_TOKEN", "JWT_SECRET", "AWS_ACCESS_KEY", "CONNECTION_STRING", "AUTH_SALT"]) {
            expect(isSecretEnvKey(key)).toBe(true)
        }
        for (const key of ["NODE_ENV", "PORT", "APP_NAME", "LOG_LEVEL"]) {
            expect(isSecretEnvKey(key)).toBe(false)
        }
    })

    it("trata chave desconhecida que casa o padrão como sensível (protege por padrão)", () => {
        expect(isSecretEnvKey("STRIPE_WEBHOOK_SIGNING_SECRET")).toBe(true)
    })
})

describe("logic — leitura do .env", () => {
    it("preserva comentários, linhas vazias e a ordem", () => {
        const content = ["# comentário", "", "NODE_ENV=production", "PORT=3000", "export FLAG=1"].join("\n")
        const parsed = parseEnvFile(content)
        expect(parsed.lines).toHaveLength(5)
        expect(parsed.assignments.map((item) => item.key)).toEqual(["NODE_ENV", "PORT", "FLAG"])
        expect(parsed.assignments[1]!.value).toBe("3000")
    })

    it("remove as aspas externas e interpreta escapes", () => {
        const parsed = parseEnvFile('A="linha\\ncom aspas \\"x\\""\nB=\'simples\'')
        expect(parsed.assignments[0]!.value).toBe('linha\ncom aspas "x"')
        expect(parsed.assignments[1]!.value).toBe("simples")
    })

    it("interpreta valor multilinha entre aspas", () => {
        const parsed = parseEnvFile('CERT="linha1\nlinha2"\nOUTRO=1')
        expect(parsed.assignments[0]!.key).toBe("CERT")
        expect(parsed.assignments[0]!.value).toBe("linha1\nlinha2")
        expect(parsed.assignments[0]!.end).toBe(1)
        expect(parsed.assignments[1]!.key).toBe("OUTRO")
    })
})

describe("logic — gravação do .env", () => {
    it("altera só a chave pedida, preservando o restante do arquivo", () => {
        const parsed = parseEnvFile("# cabeçalho\nNODE_ENV=production\nPORT=3000\n")
        const next = applyEnvChanges(parsed, [{ key: "PORT", value: "4000" }])
        expect(next).toContain("# cabeçalho")
        expect(next).toContain("NODE_ENV=production")
        expect(next).toContain("PORT=4000")
        expect(next).not.toContain("PORT=3000")
    })

    it("adiciona chave nova no fim e remove a pedida", () => {
        const parsed = parseEnvFile("A=1\nB=2\n")
        const next = applyEnvChanges(parsed, [
            { key: "B", value: null },
            { key: "C", value: "novo valor" },
        ])
        expect(next).not.toContain("B=2")
        expect(next).toContain("A=1")
        expect(next).toContain('C="novo valor"')
    })

    it("remove as linhas de um valor multilinha por inteiro", () => {
        const parsed = parseEnvFile('CERT="l1\nl2"\nDEPOIS=ok\n')
        const next = applyEnvChanges(parsed, [{ key: "CERT", value: null }])
        expect(next).not.toContain("l1")
        expect(next).not.toContain("l2")
        expect(next).toContain("DEPOIS=ok")
    })

    it("escapa valores com caracteres especiais ao reescrever", () => {
        const parsed = parseEnvFile("A=1\n")
        const next = applyEnvChanges(parsed, [{ key: "A", value: 'a"b#c' }])
        expect(next).toContain('A="a\\"b#c"')
    })
})

describe("logic — diff das variáveis editadas", () => {
    const original = [
        { key: "NODE_ENV", value: "production", secret: false },
        { key: "DB_PASSWORD", value: "", secret: true },
    ]

    it("envia apenas o que mudou", () => {
        const changes = diffEnvRows(original, [
            { key: "NODE_ENV", value: "production", secret: false },
            { key: "DB_PASSWORD", value: "", secret: true },
        ])
        expect(changes).toEqual([])
    })

    it("envia alteração de valor público, inclusão e remoção", () => {
        const changes = diffEnvRows(original, [
            { key: "NODE_ENV", value: "development", secret: false },
            { key: "DB_PASSWORD", value: "", secret: true },
            { key: "PORT", value: "3000", secret: false },
        ])
        expect(changes).toEqual([
            { key: "NODE_ENV", value: "development" },
            { key: "PORT", value: "3000" },
        ])
    })

    it("só envia segredo quando o usuário digita um substituto", () => {
        const changes = diffEnvRows(original, [
            { key: "NODE_ENV", value: "production", secret: false },
            { key: "DB_PASSWORD", value: "novo", secret: true },
        ])
        expect(changes).toEqual([{ key: "DB_PASSWORD", value: "novo" }])
    })

    it("remove a chave que saiu da lista", () => {
        const changes = diffEnvRows(original, [{ key: "NODE_ENV", value: "production", secret: false }])
        expect(changes).toEqual([{ key: "DB_PASSWORD", value: null }])
    })
})
