"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { grantedSensitiveTools, MCP_OWNER_DESTRUCTIVE } from "../../api-tokens/scopes"
import type { OpexToolMetaDto } from "@/features/opex-agent/tool-tree"

/**
 * Aviso das ferramentas destrutivas (ou que pedem confirmação) concedidas ao token: destacado quando
 * liberadas (sem confirmação no chat) e discreto quando ficam recusadas por falta do escopo.
 */
export function ApiTokenDestructiveNotice({ scopes, tools }: { scopes: readonly string[]; tools: readonly OpexToolMetaDto[] }) {
    const sensitive = grantedSensitiveTools(scopes, tools)
    const allowed = scopes.includes(MCP_OWNER_DESTRUCTIVE)
    const names = sensitive.map((tool) => tool.label).join(", ")
    return (
        <AnimatePresence initial={false} mode="wait">
            {sensitive.length > 0 && allowed ? (
                <motion.div key="allowed" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                    <Alert variant="destructive" data-testid="destructive-allowed">
                        <AlertTitle>
                            {sensitive.length} {sensitive.length === 1 ? "ferramenta destrutiva liberada" : "ferramentas destrutivas liberadas"} sem confirmação
                        </AlertTitle>
                        <AlertDescription className="text-xs">Quem tiver o token executa, como dono e sem Confirmar/Cancelar: {names}.</AlertDescription>
                    </Alert>
                </motion.div>
            ) : sensitive.length > 0 ? (
                <motion.p key="blocked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="destructive-blocked" className="text-xs text-warning">
                    Sem o escopo destrutivo, estas ficam recusadas: {names}.
                </motion.p>
            ) : null}
        </AnimatePresence>
    )
}
