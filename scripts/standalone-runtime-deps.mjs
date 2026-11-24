#!/usr/bin/env node
/**
 * Dependências de execução carregadas por `require` dinâmico que o rastreamento do Next não leva ao
 * standalone (OPE-176).
 *
 * Uso: `node scripts/standalone-runtime-deps.mjs <standalone> [<raiz do repositório>]`.
 *
 * O `@ai-sdk/provider-utils` monta no Node um fetch protegido (DNS validado contra SSRF) para as
 * chamadas de OAuth da `@ai-sdk/mcp` (descoberta, registro, troca do código e renovação do token) com
 * `createRequire(<módulo>)("undici")`. O rastreamento não enxerga esse `require`, e sem o `undici` no
 * standalone o "Autorizar" dos MCPs do Agente Opex falha com "Cannot find module 'undici'".
 *
 * O script copia o MESMO `undici` que o `provider-utils` resolve no repositório para
 * `<standalone>/node_modules/undici` e confere, pela mesma resolução do servidor (a partir de um chunk
 * em `.next/server/chunks/`), que ele carrega. Sai com código 1 e mensagem em pt-BR quando algo falta:
 * o build da imagem para aqui, e não no clique do dono.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const standalone = path.resolve(process.argv[2] ?? ".next/standalone")
const repo = path.resolve(process.argv[3] ?? ".")

function fail(message) {
    process.stderr.write(`Dependência de execução ausente na imagem: ${message}\n`)
    process.exit(1)
}

/** Sobe a partir de um arquivo resolvido até a pasta do pacote (`package.json` com o nome dado). */
function packageRoot(file, name) {
    let dir = path.dirname(file)
    while (dir !== path.dirname(dir)) {
        const manifest = path.join(dir, "package.json")
        if (existsSync(manifest)) {
            try {
                if (JSON.parse(readFileSync(manifest, "utf8")).name === name) return dir
            } catch {
                // package.json ilegível: continua subindo.
            }
        }
        dir = path.dirname(dir)
    }
    return null
}

/** Resolve `name` a partir de `fromDir` (seguindo os links do pnpm) e devolve a pasta real do pacote. */
function resolvePackage(name, fromDir) {
    try {
        const entry = createRequire(path.join(fromDir, "__resolve__.js")).resolve(name)
        const root = packageRoot(entry, name)
        return root ? realpathSync(root) : null
    } catch {
        return null
    }
}

/** O `undici` que a app usa: `@ai-sdk/mcp` → `@ai-sdk/provider-utils` → `undici`. */
function sourceUndici() {
    const mcp = resolvePackage("@ai-sdk/mcp", repo)
    if (!mcp) return fail(`o pacote "@ai-sdk/mcp" não foi encontrado em ${path.join(repo, "node_modules")}`)
    const utils = resolvePackage("@ai-sdk/provider-utils", mcp)
    if (!utils) return fail(`o pacote "@ai-sdk/provider-utils" (dependência da @ai-sdk/mcp) não foi encontrado`)
    const undici = resolvePackage("undici", utils)
    if (!undici) return fail(`o pacote "undici" (dependência do @ai-sdk/provider-utils) não foi encontrado`)
    return undici
}

function copyUndici(source) {
    const dest = path.join(standalone, "node_modules", "undici")
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(path.dirname(dest), { recursive: true })
    cpSync(source, dest, { recursive: true, dereference: true })
}

/** Mesma resolução do servidor: o `createRequire` parte do chunk empacotado em `.next/server/chunks/`. */
function checkUndici() {
    const chunk = path.join(standalone, ".next", "server", "chunks", "__runtime_check__.js")
    let undici
    try {
        undici = createRequire(chunk)("undici")
    } catch (error) {
        return fail(`o "undici" não carrega a partir de ${path.dirname(chunk)} (${error instanceof Error ? error.message : String(error)}). O OAuth dos MCPs do Agente Opex não funcionaria.`)
    }
    if (typeof undici?.Agent !== "function" || typeof undici?.fetch !== "function") return fail(`o "undici" copiado não expõe Agent e fetch`)
    return undici
}

if (!existsSync(standalone)) fail(`a pasta ${standalone} não existe (rode depois do next build)`)
const source = sourceUndici()
copyUndici(source)
checkUndici()
const version = JSON.parse(readFileSync(path.join(standalone, "node_modules", "undici", "package.json"), "utf8")).version
process.stdout.write(`undici ${version} disponível no standalone (OAuth dos MCPs do Agente Opex).\n`)
