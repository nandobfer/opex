import { createContext, createElement, useContext } from "react"
import { api } from "./api.mjs"

/** `@opex/plugin-sdk/client` nos testes: host falso (dono, versão 1) e eventos que o teste dispara. */
const listeners = new Map()
const TestHost = createContext(null)
const DEFAULT_HOST = { pluginId: "plugin-de-teste", versionNumber: 1, channel: "stable", scope: "owner", clientId: null, api, routeBase: "/p/plugin-de-teste", channel_: "private-app" }

export function PluginHostProvider({ host, children }) {
    return createElement(TestHost.Provider, { value: { ...DEFAULT_HOST, ...host } }, children)
}

export function usePluginHost() {
    return useContext(TestHost) ?? DEFAULT_HOST
}

export function usePluginEvent(event, handler) {
    const set = listeners.get(event) ?? new Set()
    set.add(handler)
    listeners.set(event, set)
}

/** Dispara um evento do plugin para os componentes montados (teste). */
export function emitPluginEvent(event, data) {
    for (const handler of listeners.get(event) ?? []) handler(data)
}

export const definePluginClient = (module) => module
