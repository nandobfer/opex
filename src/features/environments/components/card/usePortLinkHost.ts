"use client"

import { useSyncExternalStore } from "react"
import { portLinkHost } from "../../container-ports"

const subscribe = () => () => undefined

/** Host dos links das portas: o configurado ou, vazio, o endereço com que a tela foi aberta. */
export function usePortLinkHost(configured: string | null | undefined): string {
    const pageHost = useSyncExternalStore(
        subscribe,
        () => window.location.hostname,
        () => "",
    )
    return portLinkHost(configured, pageHost)
}
