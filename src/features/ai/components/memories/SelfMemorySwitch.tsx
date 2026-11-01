"use client"

import { Bot } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { MEMORY_CONSUMER_DEFS, type MemoryConsumer } from "../../agents"
import { useSelfMemorySettings } from "../../hooks/useSelfMemorySettings"

/** Chave "Aprendizado autônomo" de um agente (topo da seção de memórias dele). */
export function SelfMemorySwitch({ consumer }: { consumer: MemoryConsumer }) {
    const { query, settings, set, saving } = useSelfMemorySettings()
    const id = `self-memory-${consumer}`
    const label = MEMORY_CONSUMER_DEFS[consumer].label
    return (
        <Card>
            <CardContent className="flex items-start gap-3 py-4">
                <Bot className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1 space-y-0.5">
                    <label htmlFor={id} className="text-sm font-medium">
                        Aprendizado autônomo
                    </label>
                    <p className="text-xs text-muted-foreground">
                        O {label} grava, edita, fixa, inativa e exclui as próprias memórias sozinho quando julgar adequado, na lista mais específica (as do dono ele edita, mas não exclui nem inativa). Desligado, ele só lê as memórias.
                    </p>
                </div>
                {query.isLoading || !settings ? (
                    <Skeleton className="h-6 w-11 rounded-full" data-testid="self-memory-skeleton" />
                ) : (
                    <Switch id={id} checked={settings[consumer]} disabled={saving} onCheckedChange={(value) => set(consumer, value)} aria-label={`Aprendizado autônomo do ${label}`} />
                )}
            </CardContent>
        </Card>
    )
}
