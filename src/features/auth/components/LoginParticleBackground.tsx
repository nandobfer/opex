"use client"

import { useMemo, useState, type ComponentProps } from "react"
import Particles, { ParticlesProvider, type ParticlesPluginRegistrar } from "@tsparticles/react"
import { loadSlim } from "@tsparticles/slim"
import { useReducedMotion } from "framer-motion"

type ParticlesOptions = NonNullable<ComponentProps<typeof Particles>["options"]>

interface ThemeColors {
    primary: string
}

/** Registra o bundle "slim" do tsParticles (uma vez; o `ParticlesProvider` cuida disso). */
const registerPlugins: ParticlesPluginRegistrar = async (engine) => {
    await loadSlim(engine)
}

/** Cor primária do tema em `hsl(...)`, lida dos tokens CSS (nada hardcoded). Só no cliente. */
function readPrimaryColor(): string | null {
    if (typeof document === "undefined") return null
    const value = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()
    return value ? `hsl(${value})` : null
}

/**
 * Fundo animado da tela de login: partículas conectadas por linhas (receita "links" do
 * particles.js), com as **cores do tema** lidas dos tokens CSS (nada hardcoded) e movimento
 * desligado com `prefers-reduced-motion`. Montado só no cliente (canvas), via `next/dynamic`
 * `ssr: false` em `LoginPage`.
 */
export function LoginParticleBackground() {
    const reducedMotion = useReducedMotion()
    const [colors] = useState<ThemeColors | null>(() => {
        const primary = readPrimaryColor()
        return primary ? { primary } : null
    })

    const options = useMemo<ParticlesOptions>(() => {
        if (!colors) return {}
        return {
            fullScreen: { enable: false },
            fpsLimit: 60,
            detectRetina: true,
            pauseOnBlur: true,
            pauseOnOutsideViewport: true,
            interactivity: {
                events: {
                    onHover: { enable: !reducedMotion, mode: "grab" },
                    onClick: { enable: !reducedMotion, mode: "push" },
                },
                modes: {
                    grab: { distance: 160, links: { opacity: 0.35 } },
                    push: { quantity: 2 },
                },
            },
            particles: {
                color: { value: colors.primary },
                links: { color: colors.primary, distance: 150, enable: true, opacity: 0.2, width: 1 },
                move: { enable: !reducedMotion, speed: 0.6, direction: "none", outModes: { default: "out" } },
                number: { density: { enable: true, width: 1200 }, value: 70 },
                opacity: { value: { min: 0.15, max: 0.5 } },
                shape: { type: "circle" },
                size: { value: { min: 1, max: 2.5 } },
            },
        }
    }, [colors, reducedMotion])

    if (!colors) return null

    return (
        <div className="pointer-events-none absolute inset-0 -z-10 hidden md:block" aria-hidden="true">
            <ParticlesProvider init={registerPlugins}>
                <Particles id="opex-login-particles" options={options} className="h-full w-full" />
            </ParticlesProvider>
        </div>
    )
}
