"use client"

import { PluginRouteError } from "@/features/plugins/client/PluginRouteError"

export default function PluginPageError({ reset }: { error: Error; reset: () => void }) {
    return <PluginRouteError reset={reset} />
}
