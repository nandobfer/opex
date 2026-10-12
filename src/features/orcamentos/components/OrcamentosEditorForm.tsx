"use client"

import { motion } from "framer-motion"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import { useOrcamentosRealtime } from "../hooks/useOrcamentos"
import { ClientesTab } from "./clients/ClientesTab"

/**
 * Página da integração Clientes: cadastro dos clientes do portal público. O título já é "Clientes",
 * então a lista aparece diretamente — sem abas nem card interno.
 */
export function OrcamentosEditorForm({ def, data }: { def: IntegrationDef; data: IntegrationDetailDto }) {
    useOrcamentosRealtime()

    return (
        <motion.div key="form" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: "easeOut" }} className="flex min-w-0 flex-col gap-6">
            <DetailHeader def={def} data={data} hasAnySecret={false} />
            <ClientesTab />
        </motion.div>
    )
}
