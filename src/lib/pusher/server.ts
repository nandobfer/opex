/**
 * Cliente Pusher do servidor (integração Pusher da central `@nandobfer/integracoes`), com o runtime do
 * Opex já configurado. Os canais e eventos do app ficam em `./channels.ts`.
 */
import "@/lib/integrations/runtime"

export { PusherNotConfiguredError, buildPusherServerOptions, getPusherServer, getRawPusherServer, isPusherServerConfigured, pusher } from "@nandobfer/integracoes/pusher/server"
