/** @vitest-environment jsdom */

import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { AgentConfigFields } from "@/features/agentic/components/settings/AgentConfigFields"
import type { AgentConfig } from "@/features/agentic/schemas"
import type { AiAgentDto } from "@/lib/ai/providers"

const EMPTY: AgentConfig = { agent: null, model: null, variant: null, fallbacks: [] }
const models = { data: [], isError: false, isLoading: false, error: null }

/** Dentro de um <form>, como na aba "Agente Adversário" (AiEditorForm). */
function renderFields(value: AgentConfig, onChange: (next: AgentConfig | null) => void, agents: AiAgentDto[] | undefined) {
    const fields = (current: AgentConfig) => (
        <form>
            <AgentConfigFields id="adversarial-agent" value={current} onChange={onChange} agents={{ data: agents, isError: false, error: null }} models={models} />
        </form>
    )
    const view = render(fields(value))
    return { ...view, rerenderWith: (next: AgentConfig) => view.rerender(fields(next)) }
}

const agentTrigger = () => screen.getByRole("combobox")

afterEach(() => cleanup())

describe("AgentConfigFields: inicialização do agente salvo", () => {
    it("não altera o valor quando o form.reset traz o agente salvo (regressão MT-3)", () => {
        const onChange = vi.fn()
        const { rerenderWith } = renderFields(EMPTY, onChange, undefined)
        rerenderWith({ ...EMPTY, agent: "build" })
        expect(onChange).not.toHaveBeenCalled()
        expect(agentTrigger().textContent).toContain("build")
    })

    it("mostra o nome do agente salvo quando a lista já o inclui", () => {
        renderFields({ ...EMPTY, agent: "build" }, vi.fn(), [{ id: "build", name: "Build" } as AiAgentDto])
        expect(agentTrigger().textContent).toContain("Build")
    })

    it("escolher 'Padrão do servidor' envia agent null", () => {
        const onChange = vi.fn()
        const { container } = renderFields({ ...EMPTY, agent: "build" }, onChange, [{ id: "build", name: "Build" } as AiAgentDto])
        const native = container.querySelector("select")
        expect(native).toBeTruthy()
        fireEvent.change(native!, { target: { value: "__default__" } })
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ agent: null }))
    })
})
