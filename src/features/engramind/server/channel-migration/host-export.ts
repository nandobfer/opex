import { DomainError } from "@/lib/api/route"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import type { HostRunner } from "@/features/local-docker/server/shell"
import { DIGEST_MARKER, parseDigestOutput, type ExportDigest } from "../../channel-migration/plan"
import { ENGRAMIND_INTEGRATION_ID } from "../../constants"

/**
 * Backup e conferência da migração B (OPE-206): o script de export das memórias (`memoryExportScript`, campo público
 * da integração) roda NO HOST pelo OpenCode, como o resto do módulo Ambientes. O arquivo completo fica no host; o
 * Opex só recebe o resumo de cada memória (id, canal, status, fixação, chave e SHA-256 do texto) e os totais.
 */

const EXPORT_TIMEOUT_MS = 10 * 60_000
/** Teto da leitura do resumo (~205 caracteres por memória: cobre cerca de 300 mil memórias). */
export const EXPORT_OUTPUT_MAX = 64_000_000
export const EXPORT_ROOT = "/tmp/opex/engramind-migracao"
/** Caminho absoluto simples (sem aspas, espaços nem quebras): vai num comando de shell. */
const SAFE_PATH = /^\/[A-Za-z0-9._/-]+$/

let runnerOverride: HostRunner | null = null
/** Testes: troca o executor do host. */
export function setChannelMigrationHostRunner(runner: HostRunner | null): void {
    runnerOverride = runner
}

async function hostRunner(): Promise<HostRunner> {
    if (runnerOverride) return runnerOverride
    const { createHostRunner } = await import("@/features/local-docker/server/shell")
    return createHostRunner(integrationDebug(ENGRAMIND_INTEGRATION_ID))
}

/** Resumo do export (roda no host): lê o JSON mais novo da pasta e imprime uma linha com o marcador. */
const DIGEST_SCRIPT = [
    'const fs=require("fs"),path=require("path"),crypto=require("crypto");',
    "const dir=process.argv[1];",
    'const files=fs.readdirSync(dir).filter((f)=>f.endsWith(".json")).sort();',
    'if(!files.length){console.error("export sem arquivo JSON");process.exit(2)}',
    "const file=path.join(dir,files[files.length-1]);",
    'const data=JSON.parse(fs.readFileSync(file,"utf8"));',
    "const byStatus={},byChannel={};",
    "const memories=(data.memories||[]).map((m)=>{byStatus[m.status]=(byStatus[m.status]||0)+1;byChannel[m.channel]=(byChannel[m.channel]||0)+1;",
    'return {id:m.id,channel:m.channel,status:m.status,pinned:typeof m.pinned==="boolean"?m.pinned:null,key:m.key??null,textHash:crypto.createHash("sha256").update(m.text??"").digest("hex")}});',
    `console.log(${JSON.stringify(DIGEST_MARKER)}+JSON.stringify({file,source:data.source??null,exportedAt:data.exported_at??null,totals:{memories:memories.length,byStatus,byChannel},memories}));`,
].join("")

/** Comando do host (puro): cria a pasta, roda o script e imprime o resumo. */
export function exportCommand(scriptPath: string, dir: string): string {
    if (!SAFE_PATH.test(scriptPath)) throw new DomainError(400, "Caminho do script de export inválido: use um caminho absoluto sem espaços nem aspas.", "ENGRAMIND_EXPORT_SCRIPT_INVALID")
    if (!SAFE_PATH.test(dir)) throw new DomainError(400, "Pasta do export inválida.", "ENGRAMIND_EXPORT_DIR_INVALID")
    const digest = Buffer.from(DIGEST_SCRIPT, "utf8").toString("base64")
    return `mkdir -p '${dir}' && node '${scriptPath}' '${dir}' > /dev/null && node -e "$(printf %s '${digest}' | base64 -d)" '${dir}'`
}

/** Caminho do script gravado na integração (`null` sem configurar). */
export async function exportScriptPath(): Promise<string | null> {
    const config = (await getIntegrationConfig(ENGRAMIND_INTEGRATION_ID)) as Record<string, string | undefined>
    return config.memoryExportScript?.trim() || null
}

/**
 * Roda o export no host e devolve o resumo. Recusa quando o script falha ou a saída não traz o resumo. Que o export
 * é do mesmo Engramind da integração (o script pode usar a URL pública) é conferido pelo executor, comparando os ids
 * dos canais gerenciados com a listagem do próprio Opex.
 */
export async function runHostExport(dir: string, options: { scriptPath: string }): Promise<ExportDigest> {
    const runner = await hostRunner()
    const result = await runner(exportCommand(options.scriptPath, dir), EXPORT_TIMEOUT_MS, { redactedAs: `export das memórias do Engramind em ${dir}`, quiet: true, maxOutput: EXPORT_OUTPUT_MAX })
    if (result.exitCode !== 0) throw new DomainError(502, `O export das memórias falhou no host (código ${result.exitCode ?? "?"}): ${result.output.split("\n").filter((line) => !line.startsWith(DIGEST_MARKER)).slice(-3).join(" ").slice(0, 300)}`, "ENGRAMIND_EXPORT_FAILED")
    if (result.truncated) throw new DomainError(502, `O resumo do export passou do limite de leitura do host (${Math.round(EXPORT_OUTPUT_MAX / 1_000_000)} MB).`, "ENGRAMIND_EXPORT_TOO_LARGE")
    const digest = parseDigestOutput(result.output)
    if (!digest) throw new DomainError(502, `O export das memórias não devolveu o resumo esperado (${result.output.length} caractere(s) lidos do host).`, "ENGRAMIND_EXPORT_INVALID")
    return digest
}
