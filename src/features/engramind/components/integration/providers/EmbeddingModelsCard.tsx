"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ListTree, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { OptionTabs } from "@/components/ui/option-tabs"
import { apiErrorMessage } from "@/lib/api"
import { EMBEDDING_PROVIDERS, NO_LISTING_PROVIDERS } from "../../../constants"
import { engramindSend } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"
import { Section } from "../../shared/Section"

const PROVIDER_HELP: Record<string, string> = {
    local: "fastembed no próprio Engramind (sem custo por chamada).",
    openai_compatible: "Qualquer API com POST /embeddings (OpenAI, OpenRouter, Mistral, LM Studio…).",
    ollama: "Servidor Ollama (/api/embed).",
    gemini: "Não lista modelos: escolha pela documentação do Gemini.",
    off: "Embeddings desligados: só busca textual.",
}

interface ModelEntry {
    id: string
    dimensions: number | null
    description: string | null
}

/** "Listar modelos de embedding" por provedor (local, ollama, openai_compatible). */
export function EmbeddingModelsCard({ currentProvider }: { currentProvider: string | null }) {
    const [provider, setProvider] = useState<string>(currentProvider && !NO_LISTING_PROVIDERS.includes(currentProvider) ? currentProvider : "local")
    const [models, setModels] = useState<ModelEntry[] | null>(null)
    const [pending, setPending] = useState(false)
    const list = async () => {
        setPending(true)
        try {
            const result = await engramindSend<{ models: ModelEntry[] }>("post", "providers/embedding/models", { provider })
            setModels(result.models)
        } catch (error) {
            toast.error(apiErrorMessage(error, "Não foi possível listar os modelos"))
        } finally {
            setPending(false)
        }
    }
    return (
        <Section title="Modelos de embedding" info="Lista os modelos de embedding (nunca de chat) do provedor, com a URL e a chave configuradas no Engramind.">
            <div className="grid gap-4">
                <InfoField id="models-provider" label="Provedor" info={PROVIDER_HELP[provider]}>
                    <OptionTabs
                        id="models-provider"
                        aria-label="Provedor"
                        size="sm"
                        options={EMBEDDING_PROVIDERS.filter((item) => item !== "off").map((item) => ({ value: item, label: item, tooltip: PROVIDER_HELP[item], disabled: NO_LISTING_PROVIDERS.includes(item) }))}
                        value={provider}
                        onChange={(next) => {
                            setProvider(next)
                            setModels(null)
                        }}
                    />
                </InfoField>
            </div>
            <Button type="button" variant="outline" onClick={() => void list()} disabled={pending}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ListTree className="mr-2 h-4 w-4" aria-hidden />} Listar modelos
            </Button>
            <AnimatePresence initial={false}>
                {models && (
                    <motion.ul key="models" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="max-h-72 divide-y overflow-auto rounded-lg border text-sm">
                        {models.length === 0 ? (
                            <li className="p-3 text-muted-foreground">Nenhum modelo encontrado.</li>
                        ) : (
                            models.map((model) => (
                                <li key={model.id} className="flex flex-wrap items-baseline gap-2 p-2.5">
                                    <span className="font-mono text-xs">{model.id}</span>
                                    {model.dimensions && <span className="text-xs text-muted-foreground">{model.dimensions} dimensões</span>}
                                    {model.description && <span className="w-full text-xs text-muted-foreground">{model.description}</span>}
                                </li>
                            ))
                        )}
                    </motion.ul>
                )}
            </AnimatePresence>
        </Section>
    )
}
