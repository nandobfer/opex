"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { clienteLoginPath } from "../../constants"
import { CopyPortalUrlButton, portalUrlFrom } from "./CopyPortalUrlButton"

/** Token do cliente exibido logo após criar/regenerar (o servidor guarda o valor para o link). */
export function ClientTokenDialog({ token, clientName, onClose }: { token: string | null; clientName: string; onClose: () => void }) {
    const [copied, setCopied] = useState(false)
    const url = token ? portalUrlFrom(clienteLoginPath(token)) : ""

    const copyToken = async () => {
        try {
            await navigator.clipboard.writeText(token ?? "")
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
                    <DialogTitle>Portal de {clientName}</DialogTitle>
                    <DialogDescription>Envie o link do portal ao cliente. O link fica disponível na lista de clientes para copiar a qualquer momento; regenerar o token invalida o anterior.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Endereço do portal</p>
                        <div className="flex items-center gap-2">
                            <Input readOnly value={url} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
                            <CopyPortalUrlButton portalPath={clienteLoginPath(token ?? "")} portalName={clientName} className="shrink-0 border" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Token de acesso</p>
                        <div className="flex items-center gap-2">
                            <Input readOnly value={token ?? ""} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
                            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => void copyToken()}>
                                {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                                {copied ? "Copiado" : "Copiar"}
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
