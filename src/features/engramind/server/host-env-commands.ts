import { quote } from "@/features/local-docker/commands"
import { ENGRAMIND_COMPOSE_SERVICE, ENV_MASK_EMPTY, ENV_MASK_SET, ENV_SENSITIVE_KEYS } from "../constants"

/**
 * Comandos (puros) do `.env` do Engramind, executados NO HOST pelo OpenCode. Os valores sensíveis
 * (`TOKEN_PEPPER`, `SECRETS_KEY`, `BOOTSTRAP_ADMIN_TOKEN`, `LITESTREAM_SECRET_ACCESS_KEY`) são trocados
 * por marcadores lá mesmo na leitura e repostos lá mesmo na gravação: nunca saem do host.
 */

/** Saída da gravação quando o arquivo mudou entre a leitura e a gravação. */
export const ENV_CHANGED_EXIT = 42
export const ENV_MISSING_MARK = "__OPEX_NO_ENV__"
const SENSITIVE = ENV_SENSITIVE_KEYS.join(",")

/** Funções do awk: chave e valor (sem aspas) de uma linha `KEY=valor`. */
const AWK_LIB = [
    'function keyof(line,  k) { if (line !~ /^[ \\t]*(export[ \\t]+)?[A-Za-z_][A-Za-z0-9_]*[ \\t]*=/) return ""; k = line; sub(/^[ \\t]*(export[ \\t]+)?/, "", k); sub(/[ \\t]*=.*$/, "", k); return k }',
    'function valof(line,  v) { v = line; sub(/^[^=]*=/, "", v); gsub(/^[ \\t"]+|[ \\t"]+$/, "", v); gsub(q, "", v); return v }',
    'BEGIN { n = split(keys, list, ","); for (i = 1; i <= n; i++) secret[list[i]] = 1 }',
].join("\n")

const AWK_MASK = `${AWK_LIB}
{ k = keyof($0); if (k != "" && (k in secret)) { print k "=" (valof($0) == "" ? empty : set); next } print }`

/** Primeiro arquivo: o original (guarda as linhas sensíveis); segundo (stdin): o novo com marcadores. */
const AWK_RESTORE = `${AWK_LIB}
NR == FNR { k = keyof($0); if (k != "" && (k in secret)) orig[k] = $0; next }
{ k = keyof($0); if (k != "" && (k in secret)) { v = valof($0); if (v == set || v == empty) { if (k in orig) print orig[k]; else print k "="; next } } print }`

const awkVars = `-v keys=${quote(SENSITIVE)} -v set=${quote(ENV_MASK_SET)} -v empty=${quote(ENV_MASK_EMPTY)} -v q="'"`

/** `HASH:<sha256 do arquivo real>` e o conteúdo MASCARADO em base64. */
export function readEnvCommand(dir: string): string {
    return [
        `cd ${dir} || exit 3`,
        `[ -f .env ] || { echo ${ENV_MISSING_MARK}; exit 3; }`,
        `echo "HASH:$(sha256sum .env | cut -c1-64)"`,
        `awk ${awkVars} ${quote(AWK_MASK)} .env | base64 -w0`,
    ].join("; ")
}

export function parseReadOutput(output: string): { hash: string; content: string } | "missing" | null {
    if (output.includes(ENV_MISSING_MARK)) return "missing"
    const lines = output.trim().split("\n").map((line) => line.trim()).filter(Boolean)
    const hashLine = lines.find((line) => line.startsWith("HASH:"))
    const hash = hashLine?.slice(5).trim() ?? ""
    if (!/^[0-9a-f]{64}$/.test(hash)) return null
    const encoded = lines.filter((line) => line !== hashLine).join("")
    return { hash, content: Buffer.from(encoded, "base64").toString("utf8") }
}

/** Grava o arquivo novo (com marcadores) só se o hash ainda for o lido, repondo as sensíveis no host. */
export function writeEnvCommand(dir: string, expectedHash: string, maskedContent: string): string {
    const encoded = Buffer.from(maskedContent, "utf8").toString("base64")
    return [
        `cd ${dir} || exit 3`,
        `[ -f .env ] || { echo ${ENV_MISSING_MARK}; exit 3; }`,
        `[ "$(sha256sum .env | cut -c1-64)" = ${quote(expectedHash)} ] || { echo __OPEX_ENV_CHANGED__; exit ${ENV_CHANGED_EXIT}; }`,
        "umask 077",
        "tmp=$(mktemp .env.opex-XXXXXX) || exit 4",
        `printf %s ${quote(encoded)} | base64 -d | awk ${awkVars} ${quote(AWK_RESTORE)} .env - > "$tmp" || { rm -f "$tmp"; exit 5; }`,
        `chmod --reference=.env "$tmp" 2>/dev/null; mv "$tmp" .env`,
        `echo "HASH:$(sha256sum .env | cut -c1-64)"`,
    ].join("; ")
}

export interface ApplyPlan {
    dir: string
    composeFiles: string[]
    /** Projeto atual do compose (para derrubar quando a porta ou o nome do container mudaram). */
    previousProject: string | null
    /** Container atual (de onde sai a imagem em execução). */
    currentContainer: string
}

/**
 * Recria o serviço com a imagem que está rodando (a instalação não tem código-fonte: sem build nem
 * pull no servidor), como o deploy do próprio Engramind: `API_IMAGE=<atual> docker compose … up -d
 * --no-build --pull never api`. Com `previousProject`, derruba antes o projeto antigo.
 */
export function applyCommand(plan: ApplyPlan): string {
    const files = plan.composeFiles.map((file) => `-f ${quote(file)}`).join(" ")
    const compose = `docker compose --env-file .env ${files}`
    const service = quote(ENGRAMIND_COMPOSE_SERVICE)
    return [
        `cd ${plan.dir} || exit 3`,
        `IMG=$(docker inspect -f '{{.Config.Image}}' ${quote(plan.currentContainer)} 2>/dev/null)`,
        `[ -n "$IMG" ] || IMG=$(grep -E '^API_IMAGE=' .env | tail -n 1 | cut -d= -f2-)`,
        `[ -n "$IMG" ] || { echo "Imagem do Engramind em execução não encontrada (container ${plan.currentContainer.replace(/[^A-Za-z0-9_.-]/g, "")})"; exit 6; }`,
        `echo "Imagem: $IMG"`,
        ...(plan.previousProject ? [`echo "Derrubando o projeto anterior ${plan.previousProject.replace(/[^A-Za-z0-9_.-]/g, "")}"`, `API_IMAGE="$IMG" ${compose} -p ${quote(plan.previousProject)} down --remove-orphans || exit 7`] : []),
        `API_IMAGE="$IMG" ${compose} up -d --no-build --pull never ${service}`,
    ].join("; ")
}
