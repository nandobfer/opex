/** @vitest-environment happy-dom */

import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { PreviewPortsField } from "@/features/agentic/components/central/PreviewPortsField"
import { centralConfigSchema, defaultCentralConfig, type CentralConfig, type CentralConfigInput } from "@/features/agentic/schemas"

/** Card Prévia da central: switch "Personalizar portas" (desligado = faixa padrão global nos campos desabilitados). */

afterEach(() => cleanup())

function Harness({ inheritPorts, onInherit }: { inheritPorts: boolean; onInherit?: (value: boolean | undefined) => void }) {
    const base = defaultCentralConfig("/repo")
    const form = useForm<CentralConfigInput, unknown, CentralConfig>({ defaultValues: { ...base, environment: { ...base.environment, inheritPorts, previewPortMin: 7000, previewPortMax: 7010 } } })
    const inherit = useWatch({ control: form.control, name: "environment.inheritPorts" })
    onInherit?.(inherit)
    return <PreviewPortsField form={form} global={{ previewPortMin: 5002, previewPortMax: 5998 }} />
}

/** Com o mesmo schema da tela da central: expõe se os valores do formulário passam (o que habilita o Salvar). */
function ValidatedHarness() {
    const base = defaultCentralConfig("/repo")
    const form = useForm<CentralConfigInput, unknown, CentralConfig>({ resolver: zodResolver(centralConfigSchema), mode: "onChange", defaultValues: { ...base, environment: { ...base.environment, inheritPorts: true, previewPortMin: 7000, previewPortMax: 7010 } } })
    const values = useWatch({ control: form.control })
    return (
        <>
            <PreviewPortsField form={form} global={{ previewPortMin: 5002, previewPortMax: 5998 }} />
            <span data-testid="valid">{String(centralConfigSchema.safeParse(values).success)}</span>
            <span data-testid="values">{`${values.environment?.previewPortMin}-${values.environment?.previewPortMax}`}</span>
        </>
    )
}

const minInput = () => screen.getByLabelText("Porta inicial da prévia") as HTMLInputElement
const maxInput = () => screen.getByLabelText("Porta final da prévia") as HTMLInputElement
const customSwitch = () => screen.getByRole("switch", { name: "Personalizar portas" })

describe("PreviewPortsField", () => {
    it("switch desligado: campos desabilitados com a faixa padrão global", () => {
        render(<Harness inheritPorts />)
        expect(customSwitch().getAttribute("aria-checked")).toBe("false")
        expect(minInput().disabled).toBe(true)
        expect(maxInput().disabled).toBe(true)
        expect(minInput().value).toBe("5002")
        expect(maxInput().value).toBe("5998")
    })

    it("central personalizada: switch ligado e campos editáveis com a faixa própria", () => {
        render(<Harness inheritPorts={false} />)
        expect(customSwitch().getAttribute("aria-checked")).toBe("true")
        expect(minInput().disabled).toBe(false)
        expect(minInput().value).toBe("7000")
        expect(maxInput().value).toBe("7010")
    })

    it("ligar o switch habilita os campos com os valores padrão exibidos e desliga a herança", () => {
        const onInherit = vi.fn()
        render(<Harness inheritPorts onInherit={onInherit} />)
        fireEvent.click(customSwitch())
        expect(minInput().disabled).toBe(false)
        expect(minInput().value).toBe("5002")
        expect(maxInput().value).toBe("5998")
        expect(onInherit).toHaveBeenLastCalledWith(false)
    })

    it("desligar com a faixa própria inválida não bloqueia o Salvar", async () => {
        render(<ValidatedHarness />)
        await waitFor(() => expect(screen.getByTestId("valid").textContent).toBe("true"))
        fireEvent.click(customSwitch())
        // Faixa invertida e porta final vazia (NaN): inválido enquanto personalizada.
        fireEvent.change(minInput(), { target: { value: "9000" } })
        fireEvent.change(maxInput(), { target: { value: "" } })
        await waitFor(() => expect(screen.getByTestId("valid").textContent).toBe("false"))
        await act(async () => {
            fireEvent.click(customSwitch())
        })
        await waitFor(() => expect(screen.getByTestId("valid").textContent).toBe("true"))
        // A porta vazia volta à salva; a inicial válida (mesmo invertida) é mantida como ponto de partida.
        expect(screen.getByTestId("values").textContent).toBe("9000-7010")
        expect(minInput().value).toBe("5002")
    })
})
