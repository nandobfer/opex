"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface FormSectionProps {
    /** Âncora da seção (o índice leva até ela). */
    id: string
    title: string
    description?: ReactNode
    /** Ações no cabeçalho da seção (ex.: "Ler de novo"). */
    actions?: ReactNode
    children: ReactNode
    className?: string
}

/** Classe da caixa de uma seção (o skeleton usa a mesma). */
export const FORM_SECTION_CLASS = "scroll-mt-6"

/** Uma seção de uma página de formulário: card com âncora, título, descrição e ações. */
export function FormSection({ id, title, description, actions, children, className }: FormSectionProps) {
    return (
        <motion.section id={id} aria-labelledby={`${id}-title`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={cn(FORM_SECTION_CLASS, className)}>
            <Card>
                <CardContent className="space-y-5 pt-6">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                            <h2 id={`${id}-title`} className="text-base font-semibold">
                                {title}
                            </h2>
                            {description && <p className="text-sm text-muted-foreground">{description}</p>}
                        </div>
                        {actions && <div className="flex flex-wrap items-center gap-1">{actions}</div>}
                    </div>
                    {children}
                </CardContent>
            </Card>
        </motion.section>
    )
}
