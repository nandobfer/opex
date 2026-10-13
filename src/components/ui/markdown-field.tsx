"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, Bold, Code2, Eye, Heading2, Image as ImageIcon, Italic, Link2, List, Loader2, Pencil, Quote, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/ui/markdown"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * Estado de um envio exibido inline no campo. A fila de anexos da feature satisfaz este contrato.
 */
export interface MarkdownUploadItem {
    id: string
    name: string
    progress: number
    status: "queued" | "uploading" | "confirming" | "done" | "error" | "canceled"
    error?: string
}

/**
 * Envio de mídia colada/arrastada no campo. A **mesma** fila usada pelo resto da tela é passada
 * pronta: o campo enfileira o arquivo, acompanha o progresso, mostra a falha e deixa tentar de novo
 * (reaproveitando o arquivo já enviado) ou dispensar.
 */
export interface MarkdownUploads {
    /** Enfileira o arquivo e resolve com a referência de Markdown da mídia confirmada. */
    enqueue: (file: File) => { id: string; markdown: Promise<string> }
    items: readonly MarkdownUploadItem[]
    retry: (id: string) => void
    cancel: (id: string) => void
    dismiss: (id: string) => void
}

interface MarkdownFieldProps {
    id?: string
    value: string
    onChange: (value: string) => void
    rows?: number
    placeholder?: string
    invalid?: boolean
    /** Classe do contêiner. */
    className?: string
    /** Habilita colar/arrastar mídia direto no campo (ver `MarkdownUploads`). */
    uploads?: MarkdownUploads
    /** Nome acessível do campo de texto (quando não há `<label>` externo, ex.: comentários). */
    ariaLabel?: string
    /** Rótulo do grupo de abas Escrever/Visualizar (padrão: descrição). */
    tablistLabel?: string
    /** Rótulo da lista de mídias em envio exibida abaixo do campo (padrão: descrição). */
    uploadsLabel?: string
}

interface ToolAction {
    icon: typeof Bold
    label: string
    apply: (selected: string) => { before: string; after: string; placeholder: string }
}

const TOOLS: ToolAction[] = [
    { icon: Bold, label: "Negrito", apply: (s) => ({ before: "**", after: "**", placeholder: s || "texto" }) },
    { icon: Italic, label: "Itálico", apply: (s) => ({ before: "_", after: "_", placeholder: s || "texto" }) },
    { icon: Heading2, label: "Cabeçalho", apply: (s) => ({ before: "## ", after: "", placeholder: s || "Título" }) },
    { icon: Link2, label: "Link", apply: (s) => ({ before: "[", after: "](https://)", placeholder: s || "texto do link" }) },
    { icon: ImageIcon, label: "Imagem", apply: (s) => ({ before: "![", after: "](https://)", placeholder: s || "descrição" }) },
    { icon: List, label: "Lista", apply: (s) => ({ before: "- ", after: "", placeholder: s || "item" }) },
    { icon: Quote, label: "Citação", apply: (s) => ({ before: "> ", after: "", placeholder: s || "citação" }) },
    { icon: Code2, label: "Código", apply: (s) => ({ before: "`", after: "`", placeholder: s || "código" }) },
]

/**
 * Campo de texto Markdown com barra de formatação (negrito, itálico, título, link, imagem, lista,
 * citação e código) e abas Escrever/Visualizar. Reusado no formulário de tarefa (interno), na prévia,
 * no portal do cliente e no formulário de comentários. Com `uploads`, colar ou arrastar uma mídia
 * envia o arquivo e insere a referência do anexo na posição do cursor — com progresso, falha visível
 * e nova tentativa. Os rótulos acessíveis (`ariaLabel`/`tablistLabel`/`uploadsLabel`) permitem que o
 * campo fale de comentários e não só de descrição.
 */
