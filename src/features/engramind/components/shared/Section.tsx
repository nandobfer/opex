"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { cardMotion } from "@/features/integrations/components/detail/draft"
import { cn } from "@/lib/utils"

interface SectionProps {
    title: string
    info?: ReactNode
    description?: ReactNode
    actions?: ReactNode
    children: ReactNode
    className?: string
    contentClassName?: string
}

/** Card de uma seção das telas do Engramind: título com tooltip, descrição e ações à direita. */
export function Section({ title, info, description, actions, children, className, contentClassName }: SectionProps) {
    return (
        <motion.div {...cardMotion} className={className}>
            <Card>
                <CardHeader className="flex flex-row flex-wrap items-start gap-3 space-y-0">
                    <div className="min-w-0 flex-1 space-y-1">
                        <CardTitle className="flex items-center gap-1.5 text-base">
                            {title}
                            {info && <InfoTooltip text={info} label={title} />}
                        </CardTitle>
                        {description && <CardDescription>{description}</CardDescription>}
                    </div>
                    {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
                </CardHeader>
                <CardContent className={cn("space-y-4", contentClassName)}>{children}</CardContent>
            </Card>
        </motion.div>
    )
}
