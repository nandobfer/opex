"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useDeleteLink } from "../../hooks/useGithub"
import type { GithubLinkDto } from "../../types"

/** Remover vínculo: a rotina deixa de ler as issues deste repositório; as tarefas criadas ficam. */
export function RemoveLinkDialog({ link, onClose }: { link: GithubLinkDto | null; onClose: () => void }) {
    const remove = useDeleteLink()
    return (
        <Dialog open={link !== null} onOpenChange={(open) => !open && !remove.isPending && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Remover o vínculo de {link?.repo}?</DialogTitle>
                    <DialogDescription>A rotina deixa de ler as issues deste repositório. As tarefas já criadas continuam no quadro.</DialogDescription>
                </DialogHeader>
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
                            remove.mutate(link, { onSuccess: onClose })
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
