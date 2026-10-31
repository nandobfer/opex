"use client"

import { AnimatePresence, motion } from "framer-motion"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Aviso de que os dados do formulário mudaram fora daqui enquanto havia alterações pendentes. */
export function StaleFormNotice({ stale, onReload }: { stale: boolean; onReload: () => void }) {
    return (
        <AnimatePresence initial={false}>
            {stale && (
                <motion.div key="stale" role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                    <span>As configurações mudaram fora daqui. Recarregar traz os valores atuais e descarta as suas alterações.</span>
                    <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={onReload}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Recarregar
                    </Button>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
