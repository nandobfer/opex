"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Card } from "@/components/ui/card"
import { ENV_CARD_ACTIONS_CLASS, ENV_CARD_CLASS, ENV_CARD_FOOTER_CLASS, ENV_CARD_HEADER_CLASS, ENV_CARD_SECTION_CLASS, ENV_CARD_TITLE_CLASS } from "./environment-card-layout"

interface EnvironmentCardFrameProps {
    /** Título: estado, nome, slug e selos. */
    title: ReactNode
    actions?: ReactNode
    /** Faixa de aviso (opcional; entra e sai animada). */
    notice?: ReactNode
    containers: ReactNode
    footer?: ReactNode
}

/** Moldura do card de ambiente (dono e portal): cabeçalho, faixa de aviso, containers e rodapé. */
export function EnvironmentCardFrame({ title, actions, notice, containers, footer }: EnvironmentCardFrameProps) {
    return (
        <Card className={ENV_CARD_CLASS}>
            <div className={ENV_CARD_HEADER_CLASS}>
                <div className={ENV_CARD_TITLE_CLASS}>{title}</div>
                {actions ? <div className={ENV_CARD_ACTIONS_CLASS}>{actions}</div> : null}
            </div>
            <AnimatePresence initial={false}>
                {notice ? (
                    <motion.div key="notice" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        {notice}
                    </motion.div>
                ) : null}
            </AnimatePresence>
            <div className={ENV_CARD_SECTION_CLASS}>{containers}</div>
            {footer ? <div className={ENV_CARD_FOOTER_CLASS}>{footer}</div> : null}
        </Card>
    )
}
