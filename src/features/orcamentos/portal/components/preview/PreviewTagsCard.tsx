"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DraftTagDto } from "@/features/orcamentos/types"

/** Card das tags da prévia (geradas pela feature "Tags de tarefas"), animado. */
export function PreviewTagsCard({ tags, loading = false }: { tags: DraftTagDto[]; loading?: boolean }) {
    if (!loading && tags.length === 0) return null
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 pt-0">
                {loading ? (
                    <>
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-20" />
                    </>
                ) : (
                    <AnimatePresence initial={false}>
                        {tags.map((tag) => (
                            <motion.span
                                key={tag.id}
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.2 }}
                                className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            >
                                {tag.label}
                            </motion.span>
                        ))}
                    </AnimatePresence>
                )}
            </CardContent>
        </Card>
    )
}
