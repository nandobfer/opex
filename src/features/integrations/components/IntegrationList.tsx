"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { CadastroTableSkeleton } from "@/components/list/CadastroTableSkeleton"
import { TableAction } from "@/components/list/TableAction"
import { IN_DEVELOPMENT_INTEGRATIONS, integrationPath, type IntegrationId } from "@/lib/integrations/catalog"
import { InDevelopmentBadge } from "@/features/layout/components/ModulePlaceholder"
import { useIntegrations } from "../hooks/useIntegrations"
import { useIntegrationStatusLive } from "../hooks/useIntegrationStatusLive"
import { EnvironmentBadge, IntegrationStatusDot } from "./IntegrationBadges"
import { IntegrationDebugDialog } from "./IntegrationDebugDialog"
import { IntegrationTestDialog } from "./IntegrationTestDialog"

const HEADER_CLASS = "text-left p-3 font-medium text-xs uppercase tracking-wider text-muted-foreground"

export const DEBUG_DISABLED_REASON = "Ative o modo debug na integração para acompanhar os logs"

export function IntegrationList() {
    const router = useRouter()
    const { data: all = [], isLoading, isError } = useIntegrations()
    // Integrações-filhas (provedores de IA) aparecem só dentro da página da mãe.
    const integrations = all.filter((integration) => !integration.parent)
    // Integrações futuras: só a linha informativa, sem status, teste, debug nem edição.
    const inDevelopment = IN_DEVELOPMENT_INTEGRATIONS
    const [testing, setTesting] = useState<IntegrationId | null>(null)
    const [debugging, setDebugging] = useState<IntegrationId | null>(null)
    useIntegrationStatusLive(integrations.map((integration) => integration.id))

    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader
                title="Integrações"
                description="Serviços usados pelo app: status da conexão, configuração e logs de debug"
            />

            <CadastroTableCard>
                {isLoading ? (
                    <CadastroTableSkeleton columns={4} rows={6} />
                ) : isError ? (
                    <p className="p-6 text-center text-sm text-destructive">Não foi possível carregar as integrações.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className={`${HEADER_CLASS} w-20 text-center`}>Status</th>
                                    <th className={HEADER_CLASS}>Nome</th>
                                    <th className={`${HEADER_CLASS} w-32`}>Ambiente</th>
                                    <th className={`${HEADER_CLASS} w-40 text-right`}>Ações</th>
                                </tr>
                            </thead>
                            <motion.tbody initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.04 } } }}>
                                {integrations.map((integration) => (
                                    <motion.tr
                                        key={integration.id}
                                        variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                                        transition={{ duration: 0.25, ease: "easeOut" }}
                                        className="border-b transition-colors hover:bg-muted/50"
                                    >
                                        <td className="p-3 text-center">
                                            <span className="inline-flex justify-center">
                                                <IntegrationStatusDot health={integration.health} />
                                            </span>
                                        </td>
                                        <td className="max-w-0 p-3">
                                            <p className="font-medium">{integration.name}</p>
                                            <p className="truncate text-xs text-muted-foreground" title={integration.description}>
                                                {integration.description}
                                            </p>
                                        </td>
                                        <td className="p-3">
                                            <EnvironmentBadge environment={integration.environment} />
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <TableAction type="test" onClick={() => setTesting(integration.id)} />
                                                <TableAction
                                                    type="debug"
                                                    onClick={() => setDebugging(integration.id)}
                                                    disabled={!integration.debugMode}
                                                    disabledReason={DEBUG_DISABLED_REASON}
                                                />
                                                <TableAction type="edit" onClick={() => router.push(integrationPath(integration.id))} />
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))}
                                {inDevelopment.map((item) => (
                                    <motion.tr
                                        key={item.id}
                                        variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
                                        transition={{ duration: 0.25, ease: "easeOut" }}
                                        className="border-b bg-muted/20"
                                        aria-disabled="true"
                                    >
                                        <td className="p-3 text-center">
                                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/30" aria-hidden />
                                        </td>
                                        <td className="max-w-0 p-3">
                                            <p className="font-medium text-muted-foreground">{item.name}</p>
                                            <p className="truncate text-xs text-muted-foreground" title={item.description}>
                                                {item.description}
                                            </p>
                                        </td>
                                        <td className="p-3" />
                                        <td className="p-3 text-right">
                                            <InDevelopmentBadge />
                                        </td>
                                    </motion.tr>
                                ))}
                            </motion.tbody>
                        </table>
                    </div>
                )}
            </CadastroTableCard>

            <IntegrationTestDialog integrationId={testing} onOpenChange={(open) => !open && setTesting(null)} />
            <IntegrationDebugDialog integrationId={debugging} onOpenChange={(open) => !open && setDebugging(null)} />
        </div>
    )
}
