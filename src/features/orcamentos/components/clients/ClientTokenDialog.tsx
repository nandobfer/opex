"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

/** Token do cliente exibido uma única vez após criar/regenerar (o servidor só guarda o hash). */
export function ClientTokenDialog({ token, clientName, onClose }: { token: string | null; clientName: string; onClose: () => void }) {
    const [copied, setCopied] = useState(false)
    const url = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/cliente?t=${encodeURIComponent(token)}` : ""

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Sem clipboard: o campo continua selecionável.
        }
    }

    return (
        <Dialog open={token !== null} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Token de {clientName}</DialogTitle>
                    <DialogDescription>Guarde agora: o token não é exibido de novo. Regenerar invalida o anterior.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Input readOnly value={token ?? ""} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
                        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => copy(token ?? "")}>
                            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                            {copied ? "Copiado" : "Copiar"}
                        </Button>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Endereço do portal</p>
                        <div className="flex items-center gap-2">
                            <Input readOnly value={url} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
                            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => copy(url)}>
                                <Copy className="h-4 w-4" aria-hidden /> Copiar
                            </Button>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" onClick={onClose}>
                        Entendi
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
