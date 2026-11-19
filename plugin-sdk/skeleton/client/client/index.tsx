import { useQuery } from "@tanstack/react-query"
import { definePluginClient, usePluginHost } from "@opex/plugin-sdk/client"
import { Card, CardContent, CardHeader, CardTitle } from "@opex/ui/card"

/**
 * Widget do Dashboard do portal (slot `portal.dashboard.widgets`). Plugin de cliente é SÓ interface:
 * os dados vêm das APIs do portal que o usuário já acessa (`host.api`, filtradas pelo cliente).
 */
export function Widget() {
    const host = usePluginHost()
    const tasks = useQuery({
        queryKey: ["plugin", host.pluginId, "tasks"],
        queryFn: async () => (await host.api.get<{ success: boolean; data: { tasks: unknown[] } }>("/cliente/tasks")).data.data,
    })
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">__PLUGIN_NAME__</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">{tasks.data ? `${tasks.data.tasks.length} tarefa(s)` : "Carregando…"}</p>
            </CardContent>
        </Card>
    )
}

export default definePluginClient({ slots: { Widget } })
