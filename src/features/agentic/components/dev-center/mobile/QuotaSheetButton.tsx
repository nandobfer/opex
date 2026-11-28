"use client"

import { useState } from "react"
import { Gauge } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useNow } from "@/hooks/useNow"
import { StatusDot } from "@/features/host-metrics/components/StatusDots"
import { OpencodeQuotaPanel } from "@/features/opencode-quota/components/OpencodeQuotaPanel"
import { useOpencodeQuota, useOpencodeQuotaRealtime } from "@/features/opencode-quota/hooks/useOpencodeQuota"
import { useQuotaPanelPrefs } from "@/features/opencode-quota/hooks/useQuotaPanelPrefs"
import { visibleQuotaLevel } from "@nandobfer/integracoes/modules/integrations/ia/features/opencode-quota/logic"
import { cn } from "@/lib/utils"
import { ActionSheet } from "../../workbench/mobile/ActionSheet"
import { TASKS_MOBILE_ICON_BUTTON_CLASS } from "./header-classes"

/**
 * Quota do OpenCode na coluna Tarefas do celular (`< lg`, OPE-166): um botão de 40 px com a bolinha da pior
 * faixa (a mesma da barra lateral; cinza sem dado confiável) que abre a folha com o mesmo
 * `OpencodeQuotaPanel` (mesma preferência salva). Libera a altura que o painel tomava da lista.
 */
export function QuotaSheetButton() {
    const [open, setOpen] = useState(false)
    const quota = useOpencodeQuota()
    useOpencodeQuotaRealtime()
    const { value: prefs } = useQuotaPanelPrefs()
    const now = useNow(30_000)
    return (
        <>
            <Button type="button" variant="ghost" size="icon" className={cn("relative", TASKS_MOBILE_ICON_BUTTON_CLASS)} onClick={() => setOpen(true)} aria-label="Quota do OpenCode" data-testid="dev-center-quota-button">
                <span className="relative flex">
                    <Gauge className="h-4 w-4" aria-hidden />
                    <StatusDot name="Quota" level={visibleQuotaLevel(quota.data, prefs, now)} side="right" ringClassName="ring-background" />
                </span>
            </Button>
            <ActionSheet open={open} onOpenChange={setOpen} title="Quota do OpenCode" testId="dev-center-quota-sheet">
                <OpencodeQuotaPanel />
            </ActionSheet>
        </>
    )
}
