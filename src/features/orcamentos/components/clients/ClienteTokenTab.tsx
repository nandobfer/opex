"use client"

import { useState } from "react"
import { AlertTriangle, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useRegenerateClienteToken } from "../../hooks/useOrcamentos"
import type { ClienteOrcamentoDto } from "../../types"
import { CopyPortalUrlButton } from "./CopyPortalUrlButton"

/** Aba Token: regenera o token do cliente (afeta o **usuário padrão**, cuja URL é a do cliente). */
export function ClienteTokenTab({ client, onToken }: { client: ClienteOrcamentoDto; onToken: (token: string) => void }) {
    const regenerate = useRegenerateClienteToken()
    const [confirm, setConfirm] = useState(false)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Token do portal</CardTitle>
                <CardDescription>O link do cliente e do usuário padrão usa este token.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border px-2 py-0.5 font-mono text-xs text-muted-foreground">{client.tokenPrefix}…</span>
                    <CopyPortalUrlButton portalPath={client.portalPath} portalName={client.name} />
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirm(true)} disabled={regenerate.isPending}>
                        <KeyRound className="h-4 w-4" aria-hidden /> Gerar novo token
                    </Button>
                </div>
                <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Regenerar invalida o token atual na hora: a URL do cliente e a do usuário padrão deixam de autenticar. Envie o novo link.
                </p>
            </CardContent>

            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Gerar um novo token para {client.name}?</AlertDialogTitle>
                        <AlertDialogDescription>O token atual deixa de funcionar imediatamente, inclusive o link do usuário padrão do cliente.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                setConfirm(false)
                                const created = await regenerate.mutateAsync(client.id).catch(() => null)
                                if (created) onToken(created.token)
                            }}
                        >
                            Gerar novo token
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}
