"use client"

import { AnimatePresence, motion } from "framer-motion"
import { WifiOff } from "lucide-react"
import { useRealtimeConnection } from "./useRealtimeConnection"

/** Aviso discreto quando a conexão de tempo real cai; a tela continua funcionando. */
export function RealtimeStatusBanner() {
    const state = useRealtimeConnection()
    return (
        <AnimatePresence>
            {state === "unavailable" && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-b border-warning/30 bg-warning/10"
                    role="status"
                >
                    <p className="flex items-center justify-center gap-2 px-4 py-1.5 text-[11px] text-warning">
                        <WifiOff className="h-3.5 w-3.5" aria-hidden />
                        Conexão em tempo real indisponível. Reconectando… Os dados serão atualizados ao reconectar.
                    </p>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
