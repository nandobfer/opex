"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import type { LocalDockerOverrideMode } from "../schemas"
import { useLocalDockerOverride, useLocalDockerRealtime, useSetLocalDockerOverride } from "../hooks/useLocalDocker"

const OPTIONS: { value: LocalDockerOverrideMode; label: string }[] = [
    { value: "inherit", label: "Padrão global" },
    { value: "on", label: "Sempre que aberto" },
    { value: "off", label: "Nunca" },
]

const DESCRIPTIONS: Record<LocalDockerOverrideMode, string> = {
    inherit: "Segue a chave \"Usar o PC quando o túnel estiver aberto\" (Integrações › Builder Machine › Conexão com o PC).",
    on: "Com o túnel aberto, as prévias desta central sempre vão para o PC.",
    off: "As prévias desta central sempre rodam no servidor, mesmo com o túnel aberto.",
}

/** Aba Ambiente da central: herda, força ou dispensa a máquina local. Salva na hora. */
export function LocalDockerCentralCard({ centralId }: { centralId: string }) {
    useLocalDockerRealtime()
    const query = useLocalDockerOverride(centralId)
    const save = useSetLocalDockerOverride(centralId)
    const mode = query.data?.mode ?? "inherit"
    return (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Builder Machine</CardTitle>
                    <CardDescription>{DESCRIPTIONS[mode]}</CardDescription>
                </CardHeader>
                <CardContent>
                    {query.isLoading ? (
                        <Skeleton className="h-9 w-full" />
                    ) : (
                        <OptionTabs<LocalDockerOverrideMode> id={`local-docker-central-${centralId}`} aria-label="Builder Machine da central" options={OPTIONS} value={mode} onChange={(next) => save.mutate(next)} disabled={query.isError} className="w-full" />
                    )}
                </CardContent>
            </Card>
        </motion.div>
    )
}
