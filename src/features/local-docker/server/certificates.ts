import { caBundleCheckCommand, caOverrideYaml, composeInspectCommand, muxCommand, parseComposeInspect, parseIssuer, parseOverridePath, removeComposeOverrideCommand, tlsIssuerCommand, writeComposeOverrideCommand } from "../commands"
import { LOCAL_DOCKER_TLS_PROBE_HOST } from "../constants"
import type { LocalDockerSettings } from "../schemas"
import type { LocalDockerStepDto } from "../types"
import { localDockerLog } from "./settings"
import { lastLine, runOnHost, type HostRunner } from "./shell"

/**
 * Certificados do PC. Redes com inspeção TLS (ex.: FortiGate) trocam o certificado dos sites por um
 * emitido pela CA corporativa: o WSL confia nela, os containers da prévia não, e chamadas HTTPS do
 * servidor da prévia (ex.: o handshake do Clerk) falham com "unable to get local issuer certificate".
 */

export interface CertificateProbe {
    /** Emissor do certificado do host de teste visto pelo servidor (`null` = não verificado). */
    serverIssuer: string | null
    /** O mesmo, visto pelo PC. */
    pcIssuer: string | null
    bundleOk: boolean
}

export const CERTIFICATES_STEP_LABEL = "Certificados (inspeção TLS)"

/** Passo do preparo a partir da medição: falha quando há inspeção TLS e as prévias não receberiam as CAs. */
export function certificateStep(settings: Pick<LocalDockerSettings, "trustPcCertificates" | "pcCaBundlePath">, probe: CertificateProbe): LocalDockerStepDto {
    const label = CERTIFICATES_STEP_LABEL
    if (!probe.serverIssuer || !probe.pcIssuer) return { label, ok: true, detail: `Não verificado (sem openssl ou sem acesso a ${LOCAL_DOCKER_TLS_PROBE_HOST})` }
    if (probe.serverIssuer === probe.pcIssuer) return { label, ok: true, detail: `Sem inspeção TLS (emissor ${probe.pcIssuer})` }
    const seen = `A rede do PC inspeciona o TLS (emissor no PC: ${probe.pcIssuer})`
    if (!settings.trustPcCertificates) return { label, ok: false, detail: `${seen} e a injeção das CAs do PC está desligada: as chamadas HTTPS das prévias vão falhar` }
    if (!probe.bundleOk) return { label, ok: false, detail: `${seen}, mas o bundle ${settings.pcCaBundlePath} não existe no PC` }
    return { label, ok: true, detail: `${seen}: as prévias recebem as CAs do PC` }
}

export async function probeCertificates(settings: LocalDockerSettings, run: HostRunner = runOnHost): Promise<CertificateProbe> {
    const command = tlsIssuerCommand(LOCAL_DOCKER_TLS_PROBE_HOST)
    const [server, pc, bundle] = await Promise.all([run(command, 30_000), run(muxCommand(command), 30_000), run(caBundleCheckCommand(settings), 15_000)])
    return { serverIssuer: parseIssuer(server.output), pcIssuer: parseIssuer(pc.output), bundleOk: bundle.exitCode === 0 }
}

export async function certificatesStep(settings: LocalDockerSettings, run: HostRunner = runOnHost): Promise<LocalDockerStepDto> {
    try {
        return certificateStep(settings, await probeCertificates(settings, run))
    } catch (error) {
        localDockerLog.warn({ err: error }, "[local-docker] Falha ao verificar os certificados do PC")
        return { label: CERTIFICATES_STEP_LABEL, ok: true, detail: "Não verificado (falha ao medir)" }
    }
}

export interface PreviewOverride {
    /** Arquivos do compose para o build (base + override); `null` = sem override (padrão do compose). */
    composeFiles: string[] | null
    notice: { level: "info" | "warn"; message: string } | null
}

export interface CaOverrideInput {
    composeProject: string
    worktreePath: string
    /** `composeFile` da central (vazio = descoberta padrão do compose). */
    composeFile: string
    portEnvVar: string
    port: number
}

const withoutCas = (message: string): PreviewOverride => ({ composeFiles: null, notice: { level: "warn", message: `${message}: a prévia sobe sem as CAs do PC` } })

/**
 * Gera o override do compose da prévia com as CAs do PC. Nunca derruba o build: qualquer falha
 * vira aviso e o build segue com o compose padrão.
 */
export async function prepareCaOverride(settings: LocalDockerSettings, input: CaOverrideInput, run: HostRunner = runOnHost): Promise<PreviewOverride> {
    try {
        if (!settings.trustPcCertificates) {
            await run(removeComposeOverrideCommand(input.composeProject), 15_000)
            return { composeFiles: null, notice: null }
        }
        if ((await run(caBundleCheckCommand(settings), 15_000)).exitCode !== 0) return withoutCas(`O bundle de CAs ${settings.pcCaBundlePath} não existe no PC (confira o caminho na aba Docker do PC)`)
        const inspected = await run(composeInspectCommand(input), 60_000)
        const { files, services } = parseComposeInspect(inspected.output)
        if (inspected.exitCode !== 0 || files.length === 0 || services.length === 0) {
            const reason = lastLine(inspected.output)
            return withoutCas(`Não foi possível ler o compose da prévia${reason ? ` (${reason})` : ""}`)
        }
        const written = await run(writeComposeOverrideCommand(input.composeProject, caOverrideYaml(settings, services)), 15_000)
        const path = written.exitCode === 0 ? parseOverridePath(written.output) : null
        if (!path) return withoutCas(`Não foi possível gravar o override do compose${lastLine(written.output) ? ` (${lastLine(written.output)})` : ""}`)
        return { composeFiles: [...files, path], notice: { level: "info", message: `CAs do PC injetadas na prévia (${services.length} serviço(s) do compose)` } }
    } catch (error) {
        localDockerLog.warn({ err: error, composeProject: input.composeProject }, "[local-docker] Falha ao gerar o override das CAs do PC")
        return withoutCas("Falha ao gerar o override das CAs do PC")
    }
}
