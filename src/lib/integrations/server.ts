/**
 * Central de integrações (`@nandobfer/integracoes/server`) com o runtime do Opex já configurado:
 * servidor importa daqui (resolvedor, store, debug, testes, serviço, explorador) para garantir a
 * injeção (banco, cofre, auditoria, Pino, Pusher) antes do primeiro uso.
 */
import "./runtime"

export * from "@nandobfer/integracoes/server"
export { getIntegration, getIntegrationConfig, integrations, type ResolvedIntegration } from "./runtime"
