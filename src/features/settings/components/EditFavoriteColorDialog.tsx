"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Info } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { FavoriteColorDto } from "@/features/color-palette/schemas"
import { FavoriteColorForm, type FavoriteColorFormValues } from "./FavoriteColorForm"

interface EditFavoriteColorDialogProps {
    /** Favorita em edição; `null` fecha o diálogo. */
    favorite: FavoriteColorDto | null
    favorites: readonly FavoriteColorDto[]
    onClose: () => void
    onSave: (currentColor: string, values: FavoriteColorFormValues) => void
}

/** Editar nome e cor de uma favorita; ela mantém a posição na lista. */
export function EditFavoriteColorDialog({ favorite, favorites, onClose, onSave }: EditFavoriteColorDialogProps) {
    return (
        <Dialog open={favorite !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Editar cor favorita</DialogTitle>
                    <DialogDescription>Mude o nome ou a cor; a favorita continua na mesma posição.</DialogDescription>
                </DialogHeader>
                {favorite && (
                    <FavoriteColorForm
                        key={favorite.color}
                        mode="edit"
                        idPrefix="favorite-edit"
                        favorites={favorites}
                        initial={favorite}
                        onSubmit={(values) => {
                            onSave(favorite.color, values)
                            onClose()
                        }}
                        footer={(color) => (
                            <AnimatePresence initial={false}>
                                {color && color !== favorite.color && (
                                    <motion.p
                                        key="color-changed"
                                        role="status"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="flex items-start gap-1.5 overflow-hidden rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground"
                                    >
                                        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                                        Centrais, colunas e o Maddox que já usam a cor antiga ({favorite.color}) continuam com ela.
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        )}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}
