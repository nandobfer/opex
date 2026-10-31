"use client"

import { useState } from "react"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ENGRAMIND_SUMMARY } from "../../help/about"
import { AboutContent } from "../shared/AboutContent"
import { Section } from "../shared/Section"

/** Resumo do Engramind no topo de /engramind, com "Saiba mais" (o mesmo conteúdo da aba Sobre). */
export function AboutCard() {
    const [open, setOpen] = useState(false)
    return (
        <Section
            title="O que é o Engramind"
            actions={
                <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
                    <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Saiba mais
                </Button>
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
