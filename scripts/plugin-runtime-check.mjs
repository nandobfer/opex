#!/usr/bin/env node
/**
 * Verificação do compilador de plugins numa árvore de instalação (OPE-172, OPE-173).
 *
 * Uso: `node scripts/plugin-runtime-check.mjs <raiz>` — a raiz é a pasta do app como ele roda
 * (no Dockerfile, `.next/standalone`; localmente, a raiz do repositório). Confere, pela MESMA
 * resolução usada no servidor, que:
 *  - o Rolldown da árvore carrega com o binário nativo e compila um JSX mínimo;
 *  - o Tailwind da árvore resolve `tailwindcss/theme.css` e `utilities.css` a partir da raiz e gera
 *    a classe `bg-primary` com o tema do app (`plugin-sdk/theme.css`, lido da pasta atual).
 * Sai com código 1 e mensagem em pt-BR quando algo falta: o build da imagem para aqui, e não na mesa.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"

const root = path.resolve(process.argv[2] ?? ".")

function fail(message) {
    process.stderr.write(`Compilador de plugins indisponível na imagem: ${message}\n`)
    process.exit(1)
}

/** Pasta do pacote: `node_modules/<nome>` ou, só no layout do pnpm, `node_modules/.pnpm/<nome>@*\/node_modules/<nome>`. */
function packageDir(name) {
    const direct = path.join(root, "node_modules", name)
    if (existsSync(path.join(direct, "package.json"))) return direct
    const store = path.join(root, "node_modules", ".pnpm")
    const entry = existsSync(store) ? readdirSync(store).find((dir) => dir.startsWith(`${name}@`)) : undefined
    const nested = entry ? path.join(store, entry, "node_modules", name) : null
    if (nested && existsSync(path.join(nested, "package.json"))) return nested
    return fail(`o pacote "${name}" não está em ${path.join(root, "node_modules")}`)
}

async function checkRolldown() {
    const dir = packageDir("rolldown")
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"))
    const entry = typeof pkg.exports?.["."] === "string" ? pkg.exports["."] : pkg.exports?.["."]?.import ?? pkg.module ?? pkg.main
    let rolldown
    try {
        ;({ rolldown } = await import(pathToFileURL(path.join(dir, entry)).href))
    } catch (error) {
        return fail(`o Rolldown não carregou (${error instanceof Error ? error.message : String(error)}). Falta o binário nativo @rolldown/binding-* ao lado do pacote.`)
    }
    const source = 'export function Widget() { return <div className="bg-primary">ok</div> }\n'
    const build = await rolldown({
        input: "entry.tsx",
        logLevel: "silent",
        transform: { jsx: { runtime: "automatic" } },
        plugins: [
            {
                name: "check-vfs",
                resolveId: (id) => (id === "entry.tsx" ? id : { id, external: true }),
                load: (id) => (id === "entry.tsx" ? source : null),
            },
        ],
    })
    const { output } = await build.generate({ format: "esm" })
    await build.close()
    if (!output[0] || output[0].type !== "chunk" || !output[0].code.includes("react/jsx-runtime")) fail("o Rolldown carregou, mas não compilou o JSX de verificação")
    return `Rolldown ${pkg.version}`
}

async function checkTailwind() {
    const require = createRequire(path.join(root, "package.json"))
    let compile
    try {
        ;({ compile } = require(require.resolve("tailwindcss", { paths: [root] })))
    } catch (error) {
        return fail(`o Tailwind não carregou a partir de ${root} (${error instanceof Error ? error.message : String(error)})`)
    }
    const theme = existsSync("plugin-sdk/theme.css") ? await readFile("plugin-sdk/theme.css", "utf8") : ""
    const css = `@import "tailwindcss/theme.css" theme(reference);\n${theme}\n@import "tailwindcss/utilities.css" layer(utilities);`
    let compiler
    try {
        compiler = await compile(css, {
            base: root,
            loadStylesheet: async (id, base) => {
                const file = require.resolve(id, { paths: [base] })
                return { path: file, base: path.dirname(file), content: await readFile(file, "utf8") }
            },
        })
    } catch (error) {
        return fail(`as folhas de estilo do Tailwind não foram encontradas a partir de ${root} (${error instanceof Error ? error.message : String(error)})`)
    }
    if (!compiler.build(["bg-primary"]).includes(".bg-primary")) fail("o Tailwind carregou, mas não gerou a classe de verificação")
    return "Tailwind"
}

const checked = [await checkRolldown(), await checkTailwind()]
process.stdout.write(`Compilador de plugins OK (${checked.join(", ")}) em ${root}\n`)
