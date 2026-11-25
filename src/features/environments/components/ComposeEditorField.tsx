"use client"

import { Textarea } from "@/components/ui/textarea"
import { MANAGED_COMPOSE_MAX_BYTES } from "../constants"
import { composeBytes, formatComposeSize } from "../managed-compose"

interface Props {
    id: string
    label: string
    value: string
    onChange?: (value: string) => void
    readOnly?: boolean
    /** Erro do YAML (com a linha), do formulário ou do servidor. */
    error?: string | null
}

const PLACEHOLDER = `services:
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
    environment:
      MINIO_ROOT_USER: \${MINIO_ROOT_USER}
    volumes:
      - data:/data
volumes:
  data:`

/**
 * Editor do compose gerenciado (OPE-191): campo grande e monoespaçado. É o mesmo na criação do ambiente
 * e no diálogo Compose (inclusive para ver uma revisão antiga, só leitura).
 */
export function ComposeEditorField({ id, label, value, onChange, readOnly, error }: Props) {
    const bytes = composeBytes(value)
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <label htmlFor={id} className="text-xs font-semibold">
                    {label}
                </label>
                <span className={bytes > MANAGED_COMPOSE_MAX_BYTES ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {formatComposeSize(bytes)} de {formatComposeSize(MANAGED_COMPOSE_MAX_BYTES)}
                </span>
            </div>
            <Textarea
                id={id}
                value={value}
                readOnly={readOnly}
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                onChange={(event) => onChange?.(event.target.value)}
                placeholder={readOnly ? undefined : PLACEHOLDER}
                className="min-h-80 w-full resize-y whitespace-pre font-mono text-xs"
            />
            {error ? (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            ) : (
                !readOnly && <p className="text-xs text-muted-foreground">Use `image:` nos serviços (sem `build`). A revisão vale a partir do próximo deploy; as Variáveis extras entram pelo `.env.opex`.</p>
            )}
        </div>
    )
}
