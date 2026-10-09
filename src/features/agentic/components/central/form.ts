import type { UseFormReturn } from "react-hook-form"
import type { CentralConfig, CentralConfigInput } from "../../schemas"

/** Formulário da central (mesmo schema da API), compartilhado pelas abas. */
export type CentralForm = UseFormReturn<CentralConfigInput, unknown, CentralConfig>
