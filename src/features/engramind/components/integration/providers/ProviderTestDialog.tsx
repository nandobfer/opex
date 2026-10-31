"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, Play } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { apiErrorMessage } from "@/lib/api"
import { engramindSend } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"

interface ProviderTestDialogProps {
    kind: "redator" | "embedding"
    open: boolean
    onOpenChange: (open: boolean) => void
}

const COPY = {
    redator: { title: "Testar Redator", route: "providers/redator/test", sample: "Use cargo nextest para os testes locais.", proposal: '{ "redator.model": "gpt-4o-mini" }', prefix: "redator." },
    embedding: { title: "Testar embedding", route: "providers/embedding/test", sample: "Use cargo nextest", proposal: '{ "embedding.model": "multilingual-e5-base" }', prefix: "embedding." },
} as const

/** Testa o provedor com a configuração atual ou com uma proposta (não é gravada). */
export function ProviderTestDialog({ kind, open, onOpenChange }: ProviderTestDialogProps) {
    const copy = COPY[kind]
    const [text, setText] = useState<string>(copy.sample)
    const [proposal, setProposal] = useState("")
    const [result, setResult] = useState<Record<string, unknown> | null>(null)
    const [pending, setPending] = useState(false)
    let proposalError: string | null = null
    let settings: Record<string, unknown> | undefined
    if (proposal.trim()) {
        try {
            const parsed: unknown = JSON.parse(proposal)
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) proposalError = "Use um objeto JSON { \"chave\": valor }"
            else if (Object.keys(parsed).some((key) => !key.startsWith(copy.prefix))) proposalError = `Só chaves ${copy.prefix}*`
            else settings = parsed as Record<string, unknown>
        } catch {
            proposalError = "JSON inválido"
        }
    }
    const run = async () => {
        setPending(true)
        setResult(null)
        try {
            setResult(await engramindSend<Record<string, unknown>>("post", copy.route, { text, ...(settings ? { settings } : {}) }))
        } catch (error) {
            toast.error(apiErrorMessage(error, "O teste falhou"))
        } finally {
            setPending(false)
        }
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription>Nada é gravado: o teste usa a configuração atual ou a proposta abaixo.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <InfoField id={`${kind}-test-text`} label="Texto de exemplo" info="Texto enviado ao provedor só para o teste.">
                        <Textarea id={`${kind}-test-text`} rows={3} value={text} onChange={(event) => setText(event.target.value)} />
                    </InfoField>
                    <InfoField id={`${kind}-test-proposal`} label="Configuração proposta (opcional)" info={`Objeto JSON com chaves ${copy.prefix}* (inclusive a chave de API em claro) usado só neste teste.`} error={proposalError ?? undefined}>
                        <Textarea id={`${kind}-test-proposal`} rows={3} className="font-mono text-xs" placeholder={copy.proposal} value={proposal} onChange={(event) => setProposal(event.target.value)} />
                    </InfoField>
                    <AnimatePresence initial={false}>
                        {result && (
                            <motion.dl key="result" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="grid gap-2 overflow-hidden rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                                {Object.entries(result).map(([key, value]) => (
                                    <div key={key} className={typeof value === "string" && value.length > 60 ? "sm:col-span-2" : undefined}>
                                        <dt className="text-muted-foreground">{key}</dt>
                                        <dd className="break-words font-mono">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                                    </div>
                                ))}
                            </motion.dl>
                        )}
                    </AnimatePresence>
                </div>
                <DialogFooter>
                    <Button type="button" onClick={() => void run()} disabled={!text.trim() || Boolean(proposalError) || pending}>
                        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Play className="mr-2 h-4 w-4" aria-hidden />} Testar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
