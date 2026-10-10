"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Markdown } from "@/components/ui/markdown"
import { Skeleton } from "@/components/ui/skeleton"

/** Card da especificação técnica da prévia (Markdown). */
export function PreviewSpecCard({ technicalSpec, loading = false }: { technicalSpec: string | null; loading?: boolean }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Especificação técnica</CardTitle>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="space-y-2" aria-label="Gerando especificação">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-11/12" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                ) : technicalSpec ? (
                    <Markdown>{technicalSpec}</Markdown>
                ) : (
                    <p className="text-sm text-muted-foreground">Sem especificação.</p>
                )}
            </CardContent>
        </Card>
    )
}
