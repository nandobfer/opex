/** @vitest-environment jsdom */

import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("framer-motion", () => {
    const MOTION_PROPS = new Set(["initial", "animate", "exit", "variants", "transition", "layout"])
    const passthrough = (tag: string) =>
        function Motion({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
            const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)))
            return React.createElement(tag, domProps, children)
        }
    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({} as Record<string, ReturnType<typeof passthrough>>, {
            get: (cache, tag: string) => (cache[tag] ??= passthrough(tag)),
        }),
    }
})

import { OperationPanel, prettyBody } from "@/features/integrations/components/explorer/OperationPanel"
import { filterOperations } from "@/features/integrations/components/explorer/IntegrationExplorer"
import { parseOpenApiSpec } from "@/features/integrations/openapi/parser"

const spec = parseOpenApiSpec({
    openapi: "3.0.3",
    info: { title: "RFC", version: "1" },
    paths: {
        "/jobs/{id}": {
            get: {
                summary: "Consulta job",
                parameters: [{ name: "id", in: "path", schema: { type: "string" } }],
                responses: { "200": { description: "OK" } },
            },
        },
        "/jobs": {
            post: {
                summary: "Enfileira",
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: { type: "object", properties: { tslips: { type: "array", items: { type: "string" } } } } } },
                },
                responses: { "202": { description: "Aceito" } },
            },
        },
    },
})
const getOp = spec.operations.find((o) => o.key === "GET /jobs/{id}")!
const postOp = spec.operations.find((o) => o.key === "POST /jobs")!

const execute = vi.fn()
const result = { status: 200, statusText: "OK", headers: {}, contentType: "application/json", body: '{"state":"concluido"}', truncated: false, latencyMs: 42, url: "https://rfc/jobs/1" }

beforeEach(() => {
    vi.clearAllMocks()
    execute.mockResolvedValue(result)
})

const renderPanel = (operation = getOp, blockedReason?: string) =>
    render(
        <OperationPanel
            operation={operation}
            schemas={spec.schemas}
            integrationName="RFC Tradeslip"
            onOpenSchema={vi.fn()}
            execute={execute}
            blockedReason={blockedReason}
        />,
    )

describe("OperationPanel (explorador)", () => {
    it("valida o parâmetro de caminho obrigatório antes de executar", async () => {
        renderPanel()
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Executar/ }))
        })
        expect(screen.getByText("Obrigatório")).toBeTruthy()
        expect(execute).not.toHaveBeenCalled()
    })

    it("GET executa direto e mostra status, latência e JSON formatado", async () => {
        renderPanel()
        fireEvent.change(screen.getByLabelText(/^id/), { target: { value: "1" } })
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Executar/ }))
        })
        expect(execute).toHaveBeenCalledWith({ operation: "GET /jobs/{id}", path: { id: "1" }, query: {}, headers: {}, body: undefined })
        const response = screen.getByTestId("explorer-response")
        expect(response.textContent).toContain("200 OK")
        expect(response.textContent).toContain("42 ms")
        expect(response.textContent).toContain('"state": "concluido"')
    })

    it("POST pede confirmação e envia o corpo gerado pelo schema", async () => {
        renderPanel(postOp)
        const body = screen.getByLabelText("Corpo da requisição") as HTMLTextAreaElement
        expect(JSON.parse(body.value)).toEqual({ tslips: ["string"] })

        fireEvent.click(screen.getByRole("button", { name: /Executar/ }))
        expect(execute).not.toHaveBeenCalled()
        expect(screen.getByText(/pode alterar dados em RFC Tradeslip/)).toBeTruthy()

        await act(async () => {
            fireEvent.click(screen.getAllByRole("button", { name: "Executar" }).at(-1)!)
        })
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ operation: "POST /jobs", body: body.value }))
    })

    it("JSON inválido no corpo bloqueia a execução", () => {
        renderPanel(postOp)
        fireEvent.change(screen.getByLabelText("Corpo da requisição"), { target: { value: "{tslips:" } })
        expect(screen.getByText(/^JSON inválido/)).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Executar/ }))
        expect(screen.queryByText(/pode alterar dados/)).toBeNull()
    })

    it("sem URL base, Executar fica desabilitado com o motivo", () => {
        renderPanel(getOp, "Sem URL base para executar")
        expect(screen.getByRole("button", { name: /Executar/ }).hasAttribute("disabled")).toBe(true)
        expect(screen.getByText("Sem URL base para executar")).toBeTruthy()
    })

    it("falha da API aparece como alerta em pt-BR", async () => {
        execute.mockRejectedValue(new Error("x"))
        renderPanel()
        fireEvent.change(screen.getByLabelText(/^id/), { target: { value: "1" } })
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Executar/ }))
        })
        expect(screen.getByRole("alert").textContent).toBe("Não foi possível executar a operação")
    })
})

describe("utilitários do explorador", () => {
    it("busca por caminho, resumo ou método", () => {
        expect(filterOperations(spec.operations, "enfileira").map((o) => o.key)).toEqual(["POST /jobs"])
        expect(filterOperations(spec.operations, "get").map((o) => o.key)).toEqual(["GET /jobs/{id}"])
        expect(filterOperations(spec.operations, "")).toHaveLength(2)
    })

    it("prettyBody formata JSON e preserva texto", () => {
        expect(prettyBody('{"a":1}', "application/json")).toBe('{\n  "a": 1\n}')
        expect(prettyBody("ok", "text/plain")).toBe("ok")
    })
})
