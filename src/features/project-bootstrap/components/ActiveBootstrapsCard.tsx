"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Rocket } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useProjectBootstraps, useProjectBootstrapRealtime } from "../hooks/useProjectBootstrap"
import { BootstrapRow } from "./BootstrapRow"

/**
 * "Bootstraps em andamento" acima da lista de centrais: só aparece quando há algum executando, aguardando
 * o dono ou com falha. Concluídos e cancelados saem daqui e continuam no histórico.
 */
export function ActiveBootstrapsCard() {
    useProjectBootstrapRealtime()
    const list = useProjectBootstraps(true)
    const items = list.data ?? []
    return (
        <AnimatePresence initial={false}>
            {items.length > 0 && (
                <motion.div key="active-bootstraps" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Rocket className="h-4 w-4 text-primary" aria-hidden /> Bootstraps em andamento
                            </CardTitle>
                            <CardDescription>Ambientes novos sendo provisionados pelo Agente de Bootstrap.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2">
                                <AnimatePresence initial={false}>
                                    {items.map((item) => (
                                        <BootstrapRow key={item.id} bootstrap={item} />
                                    ))}
                                </AnimatePresence>
                            </ul>
                        </CardContent>
                    </Card>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
