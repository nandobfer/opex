"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OptionTabs } from "@/components/ui/option-tabs"
import { useDeleteLink } from "../../hooks/useGithub"
import type { GithubRepoLinkDto } from "../../types"

const OPTIONS = [
    { value: "keep", label: "Manter rascunhos" },
    { value: "discard", label: "Descartar rascunhos" },
] as const

/** Remover vínculo: com rascunhos pendentes, pergunta se mantém (continuam enviáveis) ou descarta. */
export function RemoveLinkDialog({ link, onClose }: { link: GithubRepoLinkDto | null; onClose: () => void }) {
    const remove = useDeleteLink()
    const [choice, setChoice] = useState<{ id: string; drafts: "keep" | "discard" } | null>(null)
    // A escolha vale só para o vínculo em que foi feita (abrir outro volta para "Manter").
    const drafts = choice && choice.id === link?.id ? choice.drafts : "keep"
    const setDrafts = (value: "keep" | "discard") => link && setChoice({ id: link.id, drafts: value })

    return (
        <Dialog open={link !== null} onOpenChange={(open) => !open && !remove.isPending && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Remover o vínculo de {link?.repo}?</DialogTitle>
                    <DialogDescription>A rotina deixa de ler as issues deste repositório. Tarefas já enviadas ao Go! Sipal não mudam.</DialogDescription>
                </DialogHeader>
                {link && link.pendingDrafts > 0 && (
                    <div className="space-y-2">
                        <p className="text-sm">
                            Há <strong>{link.pendingDrafts}</strong> rascunho(s) ainda não enviado(s). O que fazer com eles?
                        </p>
                        <OptionTabs options={OPTIONS} value={drafts} onChange={setDrafts} size="md" className="w-full" />
                        <p className="text-xs text-muted-foreground">
                            {drafts === "keep" ? "Continuam no quadro e podem ser enviados, mas não serão mais atualizados pela issue." : "Saem do quadro; dá para restaurá-los na aba Sincronização."}
                        </p>
                    </div>
                )}
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose} disabled={remove.isPending}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        disabled={remove.isPending}
                        onClick={() => {
                            if (!link) return
                            remove.mutate({ link, drafts }, { onSuccess: onClose })
                        }}
                    >
                        {remove.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                        Remover vínculo
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
