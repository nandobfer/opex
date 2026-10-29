/** @vitest-environment happy-dom */

import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("@tsparticles/slim", () => ({ loadSlim: vi.fn(async () => {}) }))
vi.mock("@tsparticles/react", () => ({
    default: (props: { id?: string; options?: { particles?: { color?: { value?: string } } } }) => (
        <div data-testid="particles" data-id={props.id} data-color={props.options?.particles?.color?.value} />
    ),
    ParticlesProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))

import { LoginParticleBackground } from "@/features/auth/components/LoginParticleBackground"

afterEach(cleanup)

function mockPrimary(token = "270 100% 50%") {
    return vi.spyOn(window, "getComputedStyle").mockImplementation(
        () => ({ getPropertyValue: (name: string) => (name === "--primary" ? token : "") }) as CSSStyleDeclaration,
    )
}

describe("fundo de partículas do login", () => {
    it("lê a cor primária dos tokens do tema (sem cor hardcoded)", async () => {
        const spy = mockPrimary()
        render(<LoginParticleBackground />)

        const particles = await screen.findByTestId("particles")
        expect(particles.getAttribute("data-color")).toBe("hsl(270 100% 50%)")
        expect(particles.closest("[aria-hidden='true']")).not.toBeNull()

        spy.mockRestore()
    })

    it("não usa z-index negativo nem fica escondido (regressão: partículas atrás do fundo)", async () => {
        const spy = mockPrimary()
        render(<LoginParticleBackground />)

        const particles = await screen.findByTestId("particles")
        const layer = particles.closest("[aria-hidden='true']")!
        expect(layer).not.toBeNull()
        expect(layer.classList.contains("-z-10")).toBe(false)
        expect(layer.classList.contains("hidden")).toBe(false)
        expect(layer.classList.contains("z-0")).toBe(true)

        spy.mockRestore()
    })
})
