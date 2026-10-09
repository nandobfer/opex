"use client"

import { useState } from "react"
import { Bug } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { IntegrationDebugConsole } from "@/features/integrations/components/IntegrationDebugConsole"
import { centralLogScope } from "../../constants"
import { useTestCentral } from "../../hooks/useAgentic"

/** Aba Logs: terminal com as operações da central (turnos, testes, PRs), em tempo real. */
export function CentralLogsSection({ centralId }: { centralId: string }) {
    const test = useTestCentral(centralId)
    const [maximized, setMaximized] = useState(false)
    return (
        <Card className={cn("flex flex-col", maximized ? "fixed inset-4 z-50" : "h-[560px]")}>
            <CardContent className="flex min-h-0 flex-1 flex-col pt-6">
                <IntegrationDebugConsole
                    integrationId="ai"
                    scope={centralLogScope(centralId)}
                    onTest={() => test.mutateAsync()}
                    className="flex-1"
                    consoleClassName="min-h-0 flex-1"
                    maximized={maximized}
                    onMaximizedChange={setMaximized}
                    title={
                        <h2 className="flex items-center gap-2 text-base font-semibold">
                            <Bug className="h-4 w-4 text-amber-600" aria-hidden /> Logs da central
                        </h2>
                    }
                    description="Retidos por 48 h. O botão de teste confere diretório, branches, gh e docker compose."
                />
            </CardContent>
        </Card>
    )
}
