import type { Metadata } from "next"
import { LoginPage } from "@/features/auth/components/LoginPage"

export const metadata: Metadata = {
    title: "Entrar · Opex",
    description: "Acesso ao Opex",
    robots: { index: false, follow: false },
}

/** Avisos exibidos na tela quando a entrada pelo portal (`/cliente?t=`) não deu certo. */
const PORTAL_NOTICES: Record<string, string> = {
    "link-invalido": "O link do portal é inválido ou expirou. Use o link enviado pela equipe.",
    "sem-cliente": "Sua conta não tem nenhum cliente ativo no momento.",
}

/** Rota pública da tela de login. `next` (opcional) é o destino após entrar. */
export default async function LoginRoute({ searchParams }: { searchParams: Promise<{ next?: string; portal?: string }> }) {
    const { next, portal } = await searchParams
    return <LoginPage nextPath={next} notice={portal ? PORTAL_NOTICES[portal] : undefined} />
}
