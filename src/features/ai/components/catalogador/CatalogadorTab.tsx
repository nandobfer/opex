"use client"

import { TaskSummarySection } from "../task-summary/TaskSummarySection"
import { TaskTagsSection } from "../task-tags/TaskTagsSection"
import { MergedFeaturesTab, type MergedFeatureSection } from "../shared/MergedFeaturesTab"

const SECTIONS: readonly MergedFeatureSection[] = [
    { id: "task-summary", title: "Resumos de tarefas", render: (props) => <TaskSummarySection {...props} /> },
    { id: "task-tags", title: "Tags de tarefas", render: (props) => <TaskTagsSection {...props} /> },
]

/** Aba "Catalogador": as features Resumos de tarefas e Tags de tarefas, uma seção cada. */
export function CatalogadorTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    return <MergedFeaturesTab sections={SECTIONS} onDirtyChange={onDirtyChange} />
}
