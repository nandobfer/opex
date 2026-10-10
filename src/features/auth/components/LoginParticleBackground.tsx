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
 * particles.js), com as **cores do tema** lidas dos tokens CSS (nada hardcoded).
 *
 * Fica em `z-0` dentro do `main` (que tem `isolate`), para aparecer **acima** do fundo e
 * **abaixo** do cartão (`z-10`) — nunca com z-index negativo. O container recebe ponteiros
 * (`pointer-events` padrão) para o hover/clique da receita funcionar; o cartão, acima, continua
 * clicável. Com `prefers-reduced-motion`, o movimento é desligado (as partículas/links continuam).
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
                    grab: { distance: 180, links: { opacity: 0.4 } },
                    push: { quantity: 3 },
                },
            },
            particles: {
                color: { value: colors.primary },
                links: { color: colors.primary, distance: 150, enable: true, opacity: 0.5, width: 1 },
                move: { enable: !reducedMotion, speed: 1.6, direction: "none", outModes: { default: "out" } },
                number: { density: { enable: true, width: 1200 }, value: 90 },
                opacity: { value: { min: 0.2, max: 0.6 } },
                shape: { type: "circle" },
                size: { value: { min: 1, max: 4 } },
            },
        }
    }, [colors, reducedMotion])

    if (!colors) return null

    return (
        <div className="absolute inset-0 z-0" aria-hidden="true">
            <ParticlesProvider init={registerPlugins}>
                <Particles id="opex-login-particles" options={options} className="h-full w-full" />
            </ParticlesProvider>
        </div>
    )
}
