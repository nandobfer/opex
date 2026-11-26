"use client"

import { useEffect } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Botão "Tentar novamente" da página offline; recarrega sozinho quando a conexão volta. */
export function OfflineRetry() {
    useEffect(() => {
        const reload = () => window.location.reload()
        window.addEventListener("online", reload)
        return () => window.removeEventListener("online", reload)
    }, [])

    return (
        <Button type="button" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Tentar novamente
        </Button>
    )
}
