"use client"

import { useUpdateTask } from "@/features/tasks/hooks/useTasks"
import { planAfterRefinementLabel, TASK_AGENTIC_FLOW_LABELS, type TaskAgenticFlow } from "@/features/tasks/constants"
import type { TaskDetailDto } from "@/features/tasks/types"
import { resolvePlanAfterRefinement } from "../../logic"
import type { CentralDto } from "../../types"
import { InheritedToggleCard } from "./InheritedToggleCard"

/**
 * Chaves da tela inicial da mesa, com o mesmo padrão de herança da central (escolha da tarefa vence; "Usar
 * padrão da central" volta a herdar): **Gerar prévia** (OPE-79) e **Gerar plano após refinar** (OPE-137).
 * Cada troca é salva na tarefa na hora (otimista), e a mesa nova nasce com ela.
 */
export function StartWorkbenchSwitches({ central, task }: { central: CentralDto; task: TaskDetailDto }) {
    const update = useUpdateTask()
    const ref = { id: task.id, code: task.code }
    const taskFlow = task.agenticFlow ?? null
    const centralFlow: TaskAgenticFlow = central.config.environment.publishPreview ? "preview" : "auto_pr"
    const flow: TaskAgenticFlow = taskFlow ?? centralFlow
    const taskPlan = typeof task.planAfterRefinement === "boolean" ? task.planAfterRefinement : null
    const centralPlan = central.config.environment.planAfterRefinement === true
    const plan = resolvePlanAfterRefinement(centralPlan, taskPlan)

    const setFlow = (agenticFlow: TaskAgenticFlow | null) => update.mutate({ task: ref, body: { agenticFlow }, patch: { agenticFlow } })
    const setPlan = (planAfterRefinement: boolean | null) => update.mutate({ task: ref, body: { planAfterRefinement }, patch: { planAfterRefinement } })

    return (
        <div className="space-y-3">
            <InheritedToggleCard
                id="workbench-flow"
                label="Gerar prévia"
                description={flow === "auto_pr" ? "O agente pula a prévia e abre o Pull Request assim que a implementação terminar. A revisão do plano continua obrigatória." : "O agente sobe a prévia depois da implementação e espera a sua aprovação antes de abrir o Pull Request."}
                checked={flow !== "auto_pr"}
                inherited={taskFlow === null}
                centralLabel={TASK_AGENTIC_FLOW_LABELS[centralFlow]}
                disabled={update.isPending}
                onCheckedChange={(enabled) => setFlow(enabled ? "preview" : "auto_pr")}
                onInherit={() => setFlow(null)}
                onLabel="Ligada"
                offLabel="Desligada"
            />
            <InheritedToggleCard
                id="workbench-plan-after-refinement"
                label="Gerar plano após refinar"
                description={plan ? "Com a especificação pronta, a mesa segue sozinha para o planejamento." : "Com a especificação pronta, a mesa para em Especificação pronta e espera você gerar o plano."}
                checked={plan}
                inherited={taskPlan === null}
                centralLabel={planAfterRefinementLabel(centralPlan)}
                disabled={update.isPending}
                onCheckedChange={(enabled) => setPlan(enabled)}
                onInherit={() => setPlan(null)}
            />
        </div>
    )
}
