"use client"

import { useState } from "react"
import { FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { EngramindStatus, SettingMeta } from "../../../types"
import { useEngramindQuery } from "../../../hooks/useEngramind"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { Section } from "../../shared/Section"
import { EmbeddingModelsCard } from "./EmbeddingModelsCard"
import { ProviderTestDialog } from "./ProviderTestDialog"
import { ReembedCard } from "./ReembedCard"
import { SecretsCard } from "./SecretsCard"

/** Aba Provedores: chaves de API, testers, modelos de embedding e reindexação. */
export function ProvidersTab({ onConfigure }: { onDirtyChange: (dirty: boolean) => void; onConfigure: () => void }) {
    const settings = useEngramindQuery<{ settings: SettingMeta[] }>("settings")
    const status = useEngramindQuery<EngramindStatus>("status", undefined, { refetchInterval: 5_000 })
    const [testing, setTesting] = useState<"redator" | "embedding" | null>(null)
    const provider = settings.data?.settings.find((meta) => meta.key === "embedding.provider")?.value
    return (
        <QueryBoundary isLoading={settings.isLoading} error={settings.error} onRetry={() => void settings.refetch()} skeleton={<ProvidersSkeleton />} onConfigure={onConfigure}>
            <div className="flex flex-col gap-6">
                <SecretsCard metas={settings.data?.settings ?? []} />
                <Section title="Testar provedores" info="Chama o provedor de verdade com um texto de exemplo, sem gravar memória nem configuração (o teste do Redator entra nas chamadas ao LLM com finalidade test).">
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => setTesting("redator")}>
                            <FlaskConical className="mr-2 h-4 w-4" aria-hidden /> Testar Redator
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setTesting("embedding")}>
                            <FlaskConical className="mr-2 h-4 w-4" aria-hidden /> Testar embedding
                        </Button>
                    </div>
                </Section>
                <EmbeddingModelsCard currentProvider={typeof provider === "string" ? provider : null} />
                <ReembedCard status={status.data} />
                {testing && <ProviderTestDialog key={testing} kind={testing} open onOpenChange={(open) => !open && setTesting(null)} />}
            </div>
        </QueryBoundary>
    )
}

function ProvidersSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
        </div>
    )
}
