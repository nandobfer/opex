"use client"

import { createContext, useContext, useEffect, type ReactNode } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, unwrapApi, apiErrorMessage } from "@/lib/api"
import { toast } from "sonner"
import { getPusherClient, isPusherClientAvailable, acquireChannel, releaseChannel } from "@/lib/pusher/client"
import type { EnvironmentDetail, EnvironmentDto, RepoConfigDto, RepoOption } from "../types"
import type { EnvironmentInput, OperationInput, RepoConfigInput } from "../schemas"

const Context = createContext({ portal: false, clientId: "" })
export function EnvironmentProvider({
    portal,
    clientId = "",
    children,
}: {
    portal: boolean
    clientId?: string
    children: ReactNode
}) {
    const cache = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const pusher = getPusherClient()
        const name = portal ? `private-client-${clientId}` : "private-app"
        const channel = acquireChannel(name)
        const refresh = () => void cache.invalidateQueries({ queryKey: ["environments", portal, clientId] })
        channel.bind("environments-updated", refresh)
        pusher.connection.bind("connected", refresh)
        return () => {
            channel.unbind("environments-updated", refresh)
            pusher.connection.unbind("connected", refresh)
            releaseChannel(name)
        }
    }, [cache, portal, clientId])
    return <Context.Provider value={{ portal, clientId }}>{children}</Context.Provider>
}
export function useEnvironmentApi() {
    const ctx = useContext(Context)
    const prefix = ctx.portal ? "/cliente/ambientes" : "/environments"
    const key = ["environments", ctx.portal, ctx.clientId] as const
    const headers = ctx.clientId ? { "x-client-id": ctx.clientId } : undefined
    async function get<T>(path = "") {
        return unwrapApi<T>((await api.get(prefix + path, { headers })).data)
    }
    async function send<T>(method: "post" | "put", path: string, data: unknown) {
        return unwrapApi<T>((await api[method](prefix + path, data, { headers })).data)
    }
    return { ...ctx, key, get, send, href: ctx.portal ? "/cliente/ambientes" : "/ambientes" }
}
export function useEnvironmentRepos() {
    const client = useEnvironmentApi()
    return useQuery({ queryKey: [...client.key, "repos"], queryFn: () => client.get<RepoOption[]>() })
}
export function useEnvironmentList(repoId: string) {
    const client = useEnvironmentApi()
    return useQuery({
        queryKey: [...client.key, repoId, "list"],
        queryFn: () => client.get<EnvironmentDto[]>(`/${repoId}`),
        enabled: Boolean(repoId),
        refetchInterval: 15000,
    })
}
export function useEnvironmentDetail(repoId: string, envId: string) {
    const client = useEnvironmentApi()
    return useQuery({
        queryKey: [...client.key, repoId, envId],
        queryFn: () => client.get<EnvironmentDetail>(`/${repoId}/environments/${envId}`),
        enabled: Boolean(repoId && envId && envId !== "novo"),
        refetchInterval: 10000,
    })
}
export function useEnvironmentRepoConfig(repoId: string) {
    const client = useEnvironmentApi()
    return useQuery({
        queryKey: [...client.key, repoId, "config"],
        queryFn: () => client.get<RepoConfigDto>(`/${repoId}/config`),
        enabled: Boolean(repoId),
    })
}
export function useEnvironmentMutation<T, R = unknown>(
    action: (client: ReturnType<typeof useEnvironmentApi>, input: T) => Promise<R>,
) {
    const client = useEnvironmentApi()
    const cache = useQueryClient()
    return useMutation({
        mutationFn: (input: T) => action(client, input),
        onSuccess: async () => {
            await cache.invalidateQueries({ queryKey: client.key })
            toast.success("Ação registrada")
        },
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível executar a ação")),
    })
}
export function useSaveEnvironment(repoId: string, envId?: string) {
    return useEnvironmentMutation<{ config: EnvironmentInput; revision?: number }, EnvironmentDto>((client, input) =>
        client.send<EnvironmentDto>(
            envId ? "put" : "post",
            `/${repoId}/environments${envId ? `/${envId}` : ""}`,
            input,
        ),
    )
}
export function useSaveEnvironmentConfig(repoId: string) {
    return useEnvironmentMutation<{ config: RepoConfigInput; revision: number }>((client, input) =>
        client.send("put", `/${repoId}/config`, input),
    )
}
export function useEnvironmentOperation(repoId: string, envId: string) {
    return useEnvironmentMutation<OperationInput>((client, input) =>
        client.send("post", `/${repoId}/environments/${envId}/operations`, input),
    )
}
