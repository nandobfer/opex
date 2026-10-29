"use client"

import { useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { IntegrationConsole, type IntegrationConsoleHandle } from "@/features/integrations/components/IntegrationConsole"

/** Logs dos serviços (últimas 200 linhas) num terminal. */
export function LogsDialog({ title, output, onClose }: { title: string; output: string | null; onClose: () => void }) {
    const consoleRef = useRef<IntegrationConsoleHandle>(null)
    useEffect(() => {
        if (output === null) return
        const timer = setTimeout(() => {
            consoleRef.current?.clear()
            consoleRef.current?.writeLines(output ? output.split("\n") : ["(sem logs)"])
        }, 0)
        return () => clearTimeout(timer)
    }, [output])
    return (
        <Dialog open={output !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Logs de {title}</DialogTitle>
                    <DialogDescription>Últimas 200 linhas de cada serviço.</DialogDescription>
                </DialogHeader>
                <IntegrationConsole ref={consoleRef} className="h-[28rem]" placeholder="(sem logs)" />
            </DialogContent>
        </Dialog>
    )
}
