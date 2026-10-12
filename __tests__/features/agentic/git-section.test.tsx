/** @vitest-environment jsdom */

import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
})
