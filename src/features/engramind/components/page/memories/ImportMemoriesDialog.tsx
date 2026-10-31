"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FileUp, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { MEMORY_HELP } from "../../../help/identities"
import { batchLimitError, parseImportFile, type ImportParseResult } from "../../../schemas/import"
import type { EngramindChannel, ImportResult } from "../../../types"
import { useEngramindMutation } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"

/** Importar: canal ativo + arquivo JSON (lista ou `{ memories }`) ou JSONL, prévia com erros por índice e resultado. */
export function ImportMemoriesDialog({ channels, maxBatch, onOpenChange }: { channels: EngramindChannel[]; maxBatch: number | null; onOpenChange: (open: boolean) => void }) {
    const active = channels.filter((channel) => !channel.archived_at)
    const [channel, setChannel] = useState(active[0]?.slug ?? "")
    const [file, setFile] = useState<{ name: string; parsed: ImportParseResult } | null>(null)
    const [result, setResult] = useState<ImportResult | null>(null)
    const send = useEngramindMutation((body: { channel: string; memories: ImportParseResult["items"] }) => api.post<ApiResponse<ImportResult>>("/engramind/memories/import", body).then((res) => unwrapApi(res.data)), { invalidate: ["memories", "channels"], silentError: true })
    const tooLarge = file ? batchLimitError(file.parsed.items.length + file.parsed.errors.length, maxBatch) : null
    const blocked = !file || Boolean(file.parsed.fatal) || file.parsed.errors.length > 0 || file.parsed.items.length === 0 || Boolean(tooLarge) || !channel
    const pick = async (selected: File | undefined) => {
        setResult(null)
        if (!selected) return setFile(null)
        setFile({ name: selected.name, parsed: parseImportFile(await selected.text()) })
    }
    const submit = async () => {
        if (!file) return
        try {
            setResult(await send.mutateAsync({ channel, memories: file.parsed.items }))
        } catch (error) {
            toast.error(apiErrorMessage(error, "Não foi possível importar"))
        }
    }
    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Importar memórias</DialogTitle>
                    <DialogDescription>Tudo é validado antes de gravar: um item inválido recusa o lote. {MEMORY_HELP.importKey}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <InfoField id="import-channel" label="Canal" info="Canal ativo que recebe as memórias (um canal por arquivo).">
                        <Select value={channel} onValueChange={setChannel}>
                            <SelectTrigger id="import-channel" className="bg-transparent">
                                <SelectValue placeholder="Escolha o canal" />
                            </SelectTrigger>
                            <SelectContent>
                                {active.map((item) => (
                                    <SelectItem key={item.id} value={item.slug}>
                                        {item.slug}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </InfoField>
                    <InfoField id="import-file" label="Arquivo" info={`Lista JSON, { "memories": [...] } ou JSONL. Cada item: text (obrigatório), category, created_at, status (active/permanent), author { app, agent } e origin.${maxBatch ? ` Até ${maxBatch} itens (limits.max_batch).` : ""}`}>
                        <Input id="import-file" type="file" accept=".json,.jsonl,application/json" onChange={(event) => void pick(event.target.files?.[0])} />
                    </InfoField>
                    <AnimatePresence mode="wait" initial={false}>
                        {result ? (
                            <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 rounded-lg border p-3 text-sm">
                                <p className="text-success">{result.created.length} memória(s) criada(s).</p>
                                {result.duplicates.length > 0 && (
                                    <div>
                                        <p>{result.duplicates.length} duplicada(s) (já existiam):</p>
                                        <ul className="max-h-32 overflow-auto font-mono text-xs text-muted-foreground">
                                            {result.duplicates.map((item) => (
                                                <li key={item.index}>
                                                    item {item.index + 1} → {item.existing_id}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </motion.div>
                        ) : file ? (
                            <motion.div key="preview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 rounded-lg border p-3 text-sm">
                                {file.parsed.fatal ? (
                                    <p className="text-destructive">{file.parsed.fatal}</p>
                                ) : (
                                    <p>
                                        {file.name}: {file.parsed.items.length} memória(s) válida(s)
                                        {file.parsed.errors.length > 0 && <span className="text-destructive">, {file.parsed.errors.length} com erro</span>}
                                    </p>
                                )}
                                {tooLarge && <p className="text-destructive">{tooLarge}</p>}
                                {file.parsed.errors.length > 0 && (
                                    <ul className="max-h-40 overflow-auto text-xs text-destructive">
                                        {file.parsed.errors.map((error) => (
                                            <li key={error.index}>
                                                Item {error.index + 1}: {error.message}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </div>
                <DialogFooter>
                    {result ? (
                        <Button type="button" onClick={() => onOpenChange(false)}>
                            Concluir
                        </Button>
                    ) : (
                        <Button type="button" onClick={() => void submit()} disabled={blocked || send.isPending}>
                            {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="mr-2 h-4 w-4" aria-hidden />} Importar
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
