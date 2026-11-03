"use client"

import { BudgetPreviewSection } from "../budget-preview/BudgetPreviewSection"
import { EstimateHoursSection } from "../estimate-hours/EstimateHoursSection"
import { MergedFeaturesTab, type MergedFeatureSection } from "../shared/MergedFeaturesTab"

const SECTIONS: readonly MergedFeatureSection[] = [
    { id: "budget-preview", title: "Orçamentos", render: (props) => <BudgetPreviewSection {...props} /> },
    { id: "estimate-hours", title: "Estimar prazos", render: (props) => <EstimateHoursSection {...props} /> },
]

/** Aba "Orçamentista": as features Orçamentos (prévia do portal) e Estimar prazos, uma seção cada. */
export function OrcamentistaTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    return <MergedFeaturesTab sections={SECTIONS} onDirtyChange={onDirtyChange} />
}
