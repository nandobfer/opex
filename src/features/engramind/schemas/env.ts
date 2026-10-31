import { z, type ZodType } from "zod"
import { ENV_EDITABLE_KEYS, type EnvEditableKey } from "../constants"

/** Validação por tipo de cada variável editável do `.env` do Engramind (regras de `src/config.rs`). */
const port = z.string().trim().regex(/^\d+$/, "Use um número").refine((value) => Number(value) >= 1 && Number(value) <= 65535, "Porta de 1 a 65535")
const positive = (max: number) => z.string().trim().regex(/^\d+$/, "Use um número inteiro").refine((value) => Number(value) >= 1 && Number(value) <= max, `De 1 a ${max}`)
const bool = z.enum(["true", "false"], { error: "Use true ou false" })
const name = z.string().trim().min(1, "Obrigatório").max(120).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "Letras, números, ., _ ou -")
const optionalText = z.string().trim().max(500)
const path = z.string().trim().max(500).regex(/^(\/[^\s]*)?$/, "Caminho absoluto (ou vazio)")
const url = z.string().trim().max(500).regex(/^(https?:\/\/[^\s]+)?$/, "Use http:// ou https:// (ou vazio)")

export const ENV_VALUE_SCHEMAS: Record<EnvEditableKey, ZodType<string>> = {
    APP_ENV: z.enum(["development", "test", "staging", "production"], { error: "Use development, test, staging ou production" }),
    APP_HOST: z.string().trim().min(1, "Obrigatório").max(255).regex(/^[A-Za-z0-9.:[\]-]+$/, "Host ou IP"),
    APP_PORT: port,
    CONTAINER_NAME: name,
    DATABASE_PATH: path.refine((value) => value !== "", "Obrigatório"),
    MODELS_PATH: path,
    ORT_DYLIB_PATH: path,
    READ_POOL_SIZE: positive(64),
    REQUEST_TIMEOUT_SECS: positive(3600),
    MAX_BODY_BYTES: positive(1_073_741_824),
    MCP_ALLOWED_HOSTS: z.string().trim().min(1, "Obrigatório").max(1000).regex(/^[A-Za-z0-9.:,\s[\]_-]+$/, "Hosts separados por vírgula"),
    ENGRAMIND_NETWORK: name,
    S3_NETWORK: name,
    LITESTREAM_ENABLED: bool,
    ENGRAMIND_S3_BUCKET: optionalText,
    ENGRAMIND_S3_PATH: optionalText,
    ENGRAMIND_S3_ENDPOINT: url,
    LITESTREAM_ACCESS_KEY_ID: optionalText,
    RUST_LOG: z.string().trim().max(500).regex(/^[A-Za-z0-9_:=,.\-/]*$/, "Diretivas como engramind=info,tower_http=warn"),
    LOG_FORMAT: z.enum(["compact", "json"], { error: "Use compact ou json" }),
    LOG_ANSI: bool,
    TZ: z.string().trim().max(80).regex(/^([A-Za-z_]+(\/[A-Za-z0-9_+-]+)*|UTC)?$/, "Fuso IANA (ex.: America/Sao_Paulo)"),
}

const editableKey = z.enum(ENV_EDITABLE_KEYS)

/** Corpo de `PUT /api/engramind/env`: só as chaves alteradas. Senha do Litestream vazia mantém a atual. */
export const envUpdateSchema = z
    .object({
        hash: z.string().regex(/^[0-9a-f]{64}$/, "Releia o arquivo"),
        changes: z.partialRecord(editableKey, z.string()).default({}),
        litestreamSecret: z.string().max(500).optional(),
    })
    .superRefine((value, ctx) => {
        for (const [key, raw] of Object.entries(value.changes)) {
            const parsed = ENV_VALUE_SCHEMAS[key as EnvEditableKey].safeParse(raw)
            if (!parsed.success) ctx.addIssue({ code: "custom", path: ["changes", key], message: `${key}: ${parsed.error.issues[0]?.message ?? "valor inválido"}` })
        }
        if (Object.keys(value.changes).length === 0 && !value.litestreamSecret) ctx.addIssue({ code: "custom", path: ["changes"], message: "Nenhuma alteração para salvar" })
    })
    .meta({ examples: [{ hash: "0".repeat(64), changes: { RUST_LOG: "engramind=debug,tower_http=warn" } }] })
export type EnvUpdateInput = z.infer<typeof envUpdateSchema>

export const envApplySchema = z.object({ confirm: z.literal(true, { error: "Confirme a reinicialização" }) })
