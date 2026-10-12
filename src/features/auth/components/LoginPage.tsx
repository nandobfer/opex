"use client"

import dynamic from "next/dynamic"
import { motion } from "framer-motion"
import { LoginForm } from "./LoginForm"

// Canvas de partículas só no cliente (lê os tokens do tema do DOM): evita divergência de hidratação.
const LoginParticleBackground = dynamic(() => import("./LoginParticleBackground").then((mod) => mod.LoginParticleBackground), {
    ssr: false,
})

/**
 * Tela inicial de login — a primeira (e, por ora, única) tela pública do Opex. Fica **fora do
 * shell** (`src/app/login/page.tsx`), centralizada na viewport, com fundo de partículas e o
 * cartão de entrada. Sem cadastro e sem usuário: só a senha.
 *
 * `isolate` cria um stacking context no `main` para que as camadas do fundo (`z-0`) fiquem
 * **acima** do `bg-background` e **abaixo** do conteúdo (`z-10`) — sem z-index negativo, que
 * esconderia as partículas atrás do fundo opaco.
 */
export function LoginPage({ nextPath, notice }: { nextPath?: string; notice?: string }) {
    return (
        <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
            <div
                className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18),transparent_60%)]"
                aria-hidden="true"
            />
            <LoginParticleBackground />

            <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="relative z-10 flex w-full max-w-sm flex-col items-center"
            >
                <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">Opex</h1>
                <p className="mt-2 text-base text-muted-foreground sm:text-lg">nandoburgos.dev</p>

                {notice && (
                    <p className="mt-4 w-full rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-center text-sm text-warning">{notice}</p>
                )}

                <div className="mt-8 w-full rounded-xl border border-border/70 bg-card/80 p-6 shadow-[0_0_50px_-18px_hsl(var(--primary))] backdrop-blur-md">
                    <LoginForm nextPath={nextPath} />
                </div>
            </motion.div>
        </main>
    )
}
