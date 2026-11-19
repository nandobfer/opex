import { definePluginClient } from "@opex/plugin-sdk/client"
import { Card, CardContent, CardHeader, CardTitle } from "@opex/ui/card"

/** Widget do Dashboard (slot `dashboard.widgets`). Cores só por tokens do tema (bg-primary, text-muted-foreground...). */
export function Widget() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">__PLUGIN_NAME__</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Plugin ativo.</p>
            </CardContent>
        </Card>
    )
}

export default definePluginClient({ slots: { Widget } })
