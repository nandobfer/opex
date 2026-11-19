import type { PluginSourceFile } from "../../manifest"

/**
 * Sistema de arquivos virtual das fontes de uma versão (OPE-172): o Rolldown lê do mapa em memória,
 * sem disco. Resolve imports relativos com as extensões usuais de TS/TSX.
 */

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", "/index.ts", "/index.tsx", "/index.js"]

export function createVirtualFs(files: PluginSourceFile[]) {
    const map = new Map(files.map((file) => [file.path, file.content]))

    function join(fromFile: string, relative: string): string {
        const parts = fromFile.split("/").slice(0, -1)
        for (const segment of relative.split("/")) {
            if (segment === "..") parts.pop()
            else if (segment !== "." && segment !== "") parts.push(segment)
        }
        return parts.join("/")
    }

    /** Caminho do arquivo para um import relativo, ou `null`. */
    function resolve(specifier: string, importer: string | undefined): string | null {
        const base = importer ? join(importer, specifier) : specifier.replace(/^\.\//, "")
        for (const extension of EXTENSIONS) {
            const candidate = `${base}${extension}`
            if (map.has(candidate)) return candidate
        }
        return null
    }

    return {
        has: (path: string) => map.has(path),
        read: (path: string) => map.get(path) ?? null,
        resolve,
        isRelative: (specifier: string) => specifier.startsWith("./") || specifier.startsWith("../"),
    }
}

export type VirtualFs = ReturnType<typeof createVirtualFs>
