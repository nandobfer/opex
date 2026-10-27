import { fail, warnResult, type IntegrationTester } from "@/features/integrations/testers/types"
import { connectionProblem } from "../commands"
import { isBuilderMachineActive } from "./active"
import { loadState, settingsOf } from "./settings"
import { testSteps } from "./machine"
import { runOnHost, type HostRunner } from "./shell"

/** Teste de conexão da integração Builder Machine: os mesmos passos do teste da tela. */
export const createBuilderMachineTester = (run: HostRunner = runOnHost): IntegrationTester => async ({ emit }) => {
    if (!(await isBuilderMachineActive())) return warnResult("Integração desativada: ligue \"Integração ativa\" na aba Geral")
    const state = await loadState()
    const { settings } = settingsOf(state)
    const problem = connectionProblem(settings)
    if (problem) fail(`${problem} (aba Conexão com o PC)`)
    if (!state?.publicKey) fail("Sem chave do servidor: gere ou insira a chave na aba Preparo do PC")
    emit("step", settings.mode === "reverse" ? `Entrando no PC pelo túnel de controle (porta ${settings.controlPort} do servidor)` : `Entrando no PC em ${settings.pcHost}:${settings.pcSshPort}`)
    const steps = await testSteps(settings, run)
    for (const step of steps) emit(step.ok ? "success" : "error", `${step.label} — ${step.detail}`)
    const failed = steps.find((step) => !step.ok)
    if (failed) fail(`${failed.label}: ${failed.detail}`)
    const closed = steps.some((step) => step.label === "Túnel do Docker")
    return closed ? "PC acessível (túnel do Docker fechado: as prévias vão para o servidor)" : "PC acessível e túnel do Docker aberto"
}

export const testBuilderMachine: IntegrationTester = (context) => createBuilderMachineTester()(context)
