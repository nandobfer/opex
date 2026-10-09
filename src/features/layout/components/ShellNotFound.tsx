"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * "Página não encontrada" DENTRO do shell (menu disponível) para endereços desconhecidos.
 */
export function ShellNotFound({ homeHref }: { homeHref: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex w-full flex-col items-center gap-4 rounded-lg border border-border bg-card px-6 py-12 text-center"
        >
            <div className="rounded-full bg-muted p-3">
                <SearchX className="h-6 w-6 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
                <h1 className="text-lg font-semibold text-foreground">Página não encontrada</h1>
                <p className="text-sm text-muted-foreground">Não encontramos o endereço solicitado. Use o menu para continuar.</p>
            </div>
            <Button asChild size="sm" variant="outline">
                <Link href={homeHref}>Voltar ao início</Link>
            </Button>
        </motion.div>
    )
}
