import type { Metadata } from "next"
import { LoginPage } from "@/features/auth/components/LoginPage"

export const metadata: Metadata = {
    title: "Entrar · Opex",
    description: "Acesso ao Opex",
    robots: { index: false, follow: false },
}

/** Rota pública da tela de login. `next` (opcional) é o destino após entrar. */
export default async function LoginRoute({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const { next } = await searchParams
    return <LoginPage nextPath={next} />
}
