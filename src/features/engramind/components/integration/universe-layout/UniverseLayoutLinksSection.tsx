"use client"

import { AnimatePresence, motion } from "framer-motion"
import type { UniverseLayoutConfig } from "@engramind/client"
import type { Control, FieldErrors } from "react-hook-form"
import { FORM_GRID } from "@/components/ui/form-grid"
import type { OptionTabsOption } from "@/components/ui/option-tabs"
import { Section } from "../../shared/Section"
import { ChoiceLayoutField, NumberLayoutField, SwitchLayoutField } from "./UniverseLayoutFields"

const LINKS_OPTIONS: OptionTabsOption<UniverseLayoutConfig["links"]>[] = [
    { value: "center", label: "Ao centro" },
    { value: "related", label: "Entre similares" },
]

interface LinksSectionProps {
    control: Control<UniverseLayoutConfig>
    errors: FieldErrors<UniverseLayoutConfig>
    saved: UniverseLayoutConfig
    values: UniverseLayoutConfig
    onReset: (name: keyof UniverseLayoutConfig) => void
}

/**
 * Links dos universos (OPE-164): ao centro ou entre memórias similares (com as arestas por memória) e o link do
 * agente às memórias que ele criou, independente do preset.
 */
export function UniverseLayoutLinksSection(common: LinksSectionProps) {
    return (
        <Section title="Links" info="Como as partículas se ligam: ao agente ou canal do centro, ou entre memórias similares do mesmo canal.">
            <div className={FORM_GRID}>
                <ChoiceLayoutField {...common} name="links" options={LINKS_OPTIONS} wide />
                <AnimatePresence initial={false}>
                    {common.values.links === "related" && (
                        <motion.div key="relatedMax" className="sm:col-span-2" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                            <NumberLayoutField {...common} name="relatedMax" />
                        </motion.div>
                    )}
                </AnimatePresence>
                <SwitchLayoutField {...common} name="authorLinks" wide />
            </div>
        </Section>
    )
}
