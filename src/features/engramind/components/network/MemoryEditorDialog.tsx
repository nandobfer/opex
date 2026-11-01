"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MemoryEditor } from "@/features/ai/components/memories/MemoryEditor"
import type { MemoryTextLimits } from "@/features/ai/memory-text"

export interface MemoryEditorTarget {
    mode: "create" | "edit"
    channel: string
    initial?: { texto: string; categoria: string | null }
}

/**
 * O mesmo editor de memória das listas (texto + categoria, limites do Engramind) num diálogo da rede.
 * `onSave` resolve `true` no sucesso; num conflito de versão o diálogo continua aberto com o texto.
 */
export function MemoryEditorDialog({ target, limits, categories, onSave, onClose }: { target: MemoryEditorTarget | null; limits?: MemoryTextLimits; categories: { key: string; label: string }[]; onSave: (values: { texto: string; categoria: string }) => Promise<boolean>; onClose: () => void }) {
    return (
        <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{target?.mode === "edit" ? "Editar memória" : "Nova memória"}</DialogTitle>
                    <DialogDescription>Canal {target?.channel}</DialogDescription>
                </DialogHeader>
                {target && (
                    <MemoryEditor
                        label="Texto da memória"
                        initial={target.initial}
                        limits={limits}
                        categories={categories}
                        onCancel={onClose}
                        onSave={(values) => {
                            void onSave(values).then((saved) => saved && onClose())
                        }}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}
