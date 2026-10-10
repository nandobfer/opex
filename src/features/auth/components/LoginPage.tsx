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
 */
export function LoginPage({ nextPath }: { nextPath?: string }) {
    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18),transparent_60%)]"
                aria-hidden="true"
            />
            <LoginParticleBackground />

            <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="relative z-10 flex w-full max-w-sm flex-col items-center"
            >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-[0_0_28px_-6px_hsl(var(--primary))]">
                    O
                </div>
                <h1 className="mt-4 text-4xl font-bold tracking-tight">Opex</h1>
                <p className="mt-1 text-sm text-muted-foreground">nandoburgos.dev</p>

                <div className="mt-8 w-full rounded-xl border border-border/70 bg-card/80 p-6 shadow-[0_0_50px_-18px_hsl(var(--primary))] backdrop-blur-md">
                    <LoginForm nextPath={nextPath} />
                </div>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                    Acesso restrito. Este app é de uso pessoal.
                </p>
            </motion.div>
        </main>
    )
}
