import { createHash } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { recordAudit, AcaoAuditoria } from "@/lib/audit/record"
import { logger } from "@/lib/logger"
import { DEFAULT_ENV_FILE, ENVIRONMENT_AUDIT_ENTITY, MAX_ENV_FILE_BYTES, MAX_ENV_VARS } from "../constants"
import { applyEnvChanges, isSecretEnvKey, parseEnvFile, type EnvChange } from "../logic"
import type { HostEnvFileDto, HostEnvFileInput } from "../types"
import type { EnvironmentActor } from "./actor"
import { assertCanManage, assertCanManageSecrets, isOwner } from "./actor"
import { shellQuote } from "./runner"
import { hostFileWriteCommand } from "./host-files"
import type { EnvironmentRuntime } from "./context"

/**
 * Arquivo `.env` **real** do ambiente, no host. É a fonte efetiva das variáveis do Compose (o Opex
 * não injeta mais variáveis por override). A leitura devolve apenas nomes e valores **não
 * sensíveis**: o valor de uma chave sensível nunca sai do servidor (mesmo para o dono). A gravação
 * aplica alterações por chave, preservando comentários e valores não alterados, com checagem de
 * revisão e escrita atômica.
 */

/** Caminho relativo do `.env` dentro do diretório do repositório (nunca absoluto nem com `..`). */
export function resolveEnvFilePath(runtime: EnvironmentRuntime): string {
    const relative = (runtime.env.envFile?.trim() || DEFAULT_ENV_FILE).replace(/^\.\//, "")
    if (!relative || relative.startsWith("/") || relative.split("/").includes("..")) {
        throw new DomainError(400, "O caminho do arquivo .env precisa ser relativo ao diretório do repositório.", "ENV_FILE_PATH_INVALID")
    }
    return `${runtime.directory.replace(/\/+$/, "")}/${relative}`
}

function revisionOf(content: string): string {
    return createHash("sha256").update(content).digest("hex").slice(0, 16)
}

interface RawEnv {
    content: string
    exists: boolean
}

/** Lê o arquivo do host. O conteúdo **nunca** é registrado em log. */
async function readRawEnv(runtime: EnvironmentRuntime): Promise<RawEnv> {
    const path = resolveEnvFilePath(runtime)
    const result = await runtime.host.run(`test -f ${shellQuote(path)} && cat ${shellQuote(path)} || true`, { cwd: runtime.directory })
    if (result.exitCode !== 0) {
        throw new DomainError(502, "Não foi possível ler o arquivo .env no host do ambiente.", "ENV_FILE_READ_FAILED")
    }
    if (Buffer.byteLength(result.output) > MAX_ENV_FILE_BYTES) {
        throw new DomainError(413, "O arquivo .env é grande demais para editar por aqui.", "ENV_FILE_TOO_LARGE")
    }
    const check = await runtime.host.run(`test -f ${shellQuote(path)} && echo yes || echo no`, { cwd: runtime.directory })
    return { content: result.output, exists: check.output.trim() === "yes" }
}

/** DTO do `.env` para a tela: nomes sempre, valores só dos não sensíveis. */
export async function readHostEnvFile(runtime: EnvironmentRuntime): Promise<HostEnvFileDto> {
    const raw = await readRawEnv(runtime)
    const parsed = parseEnvFile(raw.content)
    const entries = parsed.assignments.slice(0, MAX_ENV_VARS).map((assignment) => {
        const secret = isSecretEnvKey(assignment.key)
        return { key: assignment.key, value: secret ? null : assignment.value, secret }
    })
    return {
        path: runtime.env.envFile?.trim() || DEFAULT_ENV_FILE,
        exists: raw.exists,
        entries,
        revision: revisionOf(raw.content),
        updatedAt: null,
    }
}

function assertCanChangeKeys(actor: EnvironmentActor, changes: readonly EnvChange[]): void {
    if (isOwner(actor)) return
    // Não-dono (admin do cliente) não altera nem remove chaves sensíveis.
    const touchesSecret = changes.some((change) => isSecretEnvKey(change.key))
    if (touchesSecret) {
        assertCanManageSecrets(actor)
    }
}

/**
 * Aplica alterações no `.env` real. O arquivo é relido e a revisão conferida antes de gravar (evita
 * perder uma edição externa); a escrita é atômica (`tmp` + `mv`) e restrita (`chmod 600`).
 */
export async function updateHostEnvFile(actor: EnvironmentActor, runtime: EnvironmentRuntime, input: HostEnvFileInput): Promise<HostEnvFileDto> {
    assertCanManage(actor)
    if (input.changes.length > MAX_ENV_VARS) throw new DomainError(400, "Há variáveis demais para salvar de uma vez.", "ENV_FILE_TOO_MANY")
    for (const change of input.changes) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(change.key)) throw new DomainError(400, `Nome de variável inválido: ${change.key}`, "ENV_KEY_INVALID")
        if (change.value !== null && change.value.length > 8_000) throw new DomainError(400, `O valor de ${change.key} é longo demais.`, "ENV_VALUE_TOO_LONG")
    }
    assertCanChangeKeys(actor, input.changes)

    const path = resolveEnvFilePath(runtime)
    const raw = await readRawEnv(runtime)
    if (input.revision && input.revision !== revisionOf(raw.content)) {
        throw new DomainError(409, "O arquivo .env mudou no host desde que você abriu. Recarregue e tente de novo.", "ENV_FILE_STALE")
    }
    const parsed = parseEnvFile(raw.content)
    const next = applyEnvChanges(parsed, input.changes)
    if (Buffer.byteLength(next) > MAX_ENV_FILE_BYTES) {
        throw new DomainError(413, "O arquivo .env ficaria grande demais.", "ENV_FILE_TOO_LARGE")
    }
    const tmp = `${path}.opex-tmp`
    const write = await runtime.host.run(`${hostFileWriteCommand(tmp, next)} && chmod 600 ${shellQuote(tmp)} && mv ${shellQuote(tmp)} ${shellQuote(path)}`, { cwd: runtime.directory })
    if (write.exitCode !== 0) {
        logger.warn({ exitCode: write.exitCode }, "[environments] Falha ao gravar o .env no host")
        throw new DomainError(502, "Não foi possível gravar o arquivo .env no host.", "ENV_FILE_WRITE_FAILED")
    }

    await recordAudit({
        userId: actor.userId,
        entidade: ENVIRONMENT_AUDIT_ENTITY,
        entidadeId: String(runtime.env._id),
        acao: AcaoAuditoria.ATUALIZAR,
        depois: { envFile: runtime.env.envFile, variaveis: input.changes.map((change) => ({ key: change.key, acao: change.value === null ? "remover" : "definir" })) },
    })
    return readHostEnvFile(runtime)
}
