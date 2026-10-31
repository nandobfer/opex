"use client"

import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { useAiProviderStatuses } from "@/features/ai/hooks/useAi"
import { AI_SOURCE_HELP } from "../../../../help/ai-source"
import { useOpexAiSource } from "../../../../hooks/useOpexAiSource"
import { Section } from "../../../shared/Section"
import { EmbeddingSourceSection } from "./EmbeddingSourceSection"
import { RedatorSourceSection } from "./RedatorSourceSection"

/** "IA do Opex": Redator e embedding com os provedores e as chaves já configurados no Opex. */
export function OpexAiCard() {
    const query = useOpexAiSource()
    const statuses = useAiProviderStatuses()
    return (
        <Section title="IA do Opex" info={AI_SOURCE_HELP.card} description="Escolha provedor e modelo como em Inteligência Artificial: a chave sai do Opex e a URL vem do provedor.">
            {query.isLoading || statuses.isLoading ? (
                <OpexAiCardSkeleton />
            ) : query.error || !query.data ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3 text-sm">
                    <span className="text-destructive">{apiErrorMessage(query.error, "Não foi possível ler a IA do Engramind")}</span>
                    <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => void query.refetch()}>
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Tentar novamente
                    </Button>
                </div>
            ) : (
                <div className="space-y-6">
                    <RedatorSourceSection key={`redator-${query.data.redator.provider}-${query.data.redator.model}-${query.data.redator.origin}`} state={query.data.redator} providers={statuses.providers} />
                    <Separator />
                    <EmbeddingSourceSection key={`embedding-${query.data.embedding.provider}-${query.data.embedding.model}-${query.data.embedding.origin}`} state={query.data.embedding} providers={statuses.providers} reindexing={query.data.reindexing} />
                </div>
            )}
        </Section>
    )
}

export function OpexAiCardSkeleton() {
    return (
        <div className="space-y-6" aria-busy="true">
            {Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="space-y-3">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <div className="flex justify-end gap-2">
                        <Skeleton className="h-9 w-40" />
                        <Skeleton className="h-9 w-36" />
                    </div>
                </div>
            ))}
        </div>
    )
}
