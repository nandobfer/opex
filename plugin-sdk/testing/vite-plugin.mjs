import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Plugin do Vite para os testes de um plugin do Opex (OPE-172): resolve os módulos do Opex para
 * stubs locais. Os componentes de `@opex/ui|list|metrics|feedback/*` viram elementos simples com
 * `data-opex="<Nome>"` (os testes olham comportamento, não o visual do app); `@opex/api` é um
 * axios falso configurável (`mockApi`); `@opex/plugin-sdk/*` são as versões de teste do SDK.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const exportsTable = JSON.parse(readFileSync(path.join(here, "..", "shared-exports.json"), "utf8"))
const STUB_PREFIX = "\0opex-stub:"
const FILES = {
    "@opex/plugin-sdk/server": path.join(here, "sdk-server.mjs"),
    "@opex/plugin-sdk/client": path.join(here, "sdk-client.mjs"),
    "@opex/plugin-sdk/testing": path.join(here, "index.mjs"),
    "@opex/api": path.join(here, "api.mjs"),
}

function stubSource(id) {
    const names = exportsTable[id] ?? []
    const lines = ['import { createElement } from "react"', "const stub = (name) => (props) => createElement('div', { 'data-opex': name, ...(props?.['data-testid'] ? { 'data-testid': props['data-testid'] } : {}) }, props?.children)"]
    for (const name of names) {
        if (name === "cn") lines.push("export const cn = (...values) => values.flat().filter(Boolean).join(' ')")
        else if (/^[A-Z]/.test(name)) lines.push(`export const ${name} = stub(${JSON.stringify(name)})`)
        else if (/^[A-Z0-9_]+$/.test(name)) lines.push(`export const ${name} = ""`)
        else lines.push(`export const ${name} = () => undefined`)
    }
    return lines.join("\n")
}

export function opexSharedModules() {
    return {
        name: "opex-shared-modules",
        enforce: "pre",
        resolveId(id) {
            if (FILES[id]) return FILES[id]
            if (id === "@opex/theme" || /^@opex\/(ui|list|metrics|feedback)\//.test(id)) {
                if (!(id in exportsTable)) throw new Error(`Módulo do Opex inexistente: "${id}"`)
                return STUB_PREFIX + id
            }
            return null
        },
        load(id) {
            if (id.startsWith(STUB_PREFIX)) return stubSource(id.slice(STUB_PREFIX.length))
            return null
        },
    }
}
