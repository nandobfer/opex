"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Palette } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useColorPalette } from "@/features/color-palette/hooks"
import type { FavoriteColorDto } from "@/features/color-palette/schemas"
import { EditFavoriteColorDialog } from "./EditFavoriteColorDialog"
import { FavoriteColorForm } from "./FavoriteColorForm"
import { FavoriteColorsSkeleton } from "./FavoriteColorsSkeleton"
import { FavoriteColorTile } from "./FavoriteColorTile"
import { FAVORITES_GRID } from "./settings-layout"

/** Aparência › Cores favoritas: as cores oferecidas primeiro em todos os seletores de cor do app. */
export function FavoriteColorsCard() {
    const palette = useColorPalette()
    const [removing, setRemoving] = useState<FavoriteColorDto | null>(null)
    const [editing, setEditing] = useState<FavoriteColorDto | null>(null)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Cores favoritas</CardTitle>
                <CardDescription>Aparecem primeiro no seletor de cores das centrais de desenvolvimento, das colunas do quadro de Tarefas e do Agente Maddox.</CardDescription>
            </CardHeader>
            <CardContent>
                {palette.isLoading ? (
                    <FavoriteColorsSkeleton />
                ) : palette.isError ? (
                    <div className="flex flex-col items-center gap-3 p-6 text-center">
                        <p className="text-sm text-destructive">Não foi possível carregar as cores favoritas.</p>
                        <Button variant="outline" size="sm" onClick={palette.refetch}>
                            Tentar novamente
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {palette.favorites.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
                                <Palette className="h-8 w-8 text-muted-foreground" aria-hidden />
                                <p className="text-sm text-muted-foreground">Nenhuma cor favorita. Escolha uma cor abaixo e clique em Adicionar.</p>
                            </div>
                        ) : (
                            <ul className={FAVORITES_GRID}>
                                <AnimatePresence initial={false}>
                                    {palette.favorites.map((favorite) => (
                                        <FavoriteColorTile key={favorite.color} favorite={favorite} onEdit={() => setEditing(favorite)} onRemove={() => setRemoving(favorite)} />
                                    ))}
                                </AnimatePresence>
                            </ul>
                        )}
                        <FavoriteColorForm mode="add" idPrefix="favorite-add" favorites={palette.favorites} onSubmit={palette.addFavorite} />
                    </div>
                )}
            </CardContent>
            <EditFavoriteColorDialog favorite={editing} favorites={palette.favorites} onClose={() => setEditing(null)} onSave={palette.updateFavorite} />
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(open) => !open && setRemoving(null)}
                title="Remover cor favorita?"
                description="Ela deixa de aparecer nos seletores. Centrais, colunas e o Maddox que já usam esta cor continuam com ela."
                items={removing ? [`${removing.name || removing.color} (${removing.color})`] : undefined}
                confirmLabel="Remover"
                variant="destructive"
                onConfirm={() => {
                    if (removing) palette.removeFavorite(removing.color)
                    setRemoving(null)
                }}
            />
        </Card>
    )
}
