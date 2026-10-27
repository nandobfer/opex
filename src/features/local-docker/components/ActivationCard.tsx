"use client"

import type { Dispatch, SetStateAction } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleCard } from "@/components/ui/toggle-card"
import { cardMotion, type Draft } from "@/features/integrations/components/detail/draft"

/**
 * Liga/desliga a integração (campo público `active`, gravado com o Salvar da página). Desativada, as
 * prévias ficam no servidor e as rotas da Builder Machine respondem 404.
 */
export function ActivationCard({ draft, setDraft, savedActive }: { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; savedActive: boolean }) {
    const active = draft.publicValues.active === true
    const deactivating = savedActive && !active
    return (
        <motion.div {...cardMotion}>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Ativação</CardTitle>
                    <CardDescription>Ativa, as prévias das centrais podem ir para o Docker do seu PC pelo túnel; desativada, tudo roda no servidor.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <ToggleCard
                        id="builder-machine-active"
                        checked={active}
                        onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, publicValues: { ...prev.publicValues, active: checked } }))}
                        label="Integração ativa"
                        description="Ao ativar, a rotina de limpeza do PC é ligada em Integrações › Crons"
                    />
                    <AnimatePresence initial={false}>
                        {deactivating && (
                            <motion.p
                                key="warning"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="text-xs text-destructive"
                            >
                                Desativar não derruba as prévias que estão no PC: os containers continuam lá. Apague-os antes na aba Túnel do Docker do PC, se quiser.
                            </motion.p>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>
        </motion.div>
    )
}
