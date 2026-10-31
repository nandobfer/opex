"use client"

import { useState } from "react"
import { Loader2, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Progress } from "@/components/ui/progress"
import { AnimatedNumber } from "@/components/motion/AnimatedNumber"
import { STATUS_HELP } from "../../../help/operation"
import type { EngramindStatus } from "../../../types"
import { engramindSend, useEngramindMutation } from "../../../hooks/useEngramind"
import { HelpBadge, toneOf } from "../../shared/Badges"
import { Section } from "../../shared/Section"

const STATE_HELP: Record<string, string> = {
    ready: "Vetores em dia com o modelo vigente.",
    reindexing: "Reindexação em andamento.",
    failed: "Um lote esgotou as tentativas: Reindexar recomeça.",
    off: "Embeddings desligados (só busca textual).",
}

/** Estado dos embeddings e "Reindexar" (desabilitado durante uma reindexação). */
export function ReembedCard({ status }: { status: EngramindStatus | undefined }) {
    const [confirm, setConfirm] = useState(false)
    const embedding = status?.embedding
    const reindexing = embedding?.state === "reindexing"
    const reembed = useEngramindMutation(() => engramindSend("post", "embeddings/reembed", {}), { invalidate: ["status"], success: "Reindexação iniciada" })
    const total = embedding?.total ?? 0
    const done = embedding?.done ?? 0
    return (
        <Section
            title="Embeddings"
            info={STATUS_HELP.embedding}
            actions={
                <Button type="button" size="sm" variant="outline" disabled={reindexing || reembed.isPending || embedding?.state === "off"} onClick={() => setConfirm(true)} title={reindexing ? "Já há uma reindexação em andamento" : undefined}>
                    {reembed.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />} Reindexar
                </Button>
            }
        >
            {embedding ? (
                <div className="space-y-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                        <HelpBadge value={embedding.state} tone={toneOf(embedding.state)} help={STATE_HELP[embedding.state]} />
                        <span className="text-muted-foreground">{embedding.provider ?? "—"}</span>
                        <span className="font-mono text-xs">{embedding.model_id ?? embedding.model ?? "—"}</span>
                        {embedding.dimensions && <span className="text-xs text-muted-foreground">{embedding.dimensions} dimensões</span>}
                    </div>
                    {reindexing && total > 0 && (
                        <div className="space-y-1">
                            <Progress value={done} max={total} />
                            <p className="text-xs text-muted-foreground">
                                <AnimatedNumber value={done} /> de <AnimatedNumber value={total} /> memórias
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">Status indisponível.</p>
            )}
            <ConfirmDialog
                open={confirm}
                onOpenChange={setConfirm}
                title="Reindexar todas as memórias?"
                description="Revetoriza todas as memórias com o modelo vigente. Use depois de trocar a chave ou quando um lote falhou de vez."
                confirmLabel="Reindexar"
                pending={reembed.isPending}
                onConfirm={() => reembed.mutate(undefined, { onSettled: () => setConfirm(false) })}
            />
        </Section>
    )
}
