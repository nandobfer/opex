import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import type { PluginSourceFile } from "../../manifest"

/**
 * CSS dos plugins (OPE-172). O Tailwind 4 do app gera as classes no build: uma classe que só existe
 * no plugin ficaria sem estilo. Aqui o compilador do próprio Tailwind gera, no servidor e uma vez
 * por versão, só as utilidades usadas nas fontes do plugin, com o tema do app (`plugin-sdk/theme.css`,
 * o mesmo importado pelo `globals.css`). Sem preflight: o app já tem.
 */

const THEME_FILE = "plugin-sdk/theme.css"
const SOURCE_EXTENSIONS = /\.(tsx|ts|jsx|js)$/

type Compiler = { build(candidates: string[]): string }
let compilerPromise: Promise<Compiler> | null = null

async function themeCss(): Promise<string> {
    return readFile(path.join(process.cwd(), THEME_FILE), "utf8")
}

async function getCompiler(): Promise<Compiler> {
    compilerPromise ??= (async () => {
        const { compile } = await import("tailwindcss")
        const require = createRequire(path.join(process.cwd(), "package.json"))
        const css = `@import "tailwindcss/theme.css" theme(reference);\n${await themeCss()}\n@import "tailwindcss/utilities.css" layer(utilities);`
        return compile(css, {
            base: process.cwd(),
            loadStylesheet: async (id: string, base: string) => {
                const file = require.resolve(id, { paths: [base] })
                return { path: file, base: path.dirname(file), content: await readFile(file, "utf8") }
            },
        })
    })().catch((error: unknown) => {
        compilerPromise = null
        throw error
    })
    return compilerPromise
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
    const compiler = await getCompiler()
    const css = compiler.build(candidates)
    return /\{/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) ? css : null
}
