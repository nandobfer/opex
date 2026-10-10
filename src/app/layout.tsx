import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils"
import { QueryProvider } from "@/lib/react-query/QueryProvider"
import { Toaster } from "@/components/ui/toast"
import { MotionProvider } from "@/components/motion/MotionProvider"
import { CtrlEnterSubmit } from "@/components/ctrl-enter-submit"
import { PusherConfigBridge } from "@/lib/pusher/PusherConfigBridge"
import { getPusherPublicConfig } from "@/lib/pusher/public-config"

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] })

/**
 * Sempre renderizado por requisição: o layout lê o ambiente do servidor (dono do app, config do
 * Pusher no banco). Estático, o `next build` — que roda no Docker SEM o `.env` — congelaria os
 * valores do build (ex.: "Usuário local" no rodapé do menu).
 */
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
    title: "Opex",
    description: "Tarefas e apontamento de horas, com integrações",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    // Key e cluster/URL do Pusher vêm da integração (banco → .env), não do build.
    const pusherConfig = await getPusherPublicConfig()
    return (
        <html lang="pt-BR" className="dark" style={{ colorScheme: "dark" }}>
            <body className={cn("min-h-screen bg-background font-sans antialiased", inter.variable)}>
                <PusherConfigBridge config={pusherConfig} />
                <CtrlEnterSubmit />
                <QueryProvider>
                    <MotionProvider>
                        {children}
                        <Toaster richColors theme="dark" position="top-right" />
                    </MotionProvider>
                </QueryProvider>
            </body>
        </html>
    )
}
