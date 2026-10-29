/** @vitest-environment happy-dom */

import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@/features/agentic/hooks/useAgentic", () => ({ useAgenticSettings: () => ({ data: { settings: { ci: { fixCi: true, ciFixLimit: 4 } } } }) }))

import { fireEvent } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"
import { GitSection } from "@/features/agentic/components/central/GitSection"
import { centralConfigSchema, defaultCentralConfig, type CentralConfig, type CentralConfigInput } from "@/features/agentic/schemas"

/** Aba "Git e PR" da central: o merge automático fica ao lado das demais opções de PR. */
function Harness() {
  const form = useForm<CentralConfigInput, unknown, CentralConfig>({ resolver: zodResolver(centralConfigSchema), mode: "onChange", defaultValues: defaultCentralConfig("/home/u/app") })
  return <GitSection form={form} />
}

afterEach(cleanup)

describe("GitSection", () => {
  it("oferece a opção de merge automático com o alcance explícito", () => {
    render(<Harness />)
    const toggle = screen.getByLabelText("Merge automático") as HTMLInputElement
    expect(toggle).toBeTruthy()
    expect(toggle.checked).toBe(false)
    const description = screen.getByText(/resolve conflitos, faz o merge \(merge commit\)/i)
    expect(description.textContent).toContain("PRs já abertos")
    expect(description.textContent).toContain("rascunho")
  })

  it("correção de CI: central nova herda o padrão global e pode personalizar com limite opcional", () => {
    render(<Harness />)
    expect(screen.getByText("Corrigir CI falho")).toBeTruthy()
    expect(screen.getByText("4 por PR")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Personalizar" }))
    const limit = screen.getByLabelText(/Máximo de correções seguidas por PR/) as HTMLInputElement
    expect(limit.value).toBe("")
    expect(limit.placeholder).toBe("Sem limite")
    const toggle = screen.getByLabelText("Corrigir automaticamente") as HTMLInputElement
    expect(toggle.getAttribute("aria-checked")).toBe("true")
  })
})
