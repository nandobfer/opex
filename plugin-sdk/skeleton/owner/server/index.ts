import { definePlugin } from "@opex/plugin-sdk/server"

/** Servidor do plugin: registra uma rota e uma ferramenta (desfeitas sozinhas ao recarregar/desativar). */
export default definePlugin({
    inject: ["tools", "routes", "log", "sdk"],
    apply(ctx) {
        const { z } = ctx.sdk
        ctx.routes.get("/status", () => ({ ok: true }))
        ctx.tools.register({
            name: "status",
            label: "Status do plugin",
            description: "Confirma que o plugin está ativo",
            risk: "read",
            input: z.object({}),
            execute: async () => ({ ok: true }),
        })
        ctx.log.info("Plugin ativado")
    },
})
