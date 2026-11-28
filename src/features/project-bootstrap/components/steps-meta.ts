import { Bot, ClipboardList, Link2, PartyPopper, Rocket } from "lucide-react"
import type { WizardStep } from "@/components/wizard/WizardStepper"
import { PROJECT_BOOTSTRAP_STEP_LABELS, PROJECT_BOOTSTRAP_STEPS, type ProjectBootstrapStep } from "../constants"

const ICONS: Record<ProjectBootstrapStep, WizardStep["icon"]> = { info: ClipboardList, provision: Bot, link: Link2, deploy: Rocket, done: PartyPopper }

/** As 5 etapas do stepper do bootstrap: Informações → Provisionamento → Amarração → Ambiente e deploy → Concluído. */
export const BOOTSTRAP_WIZARD_STEPS: readonly WizardStep[] = PROJECT_BOOTSTRAP_STEPS.map((id) => ({ id, label: PROJECT_BOOTSTRAP_STEP_LABELS[id], icon: ICONS[id] }))

export const AGENTIC_CENTRALS_HREF = "/integracoes/ia?aba=desenvolvimento-agentico&abaAgentic=centrais"
