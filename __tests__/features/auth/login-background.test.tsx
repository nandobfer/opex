/** @vitest-environment jsdom */

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

describe("fundo de partículas do login", () => {
    it("lê a cor primária dos tokens do tema (sem cor hardcoded)", async () => {
        const spy = vi.spyOn(window, "getComputedStyle").mockImplementation(
            () => ({ getPropertyValue: (name: string) => (name === "--primary" ? "270 100% 50%" : "") }) as CSSStyleDeclaration,
        )

        render(<LoginParticleBackground />)

        const particles = await screen.findByTestId("particles")
        expect(particles.getAttribute("data-color")).toBe("hsl(270 100% 50%)")
        expect(particles.closest("[aria-hidden='true']")).not.toBeNull()

        spy.mockRestore()
    })
})
