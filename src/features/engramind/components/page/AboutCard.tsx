"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { BookOpen, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OptionTabs } from "@/components/ui/option-tabs"
import { ENGRAMIND_SUMMARY } from "../../help/about"
import { OVERVIEW_LAYOUT_LABEL, OVERVIEW_LAYOUT_MODES, type OverviewLayoutMode } from "@engramind/client/react"
import { AboutContent } from "../shared/AboutContent"
import { Section } from "../shared/Section"

const LAYOUT_OPTIONS = OVERVIEW_LAYOUT_MODES.map((mode) => ({ value: mode, label: OVERVIEW_LAYOUT_LABEL[mode] }))

/**
 * Resumo do Engramind no fim de /engramind (OPE-113), com a distribuição da visão inicial (Órbita ou
 * Radial; só na visão inicial, `layout` ausente nos universos), **Configurar** (a integração) e
 * "Saiba mais" (o mesmo conteúdo da aba Sobre).
 */
export function AboutCard({ onConfigure, layout }: { onConfigure: () => void; layout?: { value: OverviewLayoutMode; onChange: (value: OverviewLayoutMode) => void } }) {
    const [open, setOpen] = useState(false)
    return (
        <Section
            title="O que é o Engramind"
            className="mt-3"
            actions={
                <div data-testid="about-actions" className="flex flex-wrap items-center gap-2">
                    <AnimatePresence initial={false}>
                        {layout && (
                            <motion.div key="layout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                <OptionTabs aria-label="Distribuição da rede" size="sm" options={LAYOUT_OPTIONS} value={layout.value} onChange={layout.onChange} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <Button type="button" size="sm" variant="outline" onClick={onConfigure}>
                        <Settings className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Configurar
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
                        <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Saiba mais
                    </Button>
                </div>
            }
        >
            <p className="text-sm text-muted-foreground">{ENGRAMIND_SUMMARY}</p>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Sobre o Engramind</DialogTitle>
                    </DialogHeader>
                    <AboutContent compact />
                </DialogContent>
            </Dialog>
        </Section>
    )
}
