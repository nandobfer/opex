import { DomainError } from "@/lib/api/route"
import { getOpencodeClient, runOpencodeShell } from "@/lib/ai/opencode-client"
import { DOCKER_BUILDERS_COMMAND, parseBuildxLs, type DockerBuildersDto } from "../docker-builders"
import { loadCentral } from "./centrals"

/** Builders do Docker disponíveis na máquina do OpenCode (onde o agente constrói a prévia da central). */
export async function listDockerBuilders(centralId: string): Promise<DockerBuildersDto> {
    const { config } = await loadCentral(centralId)
    const client = await getOpencodeClient()
    const result = await runOpencodeShell(client, config.sessionDirectory, DOCKER_BUILDERS_COMMAND, { timeoutMs: 15_000 })
    if (result.exitCode !== 0) {
        const detail = result.output.split("\n").find((line) => line.trim())?.trim()
        throw new DomainError(502, `Não foi possível listar os builders do Docker na máquina do OpenCode${detail ? `: ${detail}` : ""}. Confira se o docker buildx está instalado.`, "DOCKER_BUILDERS_UNAVAILABLE")
    }
    return parseBuildxLs(result.output)
}
