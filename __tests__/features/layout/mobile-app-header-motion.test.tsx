/** @vitest-environment happy-dom */

import React, { createRef } from "react"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

/** Movimento reduzido: as transições do cabeçalho do celular passam a ser instantâneas (OPE-168). */
const motionState = vi.hoisted(() => ({ reduce: false, transitions: [] as unknown[] }))
vi.mock("framer-motion", () => {
    const base = framerMotionMock()
    const recording = new Proxy(
        {},
        {
            get: (_, tag: string) =>
                function Motion({ transition, ...props }: Record<string, unknown>) {
                    if (transition) motionState.transitions.push(transition)
                    const Inner = (base.motion as Record<string, React.FC<Record<string, unknown>>>)[tag]!
                    return <Inner {...props} />
                },
        },
    )
    return { ...base, motion: recording, useReducedMotion: () => motionState.reduce }
})
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

import { MobileAppHeader } from "@/features/layout/components/header/MobileAppHeader"

function renderHeader() {
    motionState.transitions = []
    render(<MobileAppHeader brand={{ name: "Opex", homeHref: "/" }} compact={false} menuButtonRef={createRef()} menuOpen={false} drawerId="g" onOpenMenu={() => undefined} />)
    return motionState.transitions as { duration?: number }[]
}

afterEach(cleanup)

describe("MobileAppHeader — prefers-reduced-motion", () => {
    it("com movimento reduzido todas as transições têm duração 0", () => {
        motionState.reduce = true
        const transitions = renderHeader()
        expect(transitions.length).toBeGreaterThan(0)
        expect(transitions.every((transition) => transition.duration === 0)).toBe(true)
    })

    it("sem a preferência as transições são animadas", () => {
        motionState.reduce = false
        const transitions = renderHeader()
        expect(transitions.some((transition) => (transition.duration ?? 0) > 0)).toBe(true)
    })
})
