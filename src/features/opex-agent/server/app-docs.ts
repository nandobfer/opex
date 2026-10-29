import { promises as fs } from "node:fs"
import path from "node:path"
import { APP_DOCS_DIR, normalizeDocPath, type AppDocFile } from "../app-docs"
import { OpexToolError } from "./tools/define"

/**
 * Leitura da documentação do app (`aicontext/**.md`) para o Agente Opex. Só arquivos `.md` dentro
 * da pasta (o caminho real é conferido: symlink para fora é recusado). Na imagem Docker a pasta é
 * copiada para `/app/aicontext` (Dockerfile, estágio runner).
 */

export function appDocsRoot(): string {
    return path.join(process.cwd(), APP_DOCS_DIR)
}

const UNAVAILABLE = "Documentação do app indisponível nesta instalação (pasta aicontext/ ausente)."

async function realRoot(): Promise<string> {
    try {
        return await fs.realpath(appDocsRoot())
    } catch {
        throw new OpexToolError(UNAVAILABLE)
    }
}

function inside(root: string, target: string): boolean {
    const relative = path.relative(root, target)
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

/** Caminhos relativos (POSIX) de todos os `.md` da documentação: os guias da raiz primeiro, depois por pasta. */
export async function listAppDocPaths(): Promise<string[]> {
    const root = await realRoot()
    const found: string[] = []
    async function walk(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) await walk(full)
            else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) found.push(path.relative(root, full).split(path.sep).join("/"))
        }
    }
    await walk(root)
    return found.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
}

/** Conteúdo de um documento (caminho relativo a `aicontext/`). */
export async function readAppDoc(input: string): Promise<AppDocFile> {
    const relative = normalizeDocPath(input)
    if (!relative) throw new OpexToolError(`Caminho inválido: "${input}". Use um .md relativo a aicontext/ (ex.: modules/tasks.md); veja list_app_docs.`)
    const root = await realRoot()
    let real: string
    try {
        real = await fs.realpath(path.join(root, relative))
    } catch {
        throw new OpexToolError(`Documento não encontrado: ${relative}. Veja os disponíveis com list_app_docs.`)
    }
    if (!inside(root, real)) throw new OpexToolError(`Caminho fora da documentação do app: ${relative}`)
    return { path: relative, content: await fs.readFile(real, "utf8") }
}

/** Todos os documentos (para busca). */
export async function readAllAppDocs(): Promise<AppDocFile[]> {
    const paths = await listAppDocPaths()
    const files = await Promise.all(paths.map((item) => readAppDoc(item).catch(() => null)))
    return files.filter((file): file is AppDocFile => file !== null)
}
