"use client"

import { Section } from "../shared/Section"
import { AboutContent } from "../shared/AboutContent"

/** Aba "Sobre": o que é o Engramind e como o Opex o administra. */
export function AboutTab() {
    return (
        <Section title="Sobre o Engramind" description="Serviço separado do Opex, em Rust. Abra cada tópico para os detalhes.">
            <AboutContent />
        </Section>
    )
}
