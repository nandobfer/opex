import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import type { PluginSourceFile } from "../../manifest"
import { compilerUnavailable } from "./unavailable"

/**
 * CSS dos plugins (OPE-172). O Tailwind 4 do app gera as classes no build: uma classe que só existe
 * no plugin ficaria sem estilo. Aqui o compilador do próprio Tailwind gera, no servidor e uma vez
 * por versão, só as utilidades usadas nas fontes do plugin, com o tema do app (`plugin-sdk/theme.css`,
 * o mesmo importado pelo `globals.css`). Sem preflight: o app já tem.
 */

const THEME_FILE = "plugin-sdk/theme.css"
const SOURCE_EXTENSIONS = /\.(tsx|ts|jsx|js)$/

type Compiler = { build(candidates: string[]): string }
type CompileInputs = { compile: (css: string, options: { base: string; loadStylesheet: (id: string, base: string) => Promise<{ path: string; base: string; content: string }> }) => Promise<Compiler>; css: string; sheets: Map<string, Promise<{ path: string; base: string; content: string }>> }
let inputsPromise: Promise<CompileInputs> | null = null

async function themeCss(): Promise<string> {
    return readFile(path.join(process.cwd(), THEME_FILE), "utf8")
}

/** Tema e folhas do Tailwind em cache (só leitura de disco); a instância do compilador NÃO é reaproveitada. */
async function compileInputs(): Promise<CompileInputs> {
    inputsPromise ??= (async () => {
        const { compile } = await import("tailwindcss")
        const css = `@import "tailwindcss/theme.css" theme(reference);\n${await themeCss()}\n@import "tailwindcss/utilities.css" layer(utilities);`
        return { compile: compile as CompileInputs["compile"], css, sheets: new Map() }
    })().catch((error: unknown) => {
        inputsPromise = null
        throw compilerUnavailable("Tailwind", error)
    })
    return inputsPromise
}

/**
 * Um compilador NOVO por versão: o `build()` do Tailwind acumula os candidatos já vistos, então uma
 * instância compartilhada faria o CSS de um plugin levar as classes de todas as compilações anteriores
 * do processo (e o hash da mesma fonte mudaria com a ordem).
 */
async function newCompiler(): Promise<Compiler> {
    const inputs = await compileInputs()
    const require = createRequire(path.join(process.cwd(), "package.json"))
    try {
        return await inputs.compile(inputs.css, {
            base: process.cwd(),
            loadStylesheet: (id: string, base: string) => {
                const file = require.resolve(id, { paths: [base] })
                let sheet = inputs.sheets.get(file)
                if (!sheet) {
                    sheet = readFile(file, "utf8").then((content) => ({ path: file, base: path.dirname(file), content }))
                    sheet.catch(() => inputs.sheets.delete(file))
                    inputs.sheets.set(file, sheet)
                }
                return sheet
            },
        })
    } catch (error) {
        // Tailwind ou as folhas de estilo dele ausentes: falha da instalação, não das classes do plugin.
        throw compilerUnavailable("Tailwind", error)
    }
}

/** Candidatos a classe nas fontes (o Tailwind descarta o que não for utilidade). */
export function extractClassCandidates(files: PluginSourceFile[]): string[] {
    const candidates = new Set<string>()
    for (const file of files) {
        if (!SOURCE_EXTENSIONS.test(file.path) || /\.test\.(ts|tsx)$/.test(file.path)) continue
        for (const token of file.content.split(/[\s"'`{}()<>;,=]+/)) {
            if (token.length > 0 && token.length <= 120 && /^[!-~]+$/.test(token) && /[a-z]/.test(token)) candidates.add(token)
        }
    }
    return [...candidates]
}

/** CSS das classes usadas pelo plugin, ou `null` quando nenhuma utilidade foi encontrada. */
export async function compilePluginCss(files: PluginSourceFile[]): Promise<string | null> {
    const candidates = extractClassCandidates(files)
    if (!candidates.length) return null
    const compiler = await newCompiler()
    const css = compiler.build(candidates)
    return /\{/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) ? css : null
}
