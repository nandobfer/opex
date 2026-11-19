import type { PluginSourceFile } from "@/features/plugins/manifest"

/** Fontes de plugin usadas nos testes (OPE-172). */

export function ownerManifest(overrides: Record<string, unknown> = {}) {
    return {
        id: "relogio",
        name: "Relógio",
        apiVersion: "1.0",
        scope: "owner",
        entries: { server: "server/index.ts", client: "client/index.tsx" },
        slots: [{ slot: "dashboard.widgets", export: "Widget", title: "Relógio" }],
        tools: ["hora_atual"],
        routes: [{ method: "GET", path: "/hora" }],
        crons: ["tique"],
        services: ["tools", "routes", "cron", "log", "sdk"],
        ...overrides,
    }
}

export function ownerPluginFiles(options: { manifest?: Record<string, unknown>; server?: string; client?: string } = {}): PluginSourceFile[] {
    return [
        { path: "plugin.json", content: JSON.stringify(ownerManifest(options.manifest)) },
        {
            path: "server/index.ts",
            content:
                options.server ??
                `import { definePlugin } from "@opex/plugin-sdk/server"
import { horaLabel } from "./util"
export default definePlugin({
    inject: ["tools", "routes", "cron", "log", "sdk"],
    apply(ctx: any) {
        ctx.tools.register({ name: "hora_atual", label: "Hora atual", description: "Devolve a hora", risk: "read", input: ctx.sdk.z.object({}), execute: async () => ({ hora: horaLabel() }) })
        ctx.routes.get("/hora", () => ({ hora: horaLabel() }))
        ctx.cron.schedule("tique", { type: "interval", minutes: 5 }, () => undefined)
    },
})
`,
        },
        { path: "server/util.ts", content: `export const horaLabel = (): string => "12:00"\n` },
        {
            path: "client/index.tsx",
            content:
                options.client ??
                `import { useState } from "react"
import { Card } from "@opex/ui/card"
export function Widget() {
    const [hora] = useState("12:00")
    return <Card className="bg-primary/20 p-3">{hora}</Card>
}
export default { slots: { Widget } }
`,
        },
    ]
}
