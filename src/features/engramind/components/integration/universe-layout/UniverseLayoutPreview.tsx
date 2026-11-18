"use client"

import { useMemo, useState } from "react"
import { channelColors, EngramindProvider, MemoryUniverse, type MemoryCardActions } from "@engramind/client/react"
import type { UniverseLayoutConfig } from "@engramind/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { buildSampleRelated, buildSampleUniverse, SAMPLE_AGENT, SAMPLE_UNIVERSE_LIMITS } from "../../../network/sample-universe"
import { opexEngramindSource } from "../../OpexEngramindProvider"
import { Section } from "../../shared/Section"

const NO_OP = () => undefined
/** A prévia só olha: o card da memória de exemplo abre, sem ações. */
const ACTIONS: MemoryCardActions = { onActive: NO_OP, onPin: NO_OP, onEdit: NO_OP, onDelete: NO_OP, readOnly: true }
const CENTER_OPTIONS = [
    { value: "agent", label: "Agente" },
    { value: "channel", label: "Canal" },
] as const

const clampInt = (raw: string, min: number, max: number, fallback: number) => {
    const value = Number(raw)
    return Number.isFinite(value) && raw !== "" ? Math.min(max, Math.max(min, Math.round(value))) : fallback
}

/**
 * Prévia da aba Visualização (OPE-142): o `MemoryUniverse` da lib com memórias de exemplo e a configuração
 * ainda não salva. Nada vem do Engramind (sem SSE nem consultas); a quantidade, os canais e o centro são
 * só da prévia.
 */
export function UniverseLayoutPreview({ config }: { config: UniverseLayoutConfig }) {
    const [count, setCount] = useState<number>(SAMPLE_UNIVERSE_LIMITS.count.default)
    const [channels, setChannels] = useState<number>(SAMPLE_UNIVERSE_LIMITS.channels.default)
    const [center, setCenter] = useState<"agent" | "channel">("agent")
    const sample = useMemo(() => buildSampleUniverse(count, channels), [count, channels])
    const colors = useMemo(() => channelColors(sample.channels), [sample.channels])
    // Similares fictícias (OPE-164): a prévia mostra "Entre similares" sem consultar o Engramind.
    const related = useMemo(() => buildSampleRelated(sample.memories), [sample.memories])
    const memories = useMemo(() => (center === "channel" ? sample.memories.filter((memory) => memory.channel === sample.channels[0]) : sample.memories), [center, sample])
    return (
        <Section title="Prévia" description="Memórias de exemplo, com os valores ainda não salvos. Nada aqui vem do Engramind.">
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                    <Label htmlFor="universe-preview-count" className="text-xs font-semibold">
                        Memórias de exemplo
                    </Label>
                    <Input id="universe-preview-count" type="number" min={SAMPLE_UNIVERSE_LIMITS.count.min} max={SAMPLE_UNIVERSE_LIMITS.count.max} value={count} onChange={(event) => setCount(clampInt(event.target.value, SAMPLE_UNIVERSE_LIMITS.count.min, SAMPLE_UNIVERSE_LIMITS.count.max, count))} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="universe-preview-channels" className="text-xs font-semibold">
                        Canais de exemplo
                    </Label>
                    <Input id="universe-preview-channels" type="number" min={SAMPLE_UNIVERSE_LIMITS.channels.min} max={SAMPLE_UNIVERSE_LIMITS.channels.max} value={channels} onChange={(event) => setChannels(clampInt(event.target.value, SAMPLE_UNIVERSE_LIMITS.channels.min, SAMPLE_UNIVERSE_LIMITS.channels.max, channels))} />
                </div>
                <div className="space-y-1.5">
                    <Label id="universe-preview-center" className="text-xs font-semibold">
                        Universo do
                    </Label>
                    <OptionTabs aria-labelledby="universe-preview-center" options={CENTER_OPTIONS} value={center} onChange={setCenter} size="sm" />
                </div>
            </div>
            <div data-testid="universe-preview" className="overflow-hidden rounded-xl border">
                <EngramindProvider dataSource={opexEngramindSource} mode="manager" universeLayout={config}>
                    <MemoryUniverse
                        center={center === "agent" ? { kind: "agent", id: SAMPLE_AGENT, label: "Agente de exemplo" } : { kind: "channel", id: sample.channels[0]!, label: "Canal de exemplo" }}
                        memories={memories}
                        staleAfterDays={90}
                        channelColors={center === "agent" ? colors : undefined}
                        actions={ACTIONS}
                        layoutConfig={config}
                        related={related}
                        className="h-[28rem] max-md:h-[60dvh]"
                    />
                </EngramindProvider>
            </div>
        </Section>
    )
}

export function UniverseLayoutPreviewSkeleton() {
    return (
        <div className="space-y-4 rounded-xl border p-6" aria-busy="true">
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            <div className="grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }, (_, index) => (
                    <div key={index} className="h-9 animate-pulse rounded-md bg-muted" />
                ))}
            </div>
            <div className="h-[28rem] animate-pulse rounded-xl bg-muted" />
        </div>
    )
}
