/**
 * Configuração pública do cliente Pusher (key, modo e cluster ou URL), com fallback para os valores do
 * servidor quando os campos "do cliente" estão vazios. Nunca lança.
 */
import "@/lib/integrations/runtime"

export { getPusherPublicConfig } from "@nandobfer/integracoes/pusher/server"
