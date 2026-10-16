/** Builders do Docker (buildx) da máquina do OpenCode, lidos de `docker buildx ls --format '{{json .}}'`. */

export const DOCKER_BUILDERS_COMMAND = "docker buildx ls --format '{{json .}}'"

export interface DockerBuilder {
    name: string
    driver: string
    /** Status do primeiro nó (`running`, `inactive`...); vazio quando o buildx não informa. */
    status: string
    /** Builder em uso por padrão no host (`docker buildx use`). */
    current: boolean
    /** As imagens construídas vão para o Docker local (driver `docker` ou `default-load=true`); sem isso o compose não as encontra. */
    loadsImages: boolean
}

export interface DockerBuildersDto {
    builders: DockerBuilder[]
    /** Nome do builder padrão do host, ou `null` se nenhum estiver marcado. */
    current: string | null
}

interface RawNode {
    Status?: unknown
    DriverOpts?: Record<string, unknown> | null
}

interface RawBuilder {
    Name?: unknown
    Driver?: unknown
    Current?: unknown
    Nodes?: RawNode[] | null
}

function toBuilder(raw: RawBuilder): DockerBuilder | null {
    if (typeof raw.Name !== "string" || !raw.Name.trim()) return null
    const driver = typeof raw.Driver === "string" ? raw.Driver : ""
    const nodes = Array.isArray(raw.Nodes) ? raw.Nodes : []
    const status = typeof nodes[0]?.Status === "string" ? nodes[0].Status : ""
    const defaultLoad = nodes.some((node) => String(node?.DriverOpts?.["default-load"] ?? "") === "true")
    return { name: raw.Name.trim(), driver, status, current: raw.Current === true, loadsImages: driver === "docker" || defaultLoad }
}

/** Converte a saída do buildx (uma linha JSON por builder) na lista sem repetições; ignora linhas inválidas. */
export function parseBuildxLs(output: string): DockerBuildersDto {
    const byName = new Map<string, DockerBuilder>()
    for (const line of output.split("\n")) {
        const text = line.trim()
        if (!text.startsWith("{")) continue
        let builder: DockerBuilder | null = null
        try {
            builder = toBuilder(JSON.parse(text) as RawBuilder)
        } catch {
            builder = null
        }
        if (builder && !byName.has(builder.name)) byName.set(builder.name, builder)
    }
    const builders = [...byName.values()]
    return { builders, current: builders.find((builder) => builder.current)?.name ?? null }
}

/** Resumo de um builder para a lista e o teste da central (ex.: "docker-container · running · padrão"). */
export function describeBuilder(builder: DockerBuilder): string {
    return [builder.driver, builder.status, builder.current ? "padrão do host" : ""].filter(Boolean).join(" · ")
}

export interface DockerBuilderOption {
    value: string
    label: string
    description?: string
}

/**
 * Opções do campo "Builder do Docker": primeiro o padrão do host (valor vazio), depois cada builder.
 * Um builder salvo que sumiu do host continua na lista, marcado, para não ser trocado sem aviso.
 */
export function dockerBuilderOptions(data: DockerBuildersDto | undefined, selected: string): DockerBuilderOption[] {
    const options: DockerBuilderOption[] = [
        { value: "", label: "Padrão do host", description: data?.current ? `hoje: ${data.current}` : "o builder em uso no Docker da máquina do OpenCode" },
        ...(data?.builders ?? []).map((builder) => ({ value: builder.name, label: builder.name, description: describeBuilder(builder) || undefined })),
    ]
    const name = selected.trim()
    if (name && !data) options.push({ value: name, label: name })
    else if (name && data && !data.builders.some((builder) => builder.name === name)) options.push({ value: name, label: name, description: "não encontrado no host" })
    return options
}

/**
 * Passo "Builder do Docker" do teste da central: o builder configurado existe, não está com erro e
 * carrega as imagens no Docker local; vazio = padrão do host. Builders parados sobem sozinhos no build.
 */
export function checkDockerBuilder(configured: string, result: { exitCode: number | null; output: string }): { label: string; status: "ok" | "warn" | "error"; detail: string } {
    const label = "Builder do Docker"
    const name = configured.trim()
    if (result.exitCode !== 0) {
        const detail = result.output.split("\n").find((line) => line.trim())?.trim() || "sem saída"
        return { label, status: name ? "error" : "warn", detail: `docker buildx indisponível (${detail})` }
    }
    const { builders, current } = parseBuildxLs(result.output)
    if (!name) return { label, status: "ok", detail: `padrão do host${current ? ` (${current})` : ""}` }
    const builder = builders.find((item) => item.name === name)
    if (!builder) return { label, status: "error", detail: `${name} não existe no host` }
    if (builder.status === "error") return { label, status: "error", detail: `${name} está com erro` }
    if (!builder.loadsImages) return { label, status: "warn", detail: `${name} não carrega as imagens no Docker local (${describeBuilder(builder)})` }
    return { label, status: "ok", detail: `${name} (${describeBuilder(builder)})` }
}
