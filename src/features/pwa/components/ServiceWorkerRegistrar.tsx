"use client"

import { useEffect } from "react"
import { BASE_PATH, withBasePath } from "@/lib/base-path"
import { PWA_SERVICE_WORKER_PATH } from "../constants"

/** `true` quando o navegador pode registrar o SW: produção, API disponível e contexto seguro (HTTPS/localhost). */
export function canRegisterServiceWorker(): boolean {
    return process.env.NODE_ENV === "production" && typeof window !== "undefined" && window.isSecureContext && "serviceWorker" in navigator
}

/**
 * Registra o service worker do PWA (OPE-196). Não força recarga quando chega uma versão nova: a
 * navegação seguinte já usa o deploy novo, sem perder o que estiver sendo digitado. Ao voltar para o
 * app (`visibilitychange`) pede ao navegador que confira se há SW novo, porque o app instalado fica
 * aberto por muito tempo.
 */
export function ServiceWorkerRegistrar() {
    useEffect(() => {
        if (!canRegisterServiceWorker()) return
        let registration: ServiceWorkerRegistration | null = null
        let disposed = false
        const onVisible = () => {
            if (document.visibilityState === "visible") registration?.update().catch(() => undefined)
        }
        navigator.serviceWorker
            .register(withBasePath(PWA_SERVICE_WORKER_PATH), { scope: `${BASE_PATH}/`, updateViaCache: "none" })
            .then((value) => {
                if (!disposed) registration = value
            })
            .catch(() => undefined)
        document.addEventListener("visibilitychange", onVisible)
        return () => {
            disposed = true
            document.removeEventListener("visibilitychange", onVisible)
        }
    }, [])
    return null
}
