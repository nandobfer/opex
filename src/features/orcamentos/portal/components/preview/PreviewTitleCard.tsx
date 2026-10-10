"use client"

import { Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Markdown } from "@/components/ui/markdown"
import { Skeleton } from "@/components/ui/skeleton"
import type { DraftPreviewDto } from "@/features/orcamentos/types"

/**
 * Card principal da prévia: título gerado pela IA, o resumo como subtítulo discreto e, abaixo, a
 * descrição enviada pelo cliente. Enquanto a prévia é gerada, mostra um carregamento com skeleton
 * (o JSON cru da IA nunca é exibido).
 */
export function PreviewTitleCard({ preview, description, generating, notice }: { preview: DraftPreviewDto | null; description: string; generating: boolean; notice: string | null }) {
    if (!preview) {
        return (
            <Card>
                <CardContent className="space-y-3 pt-6" aria-label="Gerando prévia">
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {generating ? `Gerando a prévia${notice ? ` · ${notice}` : "…"}` : "Nenhuma prévia ainda."}
                    </p>
                    <div className="space-y-2" aria-hidden>
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">{preview.title}</CardTitle>
                {preview.summary && <CardDescription className="text-xs">{preview.summary}</CardDescription>}
            </CardHeader>
            <CardContent>
                {description.trim() ? <Markdown>{description}</Markdown> : <p className="text-sm text-muted-foreground">Sem descrição.</p>}
            </CardContent>
        </Card>
    )
}