export function MarkdownField({
    id,
    value,
    onChange,
    rows = 8,
    placeholder = "Markdown aceito",
    invalid,
    className,
    uploads,
    ariaLabel,
    tablistLabel = "Editar ou visualizar a descrição",
    uploadsLabel = "Mídias enviadas pela descrição",
}: MarkdownFieldProps) {
    const ref = useRef<HTMLTextAreaElement>(null)
    const [tab, setTab] = useState<"write" | "preview">("write")
    /** Mídias enviadas por ESTE campo: a lista inline acompanha a fila pelos ids. */
    const [jobs, setJobs] = useState<{ id: string; name: string }[]>([])
    // O valor mais recente: a inserção da referência acontece depois do envio, com o texto já digitado.
    const valueRef = useRef(value)
    const mounted = useRef(true)
    useEffect(() => {
        valueRef.current = value
    }, [value])
    useEffect(
        () => () => {
            mounted.current = false
        },
        [],
    )

    const apply = (tool: ToolAction) => {
        const el = ref.current
        if (!el) return
        const start = el.selectionStart
        const end = el.selectionEnd
        const selected = value.slice(start, end)
        const { before, after, placeholder: ph } = tool.apply(selected)
        const body = selected || ph
        const next = value.slice(0, start) + before + body + after + value.slice(end)
        onChange(next)
        requestAnimationFrame(() => {
            el.focus()
            const caret = start + before.length + body.length
            el.setSelectionRange(caret, caret)
        })
    }

    /** Insere o Markdown na posição pedida do **valor atual** (o texto digitado durante o envio fica). */
    const insertAt = (position: number, markdown: string) => {
        const current = valueRef.current
        const pos = Math.max(0, Math.min(position, current.length))
        const before = current.slice(0, pos)
        const after = current.slice(pos)
        const lead = before && !before.endsWith("\n") ? "\n\n" : ""
        const trail = after && !after.startsWith("\n") ? "\n\n" : ""
        onChange(`${before}${lead}${markdown}${trail}${after}`)
    }

    const dismiss = (jobId: string) => {
        uploads?.dismiss(jobId)
        setJobs((prev) => prev.filter((job) => job.id !== jobId))
    }

    /** Envia cada mídia e insere a referência **quando o servidor confirma** (nada é inserido na falha). */
    const sendFiles = (files: File[], position: number) => {
        if (!uploads || files.length === 0) return
        for (const file of files) {
            const { id, markdown } = uploads.enqueue(file)
            if (!id) continue
            setJobs((prev) => [...prev, { id, name: file.name || "mídia colada" }])
            void markdown
                .then((reference) => {
                    if (!mounted.current) return
                    insertAt(position, reference.trim())
                    setJobs((prev) => prev.filter((job) => job.id !== id))
                })
                // A falha fica visível na lista inline (tentar de novo / descartar): a promessa só é
                // rejeitada ao cancelar ou descartar, para a nova tentativa ainda inserir a referência.
                .catch(() => undefined)
        }
    }

    const handleFiles = (event: { preventDefault: () => void }, files: File[], position: number) => {
        if (!uploads || files.length === 0) return
        event.preventDefault()
        sendFiles(files, position)
    }

    const pending = uploads ? jobs.flatMap((job) => (uploads.items.some((item) => item.id === job.id) ? [{ job, item: uploads.items.find((item) => item.id === job.id)! }] : [])) : []

    return (
        <div className={cn("space-y-2", className)}>
            <div role="tablist" aria-label={tablistLabel} className="flex gap-1 rounded-lg bg-muted p-1">
                {(
                    [
                        { id: "write", label: "Escrever", icon: Pencil },
                        { id: "preview", label: "Visualizar", icon: Eye },
                    ] as const
                ).map((item) => {
                    const active = tab === item.id
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setTab(item.id)}
                            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                            <item.icon className="h-3.5 w-3.5" aria-hidden />
                            {item.label}
                        </button>
                    )
                })}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                    {tab === "write" ? (
                        <div className="rounded-md border focus-within:ring-2 focus-within:ring-ring">
                            <div className="flex flex-wrap gap-0.5 border-b p-1" role="toolbar" aria-label="Formatação">
                                {TOOLS.map((tool) => (
                                    <Button key={tool.label} type="button" variant="ghost" size="icon" className="h-7 w-7" title={tool.label} aria-label={tool.label} onMouseDown={(event) => event.preventDefault()} onClick={() => apply(tool)}>
                                        <tool.icon className="h-3.5 w-3.5" aria-hidden />
                                    </Button>
                                ))}
                            </div>
                            <Textarea
                                ref={ref}
                                id={id}
                                rows={rows}
                                placeholder={placeholder}
                                value={value}
                                onChange={(event) => onChange(event.target.value)}
                                aria-label={ariaLabel}
                                aria-invalid={invalid ? true : undefined}
                                className="rounded-t-none border-0 shadow-none focus-visible:ring-0"
                                onPaste={(event) => {
                                    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.size > 0)
                                    if (files.length === 0) return
                                    handleFiles(event, files, event.currentTarget.selectionStart)
                                }}
                                onDrop={(event) => {
                                    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.size > 0)
                                    if (files.length === 0) return
                                    handleFiles(event, files, event.currentTarget.selectionStart)
                                }}
                                onDragOver={(event) => {
                                    if (uploads) event.preventDefault()
                                }}
                            />
                        </div>
                    ) : (
                        <div className="min-h-[172px] rounded-md border bg-muted/30 p-3">
                            {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">Nada para visualizar ainda.</p>}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
            <AnimatePresence>
                {pending.length > 0 && (
                    <motion.ul initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="space-y-1" aria-label={uploadsLabel} aria-live="polite">
                        {pending.map(({ job, item }) => {
                            const failed = item.status === "error"
                            const canceled = item.status === "canceled"
                            const settled = failed || canceled
                            return (
                                <li key={job.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                                    {settled ? <AlertCircle className="h-3 w-3 shrink-0 text-destructive" aria-hidden /> : <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />}
                                    <span className="min-w-0 truncate" title={job.name}>
                                        {failed ? `Falha ao enviar ${job.name}` : canceled ? `Envio de ${job.name} cancelado` : `${item.status === "confirming" ? "Confirmando" : "Enviando"} ${job.name}…`}
                                    </span>
                                    {failed && item.error && (
                                        <span className="min-w-0 truncate text-destructive" title={item.error}>
                                            {item.error}
                                        </span>
                                    )}
                                    {settled ? (
                                        <span className="ml-auto flex shrink-0 items-center gap-0.5">
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => uploads?.retry(job.id)} aria-label={`Tentar enviar ${job.name} novamente`} title="Tentar novamente">
                                                <RotateCcw className="h-3 w-3" aria-hidden />
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismiss(job.id)} aria-label={`Descartar ${job.name}`} title="Descartar">
                                                <X className="h-3 w-3" aria-hidden />
                                            </Button>
                                        </span>
                                    ) : (
                                        <span className="ml-auto flex shrink-0 items-center gap-2">
                                            <Progress value={item.progress} className="h-1 w-16" />
                                            <span className="w-8 text-right">{item.progress}%</span>
                                        </span>
                                    )}
                                </li>
                            )
                        })}
                    </motion.ul>
                )}
            </AnimatePresence>
        </div>
    )
}
