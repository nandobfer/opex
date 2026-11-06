"use client"

import { Network } from "lucide-react"
import { AgentUniverse, NETWORK_CANVAS_COMPACT_CLASS } from "@engramind/client/react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routineIdentityOf } from "@/features/ai/agents"
import { OPEX_APP_SLUG } from "@/features/engramind/constants"
import { OpexEngramindProvider } from "@/features/engramind/components/OpexEngramindProvider"
import { routineChannelOf } from "../../constants"

/** Agente do rotineiro no Engramind (`opex/rotineiro-<slug>`), o centro do universo. */
export const routineEngramindAgent = (slug: string) => `${OPEX_APP_SLUG}/${routineIdentityOf(slug)}`

/**
 * Aba **Memórias** (OPE-130, D10/D11): um card só, com o universo do agente igual ao de `/engramind`
 * (`AgentUniverse` da lib `@engramind/client`) — todas as memórias que o agente alcança (`opex`, o global
 * dos rotineiros, o canal próprio e os extras), com as mesmas ações e o tempo real pelo SSE da lib.
 * "Nova memória" escolhe o canal entre os assinados; o inicial é o canal próprio do agente.
 */
export function RoutineMemoriesTab({ slug }: { slug: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Network className="h-4 w-4" aria-hidden /> Rede de memórias
                </CardTitle>
                <CardDescription>Todas as memórias que o agente alcança, por canal. Se o agente ainda não aparece, conclua o provisionamento em Configurar.</CardDescription>
            </CardHeader>
            <CardContent>
                <OpexEngramindProvider>
                    <AgentUniverse agent={routineEngramindAgent(slug)} defaultCreateChannel={routineChannelOf(slug)} className={NETWORK_CANVAS_COMPACT_CLASS} />
                </OpexEngramindProvider>
            </CardContent>
        </Card>
    )
}
