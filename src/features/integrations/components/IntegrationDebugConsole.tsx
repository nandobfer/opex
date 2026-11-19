"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { PlugZap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getIntegrationDef, type IntegrationId } from "@/lib/integrations/catalog"
import { useIntegrationDebugLogs } from "../hooks/useIntegrationDebugLogs"
import { useIntegrationTestStream } from "../hooks/useIntegrationTestStream"
import { DebugLogConsole, useDebugTerminal } from "./DebugLogConsole"

export { RealtimeIndicator } from "./RealtimeIndicator"

interface IntegrationDebugConsoleProps {
    integrationId: IntegrationId
    /** Título à esquerda da barra (uma linha); os controles ficam à direita, alinhados a ele. */
    title: ReactNode
    /** Texto auxiliar em linha própria, abaixo da barra. */
    description?: ReactNode
    /** Ações extras após o Atualizar (ex.: Fechar do modal). */
    actions?: ReactNode
    className?: string
    consoleClassName?: string
    /** Estado de maximização (controlado pelo pai, que sabe qual elemento maximizar). */
    maximized?: boolean
    /** Sem ele, o botão Maximizar não aparece. */
    onMaximizedChange?: (maximized: boolean) => void
    /** Mostra só as linhas deste escopo (`data.scope`, ex.: uma central de desenvolvimento). */
    scope?: string
    /** Teste próprio no lugar do teste de conexão da integração (as linhas chegam pelo log). */
    onTest?: () => Promise<unknown>
}

/** Espera a gravação em lote dos últimos eventos de debug antes de buscar sem Pusher. */
export const TEST_REFRESH_DELAY_MS = 800

/**
 * Terminal com os logs de debug da integração (`DebugLogConsole` + a fonte da integração). Barra
 * superior: título à esquerda; à direita, o indicador de tempo real, Testar conexão e Atualizar
 * (busca os eventos gravados desde o último recebido — funciona com ou sem Pusher).
 *
 * O teste roda no próprio terminal, sem modal: com o debug ligado, cada etapa do teste já é
 * gravada como evento de debug (`[teste] ...`), então as linhas chegam pelo mesmo fluxo dos
 * demais eventos. Os eventos do stream são ignorados aqui para não duplicar; ao terminar,
 * busca o que faltar (sem Pusher é a única via).
 */
export function IntegrationDebugConsole({ integrationId, title, description, actions, className, consoleClassName, maximized = false, onMaximizedChange, scope, onTest }: IntegrationDebugConsoleProps) {
    const def = getIntegrationDef(integrationId)
    const terminal = useDebugTerminal(def.name)
    const logs = useIntegrationDebugLogs(integrationId, { enabled: true, onLines: terminal.onLines, scope })

    const refreshRef = useRef(logs.refresh)
    useEffect(() => {
        refreshRef.current = logs.refresh
    })
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }, [])

    const ignoreStreamEvent = useCallback(() => {}, [])
    const { state: testState, start: startTest } = useIntegrationTestStream(integrationId, ignoreStreamEvent)
    const [customTesting, setCustomTesting] = useState(false)
    const testing = testState === "running" || customTesting

    const runTest = useCallback(async () => {
        if (onTest) {
            setCustomTesting(true)
            await onTest().catch(() => undefined)
            setCustomTesting(false)
        } else {
            await startTest()
        }
        if (refreshTimer.current) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => void refreshRef.current(), TEST_REFRESH_DELAY_MS)
    }, [onTest, startTest])

    return (
        <DebugLogConsole
            terminal={terminal}
            logs={logs}
            title={title}
            description={description}
            actions={actions}
            className={className}
            consoleClassName={consoleClassName}
            maximized={maximized}
            onMaximizedChange={onMaximizedChange}
            extraActions={
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void runTest()} disabled={testing} aria-label="Testar conexão">
                                <motion.span className="flex" animate={testing ? { rotate: 360 } : { rotate: 0 }} transition={testing ? { repeat: Infinity, duration: 1, ease: "linear" } : { duration: 0.2 }}>
                                    <PlugZap className="h-4 w-4" />
                                </motion.span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{testing ? "Testando conexão..." : "Testar conexão"}</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            }
        />
    )
}
