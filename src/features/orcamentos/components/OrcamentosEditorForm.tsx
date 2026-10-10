"use client"

import { motion } from "framer-motion"
import { Users } from "lucide-react"
import type { IntegrationDef } from "@/lib/integrations/catalog"
import type { IntegrationDetailDto } from "@/features/integrations/types"
import { DetailHeader } from "@/features/integrations/components/detail/DetailHeader"
import { IntegrationTabs, type IntegrationTabDef } from "@/features/integrations/components/tabs/IntegrationTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"
import { ORCAMENTOS_TABS, type OrcamentosTab } from "../constants"
import { useOrcamentosRealtime } from "../hooks/useOrcamentos"
import { ClientesTab } from "./clients/ClientesTab"

const TABS: IntegrationTabDef<OrcamentosTab>[] = [{ id: "clientes", label: "Clientes", icon: Users }]

/** Página da integração Orçamentos: cadastro dos clientes do portal público. */
export function OrcamentosEditorForm({ def, data }: { def: IntegrationDef; data: IntegrationDetailDto }) {
    useOrcamentosRealtime()
    const { tab } = useIntegrationTab<OrcamentosTab>(ORCAMENTOS_TABS, "clientes", false, () => undefined)

    return (
        <motion.div key="form" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: "easeOut" }} className="flex min-w-0 flex-col gap-6">
            <DetailHeader def={def} data={data} hasAnySecret={false} />
            <IntegrationTabs tabs={TABS} active={tab} onSelect={() => undefined} pendingTab={null} onConfirmDiscard={() => undefined} onCancelDiscard={() => undefined} label="Seções da integração Orçamentos">
                <ClientesTab />
            </IntegrationTabs>
        </motion.div>
    )
}
