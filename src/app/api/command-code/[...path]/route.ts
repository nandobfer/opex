import { integrations } from "@/lib/integrations/runtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Rotas da central de integrações no ponto de montagem `command-code` (`/api/command-code/...`), despachadas pelo registro. Sessão do dono; não é endpoint público por token. */
export const { GET, POST, PUT, PATCH, DELETE } = integrations.nextHandlers("command-code")
