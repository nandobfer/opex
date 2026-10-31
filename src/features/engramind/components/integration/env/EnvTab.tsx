"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, FolderCog, Loader2, Power, RefreshCcw, Save, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { ENV_PROJECT_KEYS, type EnvEditableKey } from "../../../constants"
import { ENV_VALUE_SCHEMAS } from "../../../schemas/env"
import type { EnvFileDto } from "../../../types"
import { useEngramindEnv, useSaveEngramindEnv } from "../../../hooks/useEngramindEnv"
import { formatDateTime } from "../../shared/format"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { Section } from "../../shared/Section"
import { ApplyRestartDialog } from "./ApplyRestartDialog"
import { EnvVarField } from "./EnvVarField"

const SECRET_KEY = "LITESTREAM_SECRET_ACCESS_KEY"

/** Aba Variáveis de ambiente: o `.env` do Ambiente vinculado, lido e gravado no host pelo OpenCode. */
export function EnvTab({ onDirtyChange, onConfigure }: { onDirtyChange: (dirty: boolean) => void; onConfigure: () => void }) {
    const env = useEngramindEnv()
    if (env.error && apiErrorCode(env.error) === "ENGRAMIND_NO_ENVIRONMENT")
        return <EmptyState icon={FolderCog} title="Vincule o Ambiente do Engramind" description={apiErrorMessage(env.error)} actionLabel="Ir para Conexão" onAction={onConfigure} />
    return (
        <QueryBoundary isLoading={env.isLoading} error={env.error} onRetry={() => void env.refetch()} skeleton={<EnvSkeleton />} onConfigure={onConfigure}>
            {env.data && <EnvForm key={env.data.hash} file={env.data} onDirtyChange={onDirtyChange} onReload={() => void env.refetch()} />}
        </QueryBoundary>
    )
}

function EnvForm({ file, onDirtyChange, onReload }: { file: EnvFileDto; onDirtyChange: (dirty: boolean) => void; onReload: () => void }) {
    const saved = useMemo(() => Object.fromEntries(file.entries.filter((entry) => entry.kind !== "read-only").map((entry) => [entry.key, entry.value ?? ""])), [file])
    const [draft, setDraft] = useState<Record<string, string>>(saved)
    const [applying, setApplying] = useState(false)
    const [changed, setChanged] = useState(false)
    const save = useSaveEngramindEnv()
    const changes = Object.fromEntries(Object.entries(draft).filter(([key, value]) => key !== SECRET_KEY && value !== saved[key] && file.entries.find((entry) => entry.key === key)?.kind === "editable"))
    const secret = draft[SECRET_KEY] ?? ""
    const dirty = Object.keys(changes).length > 0 || secret !== ""
    useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
    const invalid = Object.entries(changes).some(([key, value]) => !ENV_VALUE_SCHEMAS[key as EnvEditableKey].safeParse(value).success)
    const recreatesProject = (file.pendingApply?.keys ?? []).some((key) => ENV_PROJECT_KEYS.includes(key))
    const submit = async () => {
        try {
            await save.mutateAsync({ hash: file.hash, changes, ...(secret ? { litestreamSecret: secret } : {}) })
        } catch (error) {
            if (apiErrorCode(error) === "ENGRAMIND_ENV_CHANGED") setChanged(true)
            toast.error(apiErrorMessage(error, "Não foi possível gravar o .env"))
        }
    }
    return (
        <div className="flex flex-col gap-6">
            <AnimatePresence initial={false}>
                {(file.pendingApply || file.apply?.status === "running") && (
                    <motion.div key="pending" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm">
                            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                            <span>
                                {file.apply?.status === "running" ? "Reinicialização em andamento." : `Alterações pendentes de aplicação (${file.pendingApply?.keys.join(", ")}) desde ${formatDateTime(file.pendingApply?.at)}.`}
                            </span>
                            <Button type="button" size="sm" variant="destructive" className="ml-auto" onClick={() => setApplying(true)}>
                                <Power className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {file.apply?.status === "running" ? "Ver o log" : "Aplicar e reiniciar"}
                            </Button>
                        </div>
                    </motion.div>
                )}
                {changed && (
                    <motion.div key="changed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 rounded-xl border border-destructive/50 p-3 text-sm text-destructive">
                        O arquivo mudou no servidor; recarregue.
                        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={onReload}>
                            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Recarregar
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
            <Section
                title="Variáveis de ambiente"
                info="Infraestrutura do Engramind (o comportamento vive nas Configurações). Lidas e gravadas no host pelo OpenCode; os valores sensíveis nunca saem do servidor. Comentários, ordem e variáveis desconhecidas são preservados."
                description={`${file.environment.name} · ${file.environment.dir}/.env`}
                actions={
                    !file.pendingApply && file.apply?.status !== "running" ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setApplying(true)}>
                            <Power className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Aplicar e reiniciar
                        </Button>
                    ) : null
                }
            >
                <div className={FORM_GRID}>
                    {file.entries.map((entry) => (
                        <EnvVarField key={entry.key} entry={entry} value={draft[entry.key] ?? ""} dirty={entry.key === SECRET_KEY ? secret !== "" : entry.key in changes} onChange={(value) => setDraft((prev) => ({ ...prev, [entry.key]: value }))} />
                    ))}
                </div>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setDraft(saved)} disabled={!dirty || save.isPending}>
                        <Undo2 className="mr-2 h-4 w-4" aria-hidden /> Desfazer
                    </Button>
                    <Button type="button" onClick={() => void submit()} disabled={!dirty || invalid || save.isPending}>
                        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />} Salvar
                    </Button>
                </div>
            </Section>
            {applying && <ApplyRestartDialog open onOpenChange={setApplying} running={file.apply?.status === "running"} recreatesProject={recreatesProject} />}
        </div>
    )
}

function EnvSkeleton() {
    return (
        <div className="space-y-4 rounded-xl border p-6" aria-busy="true">
            <Skeleton className="h-5 w-48" />
            <div className={FORM_GRID}>
                {Array.from({ length: 12 }, (_, index) => (
                    <Skeleton key={index} className="h-20 w-full rounded-lg" />
                ))}
            </div>
        </div>
    )
}
