/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

/** Padrão global da aba "Agente Desenvolvedor" (o que a central herda). */
const settingsData = {
    settings: {
        enabled: true,
        agents: { planning: { agent: null, model: null, variant: null }, implementation: { agent: null, model: null, variant: null }, build: { agent: null, model: null, variant: null }, pr: { agent: null, model: null, variant: null }, fork: { agent: null, model: null, variant: null } },
        columns: { queue: "fila", onStart: "doing", onPr: "pr", onDone: "done" },
    },
    isDefault: false,
    availability: { available: true, reason: null },
    updatedAt: null,
}
vi.mock("@/features/agentic/hooks/useAgentic", () => ({ useAgenticSettings: () => ({ data: settingsData, isLoading: false, isError: false, error: null }) }))

const boardColumns = [
    { key: "fila", label: "Fila" },
    { key: "doing", label: "Em Andamento" },
    { key: "pr", label: "Revisão" },
    { key: "done", label: "Concluído" },
]
vi.mock("@/features/tasks/hooks/useTaskBoard", () => ({ useTaskBoard: () => ({ columns: boardColumns, isLoading: false }) }))

import { ColumnsSection } from "@/features/agentic/components/central/ColumnsSection"
import { ColumnsCard } from "@/features/agentic/components/settings/ColumnsCard"
import { centralConfigSchema, defaultCentralConfig, type CentralConfig, type CentralConfigInput } from "@/features/agentic/schemas"

function Harness({ columns }: { columns?: Partial<CentralConfigInput["columns"]> }) {
    const base = defaultCentralConfig("/home/u/app")
    const form = useForm<CentralConfigInput, unknown, CentralConfig>({ resolver: zodResolver(centralConfigSchema), mode: "onChange", defaultValues: { ...base, columns: { ...base.columns, ...columns } } })
    const inheritQueue = useWatch({ control: form.control, name: "columns.inheritQueue" })
    const queue = useWatch({ control: form.control, name: "columns.queue" })
    return (
        <>
            <ColumnsSection form={form} />
            <output data-testid="inherit-queue">{String(inheritQueue)}</output>
            <output data-testid="queue">{String(queue)}</output>
        </>
    )
}

function GlobalHarness() {
    const [value, setValue] = React.useState<string | null>(null)
    return (
        <>
            <ColumnsCard title="Fila global" description="Padrão de todas as centrais." idPrefix="g" fields={[{ id: "g-queue", label: "Coluna da fila", noneLabel: "Nenhuma", value, onChange: setValue }]} />
            <output data-testid="g-value">{String(value)}</output>
        </>
    )
}

afterEach(cleanup)

describe("fila e movimentação da central (OPE-79)", () => {
    it("herdando, mostra o padrão global e esconde os campos", () => {
        render(<Harness />)

        expect(screen.queryByLabelText("Coluna que inicia a mesa automaticamente")).toBeNull()
        expect(screen.queryByLabelText("Ao abrir o Pull Request")).toBeNull()
        // O resumo usa o nome das colunas globais, não a chave.
        expect(screen.getByText("Fila")).toBeTruthy()
        expect(screen.getByText("Em Andamento")).toBeTruthy()
        expect(screen.getByText("Revisão")).toBeTruthy()
        expect(screen.getByText("Concluído")).toBeTruthy()
    })

    it("personalizar libera os campos e grava o modo no formulário", () => {
        render(<Harness />)
        fireEvent.click(screen.getAllByRole("radio", { name: "Personalizar" })[0]!)

        expect(screen.getByTestId("inherit-queue").textContent).toBe("false")
        expect(screen.getByLabelText("Coluna que inicia a mesa automaticamente").textContent).toBe("Nenhuma")
    })

    it("central personalizada mostra a coluna salva e pode voltar ao padrão global", () => {
        render(<Harness columns={{ inheritQueue: false, queue: "doing" }} />)
        expect(screen.getByLabelText("Coluna que inicia a mesa automaticamente").textContent).toBe("Em Andamento")

        fireEvent.click(screen.getAllByRole("radio", { name: "Padrão global" })[0]!)

        expect(screen.getByTestId("inherit-queue").textContent).toBe("true")
        // Voltar a herdar não apaga o valor personalizado (ele volta se personalizar de novo).
        expect(screen.getByTestId("queue").textContent).toBe("doing")
        expect(screen.queryByLabelText("Coluna que inicia a mesa automaticamente")).toBeNull()
    })

    it("a movimentação herda independente da fila", () => {
        render(<Harness columns={{ inheritQueue: false, queue: "doing", inheritMovement: true }} />)

        expect(screen.getByLabelText("Coluna que inicia a mesa automaticamente")).toBeTruthy()
        expect(screen.queryByLabelText("Ao abrir a mesa (implementação)")).toBeNull()
    })

    it("escolher outra coluna grava o valor no formulário", () => {
        render(<Harness columns={{ inheritQueue: false, queue: "doing" }} />)
        fireEvent.click(screen.getByLabelText("Coluna que inicia a mesa automaticamente"))
        fireEvent.click(screen.getByRole("option", { name: "Fila" }))

        expect(screen.getByTestId("queue").textContent).toBe("fila")
    })
})

describe("ColumnsCard no escopo global", () => {
    it("edita o padrão direto, sem o modo de herança", () => {
        render(<GlobalHarness />)

        expect(screen.queryByRole("radio")).toBeNull()
        expect(screen.getByLabelText("Coluna da fila").textContent).toBe("Nenhuma")

        fireEvent.click(screen.getByLabelText("Coluna da fila"))
        fireEvent.click(screen.getByRole("option", { name: "Fila" }))

        expect(screen.getByTestId("g-value").textContent).toBe("fila")
    })
})
