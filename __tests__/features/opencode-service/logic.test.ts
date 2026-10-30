import { describe, expect, it } from "vitest"
import { logsCommand, sanitizeLogs, serviceCommand, servicePidCommand, upgradeCommand, withBin } from "@/features/opencode-service/commands"
import { formatUptime } from "@/features/opencode-service/format"
import { portOf, resolveUpgradeTarget, updateInfo } from "@/features/opencode-service/logic"
import { serviceNoticeText } from "@/features/opencode-service/server/opex-notice"
import { fingerprintOf, hostOfUrl } from "@/features/opencode-service/server/ssh"

describe("versão disponível com a trava da 2.x", () => {
    const versions = ["2.2.1", "2.2.2", "2.3.0-beta.1", "3.0.1", "0.0.0-dev-287"]

    it("separa a última 2.x da major nova", () => {
        expect(updateInfo("2.2.1", versions)).toEqual({ current: "2.2.1", latestSupported: "2.2.2", latestMajor: "3.0.1", available: true })
        expect(updateInfo("2.2.2", ["2.2.2"])).toMatchObject({ latestMajor: null, available: false })
    })

    it("sem pedido vai para a última 2.x; major nova só com allowMajor", () => {
        const info = updateInfo("2.2.1", versions)
        expect(resolveUpgradeTarget(info, undefined, false)).toEqual({ version: "2.2.2" })
        expect(resolveUpgradeTarget(info, "3.0.1", false)).toMatchObject({ error: expect.stringMatching(/major nova/) })
        expect(resolveUpgradeTarget(info, "v3.0.1", true)).toEqual({ version: "3.0.1" })
        expect(resolveUpgradeTarget(info, "1.9.0", true)).toMatchObject({ error: expect.stringMatching(/2\.x/) })
        expect(resolveUpgradeTarget(updateInfo("2.2.2", versions), undefined, false)).toMatchObject({ error: expect.stringMatching(/mais recente/) })
    })

    it("porta pela URL", () => {
        expect(portOf("http://0.0.0.0:5050")).toBe(5050)
        expect(portOf("https://x.dev")).toBe(443)
        expect(portOf("nada")).toBeNull()
    })
})

describe("comandos por SSH", () => {
    it("põe a pasta do executável no PATH e cita tudo", () => {
        expect(withBin("/h/.nvm/bin/opencode", "--version")).toBe(`PATH='/h/.nvm/bin':"$PATH" '/h/.nvm/bin/opencode' --version`)
        expect(serviceCommand("opencode", "restart")).toBe(`'opencode' service restart`)
        expect(upgradeCommand("/b/opencode", "2.2.2")).toContain(`upgrade '2.2.2' && PATH='/b':"$PATH" '/b/opencode' service restart`)
        expect(() => upgradeCommand("/b/opencode", "2.2.2; rm -rf /")).toThrow()
        expect(servicePidCommand()).toContain("[o]pencode")
        expect(logsCommand(5000)).toContain("tail -n 1000")
    })

    it("logs sem cores e sem linhas que parecem segredo", () => {
        expect(sanitizeLogs("\u001b[32mok\u001b[0m\npassword=abc\nAuthorization: Basic x\nfim")).toBe("ok\n[linha omitida: pode conter segredo]\n[linha omitida: pode conter segredo]\nfim")
    })

    it("impressão digital SHA256 da chave do host e host da URL", () => {
        expect(fingerprintOf(Buffer.from("chave"))).toMatch(/^SHA256:[A-Za-z0-9+/]+$/)
        expect(hostOfUrl("http://192.168.0.10:5050")).toBe("192.168.0.10")
        expect(hostOfUrl(undefined)).toBeNull()
    })
})

describe("formatação e aviso ao Agente Opex", () => {
    it("tempo no ar", () => {
        expect(formatUptime(40)).toBe("40 s")
        expect(formatUptime(125)).toBe("2 min")
        expect(formatUptime(3_900)).toBe("1 h 05 min")
        expect(formatUptime(90_000)).toBe("1 d 1 h")
        expect(formatUptime(null)).toBe("—")
    })

    it("texto do aviso de fim de operação", () => {
        const base = { id: "1", action: "upgrade" as const, fromVersion: "2.2.1", output: "", origin: "opex-agent" as const, startedAt: "", finishedAt: "" }
        expect(serviceNoticeText({ ...base, status: "succeeded", toVersion: "2.2.2", error: null }).display).toBe("OpenCode atualizado")
        expect(serviceNoticeText({ ...base, status: "failed", toVersion: "2.2.2", error: "npm falhou" }).text).toContain("npm falhou")
    })
})
