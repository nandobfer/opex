/** @vitest-environment jsdom */

import React, { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("framer-motion", () => {
    const MOTION_PROPS = new Set(["initial", "animate", "exit", "variants", "transition", "whileTap", "layout"])
    const passthrough = (tag: string) =>
        function Motion({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
            const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)))
            return React.createElement(tag, domProps, children)
        }
    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: { div: passthrough("div"), p: passthrough("p"), button: passthrough("button"), span: passthrough("span") },
    }
})

import { SecretField } from "@/features/integrations/components/SecretField"
import { IntegrationStatusDot } from "@/features/integrations/components/IntegrationBadges"
import { switchScheduleType } from "@/features/integrations/components/ScheduleEditor"
import { buildIntegrationPatch } from "@/features/integrations/components/IntegrationDetailPage"
import { MANAGED_SWAGGER_DESCRIPTION, SwaggerDocsField } from "@/features/integrations/components/SwaggerDocsField"
import { formatTestEvent } from "@/features/integrations/components/IntegrationTestDialog"
import { parseNdjsonChunk } from "@/features/integrations/hooks/useIntegrationTestStream"
import { getIntegrationDef, type PublicFieldDef, type PublicFieldValue } from "@/lib/integrations/catalog"
import { PublicFieldsCard } from "@/features/integrations/components/detail/PublicFieldsCard"
import type { PublicDraft } from "@/features/integrations/components/detail/draft"
import { buildIntegrationUpdateSchema, type SecretAction } from "@/features/integrations/schemas/integration.schema"
import type { IntegrationDetailDto } from "@/features/integrations/types"

function SecretHarness({ configured, onAction }: { configured: boolean; onAction: (a: SecretAction | undefined) => void }) {
    const [action, setAction] = useState<SecretAction | undefined>()
    return (
        <SecretField
            field={{ key: "password", label: "Senha" }}
            state={{ configured, source: configured ? "db" : "none", unreadable: false }}
            action={action}
            onChange={(next) => {
                setAction(next)
                onAction(next)
            }}
            encryptionAvailable
        />
    )
}

