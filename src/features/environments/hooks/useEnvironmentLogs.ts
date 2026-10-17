"use client"

import { useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { useEnvironmentApi } from "./useEnvironments"

export interface EnvironmentLogLine {
    id: string
    ts: string
    message: string
}
export function useEnvironmentLogs(repoId: string, envId: string, service: string) {
    const api = useEnvironmentApi()
    const sendRef = useRef(api.send)
    useEffect(() => {
        sendRef.current = api.send
    }, [api.send])
    const query = useQuery({
        queryKey: [...api.key, repoId, envId, "logs", service],
        queryFn: () =>
            api.get<EnvironmentLogLine[]>(
                `/${repoId}/environments/${envId}/logs${service ? `?service=${encodeURIComponent(service)}` : ""}`,
            ),
        refetchInterval: 3000,
    })
    useEffect(() => {
        const viewerId = crypto.randomUUID()
        const path = `/${repoId}/environments/${envId}/viewer`
        const heartbeat = () => {
            void sendRef.current("post", path, { viewerId, remove: false }).catch(() => undefined)
        }
        heartbeat()
        const timer = setInterval(heartbeat, 30000)
        return () => {
            clearInterval(timer)
            void sendRef.current("post", path, { viewerId, remove: true }).catch(() => undefined)
        }
    }, [repoId, envId])
    return query
}
