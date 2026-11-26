"use client"

import { motion, useReducedMotion } from "framer-motion"
import { WifiOff } from "lucide-react"
import { BrandMark } from "@/features/layout/components/BrandMark"
import { OfflineRetry } from "./OfflineRetry"

/**
 * Conteúdo da página offline do PWA (OPE-196). O service worker guarda esta página e os arquivos
 * estáticos dela na instalação e a mostra quando a navegação falha sem rede.
 */
export function OfflineScreen() {
    const reduceMotion = useReducedMotion()
    return (
        <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
            <motion.div
                className="flex flex-col items-center gap-5 text-center"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
            >
                <BrandMark className="h-12 w-12" />
                <div className="rounded-full bg-muted p-4">
                    <WifiOff className="h-7 w-7 text-muted-foreground" aria-hidden />
                </div>
                <div className="max-w-sm space-y-1">
                    <h1 className="text-xl font-semibold text-foreground">Sem conexão</h1>
                    <p className="text-sm text-muted-foreground">
                        O Opex precisa de internet para mostrar seus dados. Assim que a conexão voltar, a página recarrega sozinha.
                    </p>
                </div>
                <OfflineRetry />
            </motion.div>
        </main>
    )
}