describe("SecretField (issue #604)", () => {
    it("nunca mostra o valor salvo, só que está configurado", () => {
        render(<SecretHarness configured onAction={vi.fn()} />)
        expect(screen.getByText("Configurado")).toBeTruthy()
        expect(screen.queryByRole("textbox")).toBeNull()
    })

    it("substituir abre um campo vazio e emite a ação set", () => {
        const onAction = vi.fn()
        render(<SecretHarness configured onAction={onAction} />)
        fireEvent.click(screen.getByRole("button", { name: "Substituir" }))
        const input = screen.getByPlaceholderText(/Novo valor/) as HTMLInputElement
        expect(input.value).toBe("")
        expect(input.getAttribute("type")).toBe("password")
        fireEvent.change(input, { target: { value: "nova" } })
        expect(onAction).toHaveBeenLastCalledWith({ action: "set", value: "nova" })
    })

    it("limpar marca a remoção e desfazer volta a manter", () => {
        const onAction = vi.fn()
        render(<SecretHarness configured onAction={onAction} />)
        fireEvent.click(screen.getByRole("button", { name: "Limpar" }))
        expect(onAction).toHaveBeenLastCalledWith({ action: "clear" })
        expect(screen.getByText("Será removido ao salvar")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Desfazer" }))
        expect(onAction).toHaveBeenLastCalledWith(undefined)
    })

    it("ações são botões somente-ícone com rótulo acessível", () => {
        render(<SecretHarness configured onAction={vi.fn()} />)
        const substituir = screen.getByRole("button", { name: "Substituir" })
        expect(substituir.textContent).toBe("")
        expect(screen.getByRole("button", { name: "Limpar" }).textContent).toBe("")
    })

    it("sem valor configurado oferece Definir e não oferece Limpar", () => {
        render(<SecretHarness configured={false} onAction={vi.fn()} />)
        expect(screen.getByRole("button", { name: "Definir" })).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Limpar" })).toBeNull()
    })
})

describe("switchScheduleType", () => {
    it("preserva o horário ao trocar o tipo e aplica defaults razoáveis", () => {
        expect(switchScheduleType({ type: "daily", time: "17:30" }, "weekly")).toEqual({ type: "weekly", days: [1, 2, 3, 4, 5], time: "17:30" })
        expect(switchScheduleType({ type: "daily", time: "17:30" }, "monthly")).toEqual({ type: "monthly", day: 1, time: "17:30" })
        expect(switchScheduleType({ type: "daily", time: "17:30" }, "interval")).toEqual({ type: "interval", minutes: 60 })
        expect(switchScheduleType({ type: "interval", minutes: 5 }, "daily")).toEqual({ type: "daily", time: "08:00" })
    })
})

describe("buildIntegrationPatch", () => {
    const fields: readonly PublicFieldDef[] = [
        { key: "host", label: "Host", kind: "text" },
        { key: "port", label: "Porta", kind: "number" },
        { key: "user", label: "Usuário", kind: "text" },
    ]
    const detail = {
        environment: "interno",
        debugMode: false,
        publicValues: { host: "smtp.a", port: 587, user: null },
    } as unknown as IntegrationDetailDto

    it("envia somente o que mudou, convertendo números", () => {
        const patch = buildIntegrationPatch(fields, detail, {
            environment: "externo",
            debugMode: false,
            swaggerUrl: "",
            publicValues: { host: "smtp.a", port: "465", user: "" },
            secrets: { password: { action: "clear" } },
        })
        expect(patch).toEqual({ environment: "externo", publicValues: { port: 465 }, secrets: { password: { action: "clear" } } })
    })

    it("sem alterações devolve patch vazio", () => {
        const patch = buildIntegrationPatch(fields, detail, {
            environment: "interno",
            debugMode: false,
            swaggerUrl: "",
            publicValues: { host: "smtp.a", port: 587, user: "" },
            secrets: {},
        })
        expect(patch).toEqual({})
    })

    it("documentação Swagger: envia só quando muda, sem espaços; vazio limpa", () => {
        const base = { environment: "interno" as const, debugMode: false, publicValues: { host: "smtp.a", port: 587, user: "" }, secrets: {} }
        expect(buildIntegrationPatch(fields, detail, { ...base, swaggerUrl: " https://a/docs " })).toEqual({ swaggerUrl: "https://a/docs" })
        const saved = { ...detail, swaggerUrl: "https://a/docs" } as IntegrationDetailDto
        expect(buildIntegrationPatch(fields, saved, { ...base, swaggerUrl: "https://a/docs" })).toEqual({})
        expect(buildIntegrationPatch(fields, saved, { ...base, swaggerUrl: "" })).toEqual({ swaggerUrl: "" })
    })

    it("documentação gerenciada nunca entra no PATCH", () => {
        const base = { environment: "interno" as const, debugMode: false, publicValues: {}, secrets: {} }
        const managed = { environment: "interno", debugMode: false, publicValues: {}, swaggerUrl: "http://127.0.0.1:3100/api/openapi.json", swaggerUrlManaged: true } as unknown as IntegrationDetailDto
        expect(buildIntegrationPatch(getIntegrationDef("internal_api").publicFields, managed, { ...base, swaggerUrl: "https://outra/docs" })).toEqual({})
    })

    it("campos de card próprio nunca contam como alteração nem entram no PATCH", () => {
        const base = getIntegrationDef("pusher")
        // Campo gravado só pelo card próprio: fica fora do detalhe e do PATCH genérico.
        const def = { ...base, publicFields: [...base.publicFields, { key: "typing", label: "Digitando", kind: "boolean", group: "card" } as PublicFieldDef] }
        const publicValues = { mode: "cluster", appId: "app", key: "key", cluster: "sa1", url: null, clientKey: null, clientCluster: null, clientUrl: null }
        const saved = { environment: "externo", debugMode: false, swaggerUrl: null, publicValues } as unknown as IntegrationDetailDto
        const draft = { environment: "externo" as const, debugMode: false, swaggerUrl: "", publicValues: { ...publicValues, url: "", clientKey: "", clientCluster: "", clientUrl: "", typing: true }, secrets: {} }
        expect(buildIntegrationPatch(def.publicFields, saved, draft)).toEqual({})

        const patch = buildIntegrationPatch(def.publicFields, saved, { ...draft, publicValues: { ...draft.publicValues, appId: "app2" } })
        expect(patch).toEqual({ publicValues: { appId: "app2" } })
        expect(buildIntegrationUpdateSchema(def).safeParse(patch).success).toBe(true)
        expect(buildIntegrationUpdateSchema(def).safeParse({ publicValues: { typing: true } }).success).toBe(false)
    })
})

describe("SwaggerDocsField gerenciado", () => {
    it("mostra a URL somente leitura com a explicação e mantém Explorar disponível", () => {
        const onChange = vi.fn()
        render(
            <SwaggerDocsField
                value="https://sd/api/openapi.json"
                onChange={onChange}
                savedUrl="https://sd/api/openapi.json"
                dirty={false}
                canExplore
                managed
                onExplore={vi.fn()}
            />,
        )
        const input = screen.getByLabelText(/Documentação Swagger/) as HTMLInputElement
        expect(input.readOnly).toBe(true)
        expect(screen.getByText(MANAGED_SWAGGER_DESCRIPTION)).toBeTruthy()
        expect(screen.getByRole("button", { name: /Explorar/ }).hasAttribute("disabled")).toBe(false)
    })
})

describe("stream do teste", () => {
    it("parseNdjsonChunk entrega linhas completas e guarda o resto", () => {
        const { events, rest } = parseNdjsonChunk('{"type":"log","level":"step","message":"a","ts":"t"}\n{"type":"res')
        expect(events).toHaveLength(1)
        expect(rest).toBe('{"type":"res')
    })

    it("resultado com falha vira linha vermelha no terminal", () => {
        const line = formatTestEvent("pusher", { type: "result", ok: false, latencyMs: 5, message: "Recusado", ts: "2026-09-22T15:00:00.000Z" })
        expect(line).toContain("\x1b[31m")
        expect(line).toContain("Recusado")
    })
})

describe("IntegrationStatusDot (issue #604)", () => {
    it("mostra a bolinha azul girando enquanto um teste roda", () => {
        render(<IntegrationStatusDot health={{ status: "ok", checking: true }} />)
        const dot = screen.getByLabelText("Verificando conexão...")
        expect(dot.getAttribute("data-status")).toBe("checking")
    })

    it("volta ao status real ao terminar", () => {
        render(<IntegrationStatusDot health={{ status: "error", checking: false }} />)
        expect(screen.getByLabelText("Falha na conexão").getAttribute("data-status")).toBe("error")
    })
})

function PusherFieldsHarness({ initial }: { initial: PublicDraft }) {
    const [values, setValues] = useState<PublicDraft>(initial)
    return (
        <PublicFieldsCard
            fields={getIntegrationDef("pusher").publicFields}
            data={{ publicValues: {} } as unknown as IntegrationDetailDto}
            publicValues={values}
            setPublic={(key: string, value: PublicFieldValue | "") => setValues((prev) => ({ ...prev, [key]: value }))}
            readOnly={false}
        />
    )
}

describe("Pusher: Conexão cluster/host próprio", () => {
    it("o controle segmentado troca Cluster pelas URLs e preserva o valor escondido", () => {
        render(<PusherFieldsHarness initial={{ mode: "cluster", cluster: "sa1" }} />)
        const cluster = screen.getByRole("radio", { name: "Cluster Pusher" })
        expect(cluster.getAttribute("aria-checked")).toBe("true")
        expect((screen.getByLabelText(/^Cluster \*$/) as HTMLInputElement).value).toBe("sa1")
        expect(screen.queryByLabelText(/URL do servidor/)).toBeNull()

        fireEvent.click(screen.getByRole("radio", { name: "Host próprio" }))
        expect(screen.queryByLabelText(/^Cluster \*$/)).toBeNull()
        fireEvent.change(screen.getByLabelText(/URL do servidor/), { target: { value: "http://devteam-soketi:6001" } })
        expect(screen.getByLabelText(/URL pública do cliente/)).toBeTruthy()

        fireEvent.click(screen.getByRole("radio", { name: "Cluster Pusher" }))
        expect((screen.getByLabelText(/^Cluster \*$/) as HTMLInputElement).value).toBe("sa1")
        fireEvent.click(screen.getByRole("radio", { name: "Host próprio" }))
        expect((screen.getByLabelText(/URL do servidor/) as HTMLInputElement).value).toBe("http://devteam-soketi:6001")
    })

    it("sem modo salvo, mostra o padrão Cluster Pusher", () => {
        render(<PusherFieldsHarness initial={{}} />)
        expect(screen.getByRole("radio", { name: "Cluster Pusher" }).getAttribute("aria-checked")).toBe("true")
        expect(screen.queryByLabelText(/URL do servidor/)).toBeNull()
    })
})
