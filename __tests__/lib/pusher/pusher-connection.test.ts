import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getIntegrationConfig: vi.fn() }))

vi.mock("@/lib/integrations/config", () => ({
    getIntegration: vi.fn(),
    getIntegrationConfig: mocks.getIntegrationConfig,
}))
vi.mock("@/lib/integrations/debug", () => ({
    integrationDebug: () => ({ request: vi.fn(), response: vi.fn(), error: vi.fn() }),
}))
vi.mock("pusher-js", () => ({ default: vi.fn() }))

import { parsePusherClientUrls, parsePusherUrl } from "@/lib/pusher/url"
import { buildPusherServerOptions } from "@/lib/pusher/server"
import { buildPusherClientOptions } from "@/lib/pusher/client"
import { getPusherPublicConfig } from "@/lib/pusher/public-config"
import { findMissingConditionalField, getIntegrationDef, isPublicFieldVisible } from "@/lib/integrations/catalog"
import { buildIntegrationUpdateSchema } from "@/features/integrations/schemas/integration.schema"
import type { IntegrationConfigMap } from "@/lib/integrations/config"

type PusherValues = IntegrationConfigMap["pusher"]
const base: PusherValues = { mode: "cluster", appId: "app", key: "key", secret: "secret", cluster: "sa1" }

describe("parsePusherUrl", () => {
    it("deriva host, porta e TLS do esquema", () => {
        expect(parsePusherUrl("http://devteam-soketi:6001")).toEqual({ host: "devteam-soketi", port: 6001, useTLS: false })
        expect(parsePusherUrl("ws://localhost:6001/")).toEqual({ host: "localhost", port: 6001, useTLS: false })
        expect(parsePusherUrl("wss://soketi.exemplo.com.br")).toEqual({ host: "soketi.exemplo.com.br", port: 443, useTLS: true })
        expect(parsePusherUrl("https://soketi.exemplo.com.br:8443")).toEqual({ host: "soketi.exemplo.com.br", port: 8443, useTLS: true })
        expect(parsePusherUrl("http://soketi")).toMatchObject({ port: 80 })
    })

    it("cliente: lista separada por vírgula/espaço, com caminho opcional sem barra final", () => {
        expect(parsePusherClientUrls("ws://192.168.0.64:6001,  wss://reserva.sipal.com.br/dev_automacao/soketi/")).toEqual([
            { host: "192.168.0.64", port: 6001, useTLS: false, path: "" },
            { host: "reserva.sipal.com.br", port: 443, useTLS: true, path: "/dev_automacao/soketi" },
        ])
        for (const url of [undefined, "", " , ", "ws://ok:6001, soketi:6001", "wss://host/x#y"]) {
            expect(parsePusherClientUrls(url), String(url)).toBeNull()
        }
    })

    it("recusa vazio, esquema estranho e URL com caminho ou query", () => {
        for (const url of [undefined, "", "   ", "ftp://host", "soketi:6001", "http://host:6001/app", "wss://host?x=1"]) {
            expect(parsePusherUrl(url), String(url)).toBeNull()
        }
    })
})

describe("buildPusherServerOptions", () => {
    it("modo cluster: Pusher na nuvem com TLS (comportamento anterior)", () => {
        expect(buildPusherServerOptions(base)).toEqual({ appId: "app", key: "key", secret: "secret", cluster: "sa1", useTLS: true })
    })

    it("modo host: host/porta/TLS vêm da URL e o cluster é ignorado", () => {
        expect(buildPusherServerOptions({ ...base, mode: "host", url: "http://devteam-soketi:6001" })).toEqual({
            appId: "app",
            key: "key",
            secret: "secret",
            host: "devteam-soketi",
            port: "6001",
            useTLS: false,
        })
    })

    it("não configurado sem URL válida no modo host ou sem credenciais", () => {
        expect(buildPusherServerOptions({ ...base, mode: "host" })).toBeNull()
        expect(buildPusherServerOptions({ ...base, mode: "host", url: "http://host/caminho" })).toBeNull()
        expect(buildPusherServerOptions({ ...base, secret: undefined })).toBeNull()
    })
})

