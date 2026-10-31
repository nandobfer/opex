"use client"

import { OptionTabs } from "@/components/ui/option-tabs"
import { SCOPE_COMBINATIONS, type ScopeCombination } from "../../constants"
import { SCOPE_COMBINATION_HELP, SCOPE_HELP } from "../../help/identities"

const describe = (combination: ScopeCombination) =>
    `${SCOPE_COMBINATION_HELP[combination]} ${combination
        .split("+")
        .map((scope) => `${scope}: ${SCOPE_HELP[scope]}`)
        .join(" ")}`

/** Escopos (só as combinações aceitas pelo Engramind), cada uma com tooltip. */
export function ScopePicker({ id, value, onChange, allowed, disabled }: { id: string; value: ScopeCombination; onChange: (next: ScopeCombination) => void; allowed?: readonly ScopeCombination[]; disabled?: boolean }) {
    return (
        <OptionTabs
            id={id}
            aria-label="Escopos"
            size="sm"
            options={SCOPE_COMBINATIONS.map((combination) => ({ value: combination, label: combination, tooltip: describe(combination), disabled: allowed ? !allowed.includes(combination) : false }))}
            value={value}
            onChange={onChange}
            disabled={disabled}
        />
    )
}
