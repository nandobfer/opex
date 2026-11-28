"use client"

import { OVERRIDE_YAML_MAX_BYTES, overrideYamlProblem } from "../../override-yaml"
import { ComposeEditorField } from "../ComposeEditorField"

const PLACEHOLDER = `app:
  stop_grace_period: 30s
  extra_hosts:
    - "host.docker.internal:host-gateway"
  ulimits: !override
    nofile: 65536`

/**
 * YAML avançado dos serviços (OPE-211): o conteúdo do bloco `services:` do override, para as chaves que o
 * bloco guiado não cobre. O mesmo editor do compose gerenciado, com a validação em tempo real.
 */
export function ComposeOverridesYamlField({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string | null }) {
    const problem = overrideYamlProblem(value)
    return (
        <ComposeEditorField
            id="environment-overrides-yaml"
            label="YAML avançado (bloco services: do override)"
            value={value}
            onChange={onChange}
            error={problem?.message ?? error ?? null}
            maxBytes={OVERRIDE_YAML_MAX_BYTES}
            placeholder={PLACEHOLDER}
            hint="Serviço: chaves, por cima do compose (aceita !reset e !override). Fica de fora o que o Opex controla: env_file, build, deploy, mem_limit, memswap_limit e cpus. Vale no próximo deploy."
        />
    )
}