describe("buildPusherClientOptions", () => {
    it("modo host: WebSocket direto no host da URL, sem estatísticas, com o auth do CRM", () => {
        expect(buildPusherClientOptions({ key: "devteam", mode: "host", url: "ws://localhost:6001" })).toEqual({
            cluster: "",
            wsHost: "localhost",
            wsPort: 6001,
            wssPort: 6001,
            forceTLS: false,
            enabledTransports: ["ws", "wss"],
            disableStats: true,
            authEndpoint: "/api/pusher/auth",
        })
        expect(buildPusherClientOptions({ key: "k", mode: "host", url: "wss://rt.exemplo.com.br" })).toMatchObject({ forceTLS: true, wssPort: 443 })
    })

    it("vários endereços: usa o de mesmo host da página e repassa o caminho do proxy como wsPath", () => {
        const url = "ws://192.168.0.64:6001, wss://reserva.sipal.com.br/dev_automacao/soketi/"
        const viaDominio = buildPusherClientOptions({ key: "k", mode: "host", url }, { hostname: "reserva.sipal.com.br", protocol: "https:" })
        expect(viaDominio).toMatchObject({ wsHost: "reserva.sipal.com.br", wssPort: 443, forceTLS: true, wsPath: "/dev_automacao/soketi" })
        const viaIp = buildPusherClientOptions({ key: "k", mode: "host", url }, { hostname: "192.168.0.64", protocol: "http:" })
        expect(viaIp).toMatchObject({ wsHost: "192.168.0.64", wsPort: 6001, forceTLS: false })
        expect(viaIp).not.toHaveProperty("wsPath")
    })

    it("host desconhecido: página https prefere o endereço wss; sem página, o primeiro", () => {
        const url = "ws://192.168.0.64:6001,wss://reserva.sipal.com.br/soketi"
        expect(buildPusherClientOptions({ key: "k", mode: "host", url }, { hostname: "outro", protocol: "https:" })).toMatchObject({ forceTLS: true })
        expect(buildPusherClientOptions({ key: "k", mode: "host", url }, undefined)).toMatchObject({ wsHost: "192.168.0.64" })
    })

    it("modo cluster e indisponível sem key, cluster ou URL", () => {
        expect(buildPusherClientOptions({ key: "k", cluster: "sa1" })).toEqual({ cluster: "sa1", authEndpoint: "/api/pusher/auth" })
        expect(buildPusherClientOptions({ cluster: "sa1" })).toBeNull()
        expect(buildPusherClientOptions({ key: "k", mode: "host" })).toBeNull()
    })
})

describe("getPusherPublicConfig", () => {
    beforeEach(() => mocks.getIntegrationConfig.mockReset())

    it("modo host: URL pública vazia usa a URL do servidor", async () => {
        mocks.getIntegrationConfig.mockResolvedValue({ ...base, mode: "host", url: "http://localhost:6001" })
        expect(await getPusherPublicConfig()).toEqual({ key: "key", mode: "host", url: "http://localhost:6001" })
    })

    it("modo host: URL e key públicas do cliente têm prioridade", async () => {
        mocks.getIntegrationConfig.mockResolvedValue({
            ...base,
            mode: "host",
            url: "http://devteam-soketi:6001",
            clientUrl: "ws://localhost:6001",
            clientKey: "publica",
        })
        expect(await getPusherPublicConfig()).toEqual({ key: "publica", mode: "host", url: "ws://localhost:6001" })
    })

    it("modo cluster não envia URL", async () => {
        mocks.getIntegrationConfig.mockResolvedValue({ ...base, url: "http://ignorada:6001" })
        expect(await getPusherPublicConfig()).toEqual({ key: "key", mode: "cluster", cluster: "sa1" })
    })
})

describe("campos condicionais do Pusher no catálogo", () => {
    const def = getIntegrationDef("pusher")
    const field = (key: string) => def.publicFields.find((f) => f.key === key)!
    const visibleKeys = (values: Record<string, unknown>) =>
        def.publicFields.filter((f) => isPublicFieldVisible(f, def.publicFields, values)).map((f) => f.key)

    it("Conexão vazia usa o padrão cluster; host troca Cluster pelas URLs", () => {
        expect(field("mode").kind).toBe("segmented")
        expect(visibleKeys({ mode: "" })).toEqual(["mode", "appId", "key", "cluster", "clientKey", "clientCluster"])
        expect(visibleKeys({ mode: "host" })).toEqual(["mode", "appId", "key", "url", "clientKey", "clientUrl"])
    })

    it("exige o campo do modo só quando a mudança toca o modo ou o campo", () => {
        expect(findMissingConditionalField(def.publicFields, { mode: "host" }, ["mode"])?.key).toBe("url")
        expect(findMissingConditionalField(def.publicFields, { mode: "host", url: "http://h:6001" }, ["mode"])).toBeUndefined()
        expect(findMissingConditionalField(def.publicFields, { mode: "host" }, ["appId"])).toBeUndefined()
        expect(findMissingConditionalField(def.publicFields, { mode: "cluster", cluster: "" }, ["cluster"])?.key).toBe("cluster")
    })

    it("o PATCH recusa URL com caminho e modo desconhecido", () => {
        const schema = buildIntegrationUpdateSchema(def)
        expect(schema.safeParse({ publicValues: { mode: "host", url: "ws://localhost:6001" } }).success).toBe(true)
        expect(schema.safeParse({ publicValues: { url: "http://host:6001/app" } }).success).toBe(false)
        expect(schema.safeParse({ publicValues: { mode: "outro" } }).success).toBe(false)
    })

    it("URL pública do cliente aceita vários endereços com caminho e recusa qualquer um inválido", () => {
        const schema = buildIntegrationUpdateSchema(def)
        const ok = "ws://192.168.0.64:6001, wss://reserva.sipal.com.br/dev_automacao/soketi"
        expect(schema.safeParse({ publicValues: { clientUrl: ok } }).success).toBe(true)
        expect(schema.safeParse({ publicValues: { clientUrl: "ws://192.168.0.64:6001, ftp://x" } }).success).toBe(false)
        expect(schema.safeParse({ publicValues: { clientUrl: "wss://host/soketi?x=1" } }).success).toBe(false)
    })
})
