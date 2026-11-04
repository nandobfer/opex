"use client"

import { AnimatePresence, motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { BookOpen, Loader2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { MEMORY_TEXT_MAX } from "@/features/ai/memory-text"
import { MENTOR_TARGET_LABELS, MENTOR_TARGETS, type MentorTarget } from "../../mentor/constants"
import type { MentorRunDto } from "../../mentor/types"
import { useMentorRunMemory } from "../../hooks/useMentor"
import { MentorRunChip, MentorRunSection } from "./MentorRunSection"

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.18 } }

/** Área de leitura do texto completo: largura de leitura, tipografia confortável e rolagem interna. */
export const MENTOR_MEMORY_TEXT_CLASS = "max-h-[40vh] max-w-prose overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-background/40 px-3 py-2.5 text-sm leading-relaxed"

/** Resumo da memória gravada (Engramind), em destaque; sem memória ou sem resumo, estado vazio discreto. */
function MemorySummary({ run }: { run: MentorRunDto }) {
    const query = useMentorRunMemory(run)
    const data = query.data
    const view = !run.memoryId ? "empty" : query.isLoading ? "loading" : query.isError ? "error" : data?.state === "missing" ? "missing" : data?.resumo ? "ok" : "empty"
    return (
        <div aria-label="Resumo da memória" className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Resumo</p>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} {...fade}>
                    {view === "loading" && (
                        <div className="space-y-1.5" aria-label="Carregando o resumo">
                            <Skeleton className="h-4 w-4/5" />
                            <Skeleton className="h-4 w-2/5" />
                        </div>
                    )}
                    {view === "ok" && data && (
                        <div className="space-y-1">
                            <p className="break-words text-base font-medium leading-snug">{data.resumo}</p>
                            {data.resumoPendente && query.expired ? (
                                <p className="text-xs text-muted-foreground">O resumo ainda não ficou pronto: este é o texto provisório.</p>
                            ) : data.resumoPendente ? (
                                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Resumo sendo gerado pelo Engramind…
                                </p>
                            ) : (
                                data.atualizadaEm && <p className="text-xs text-muted-foreground">Atualizada {formatDistanceToNow(new Date(data.atualizadaEm), { addSuffix: true, locale: ptBR })}</p>
                            )}
                        </div>
                    )}
                    {view === "missing" && <p className="text-sm text-muted-foreground">A memória não está mais no Engramind (excluída ou movida para outra lista).</p>}
                    {view === "error" && (
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm text-muted-foreground">Não foi possível carregar o resumo.</p>
                            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => void query.refetch()}>
                                <RotateCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
                            </Button>
                        </div>
                    )}
                    {view === "empty" && <p className="text-sm text-muted-foreground">Sem resumo: o Engramind gera o resumo quando a memória é gravada.</p>}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}

export interface MentorRunMemoryProps {
    run: MentorRunDto
    /** Sugestão aguardando decisão: destino e texto editáveis. */
    editable: boolean
    text: string
    target: MentorTarget
    onTextChange: (text: string) => void
    onTargetChange: (target: MentorTarget) => void
    /** Parte separada (global + central): texto e se ela será gravada junto. */
    extraText?: string
    onExtraTextChange?: (text: string) => void
    includeExtra?: boolean
    onIncludeExtraChange?: (include: boolean) => void
}

/** Seção Memória: resumo em destaque acima do texto completo (ou dos campos da sugestão). */
export function MentorRunMemory({ run, editable, text, target, onTextChange, onTargetChange, extraText, onExtraTextChange, includeExtra = true, onIncludeExtraChange }: MentorRunMemoryProps) {
    const proposal = run.proposal
    if (!proposal) return null
    const moved = target !== proposal.target
    const tooLong = text.length > MEMORY_TEXT_MAX
    return (
        <MentorRunSection
            icon={BookOpen}
            title="Memória"
            aside={!editable && <MentorRunChip>{`${proposal.action === "update" ? "Fusão" : "Nova"} · ${MENTOR_TARGET_LABELS[proposal.target].short}`}</MentorRunChip>}
            className="border-t pt-4"
        >
            <MemorySummary run={run} />
            {editable ? (
                <>
                    <Field id="mentor-run-target" label="Destino da memória">
                        <OptionTabs<MentorTarget>
                            id="mentor-run-target"
                            options={MENTOR_TARGETS.map((value) => ({ value, label: MENTOR_TARGET_LABELS[value].short }))}
                            value={target}
                            onChange={onTargetChange}
                            className="w-full flex-wrap"
                        />
                        {moved && proposal.action === "update" && <p className="text-xs text-muted-foreground">Em outra lista, a fusão vira uma memória nova.</p>}
                    </Field>
                    <Field id="mentor-run-text" label="Memória sugerida (pode editar antes de aprovar)" error={tooLong ? `Até ${MEMORY_TEXT_MAX.toLocaleString("pt-BR")} caracteres` : undefined}>
                        <Textarea id="mentor-run-text" rows={8} className="leading-relaxed" value={text} onChange={(event) => onTextChange(event.target.value)} />
                    </Field>
                </>
            ) : (
                <div aria-label="Texto completo da memória" className={MENTOR_MEMORY_TEXT_CLASS}>
                    {proposal.text}
                </div>
            )}
            {run.extraProposal && (
                <div className="space-y-1.5 rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Parte separada · {MENTOR_TARGET_LABELS[run.extraProposal.target].short}</p>
                    {editable && onIncludeExtraChange && (
                        <span className="flex items-center gap-1.5 text-sm">
                            <Checkbox id={`mentor-extra-${run.id}`} checked={includeExtra} onCheckedChange={(value) => onIncludeExtraChange(value)} />
                            <label htmlFor={`mentor-extra-${run.id}`}>Gravar também nesta lista</label>
                        </span>
                    )}
                    {editable && onExtraTextChange ? (
                        <Textarea aria-label="Parte separada da memória" rows={5} className="leading-relaxed" value={extraText ?? run.extraProposal.text} disabled={!includeExtra} onChange={(event) => onExtraTextChange(event.target.value)} />
                    ) : (
                        <div aria-label="Texto da parte separada" className="max-h-[30vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {run.extraProposal.text}
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">{run.extraProposal.action === "update" ? "Fusão com uma memória existente desta lista." : "Memória nova nesta lista."}</p>
                </div>
            )}
        </MentorRunSection>
    )
}
