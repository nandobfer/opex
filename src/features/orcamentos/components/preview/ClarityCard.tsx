"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { PREVIEW_CLARITY_DIMENSION_LABELS, type PreviewClarityLevel, type PreviewClarityResult } from "@/features/orcamentos/clarity"

/**
 * Card único da clareza da prévia: alterna entre **sucesso**, **aviso** e **erro** conforme a
 * avaliação da IA (critérios de aceite e localização). No nível de erro, a aprovação fica
 * bloqueada e o cliente é orientado a usar o campo de solicitar ajuste.
 */
const LEVEL_UI: Record<
    PreviewClarityLevel,
    { icon: LucideIcon; title: string; description: string; className: string; iconClassName: string; role: "status" | "alert" }
> = {
    clear: {
        icon: CheckCircle2,
        title: "Especificação clara",
        description: "Os critérios de aceite e a localização estão claros. Você pode aprovar a tarefa.",
        className: "border-success/40 bg-success/10",
        iconClassName: "text-success",
        role: "status",
    },
    vague: {
        icon: AlertTriangle,
        title: "Especificação pouco clara",
        description: "Dá para enviar, mas detalhar os pontos abaixo deixa a tarefa mais precisa.",
        className: "border-warning/40 bg-warning/10",
        iconClassName: "text-warning",
        role: "status",
    },
    missing: {
        icon: AlertCircle,
        title: "Faltam informações",
        description: "É necessário especificar os pontos abaixo. Use o campo de solicitar ajuste para complementar e gerar a prévia de novo.",
        className: "border-destructive/50 bg-destructive/10",
        iconClassName: "text-destructive",
        role: "alert",
    },
}

export function ClarityCard({ result }: { result: PreviewClarityResult }) {
    const ui = LEVEL_UI[result.level]
    const Icon = ui.icon

    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div key={result.level} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <Card className={ui.className} role={ui.role}>
                    <CardContent className="flex items-start gap-3 pt-6">
                        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ui.iconClassName}`} aria-hidden />
                        <div className="space-y-1">
                            <p className="text-sm font-medium">{ui.title}</p>
                            <p className="text-sm text-muted-foreground">{ui.description}</p>
                            {result.issues.length > 0 && (
                                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                    {result.issues.map((issue) => (
                                        <li key={issue.dimension} className="flex gap-1.5">
                                            <span aria-hidden>•</span>
                                            <span>
                                                <span className="font-medium text-foreground">{PREVIEW_CLARITY_DIMENSION_LABELS[issue.dimension]}</span>
                                                {issue.status === "missing" ? " não foi informado" : " está vago"}
                                                {issue.detail ? ` — ${issue.detail}` : ""}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </AnimatePresence>
    )
}
