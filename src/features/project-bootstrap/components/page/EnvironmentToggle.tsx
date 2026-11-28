"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ToggleCard } from "@/components/ui/toggle-card"
import { useSetBootstrapEnvironment } from "../../hooks/useProjectBootstrap"
import type { ProjectBootstrapDto } from "../../types"
import { environmentToggleState } from "../../view"

/** Chave do ambiente e deploy durante o bootstrap (a mesma da etapa 1), enquanto a mudança é permitida. */
export function EnvironmentToggle({ bootstrap }: { bootstrap: ProjectBootstrapDto }) {
    const mutation = useSetBootstrapEnvironment(bootstrap.id)
    const state = environmentToggleState(bootstrap)
    return (
        <AnimatePresence initial={false}>
            {state.visible && (
                <motion.div key="environment-toggle" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <ToggleCard
                        id="bootstrap-environment-toggle"
                        checked={bootstrap.withEnvironment}
                        onCheckedChange={(checked) => mutation.mutate(checked)}
                        disabled={state.disabled || mutation.isPending}
                        label="Criar ambiente e container Docker"
                        description={state.reason ?? "Desligue para projetos que não rodam em container (bibliotecas, plugins, CLIs): o bootstrap cria o repositório, o vínculo e a central e pula Ambiente e deploy."}
                        onLabel="Com ambiente"
                        offLabel="Sem ambiente"
                    />
                </motion.div>
            )}
        </AnimatePresence>
    )
}
