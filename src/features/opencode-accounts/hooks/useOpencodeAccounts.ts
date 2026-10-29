"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import { OPENCODE_ACCOUNTS_UPDATED_EVENT, OPENCODE_LOGIN_POLL_MS } from "../constants"
import type {
    CommandStartInput,
    KeyConnectInput,
    OauthStartInput,
    OpencodeAuthProviderDto,
    OpencodeCommandAttemptDto,
    OpencodeLoginStatusDto,
    OpencodeOauthAttemptDto,
} from "../types"

/** Consultas e mutações das contas dos providers do OpenCode (aba Contas). */

export const OPENCODE_ACCOUNTS_QUERY_KEY = ["ai", "opencode-accounts"] as const
const MODELS_QUERY_KEY = ["ai", "models", "opencode"] as const
const BASE = "/ai/providers/opencode/accounts"

const seg = encodeURIComponent

export const useOpencodeAccounts = (enabled = true) =>
    useQuery({
        queryKey: OPENCODE_ACCOUNTS_QUERY_KEY,
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpencodeAuthProviderDto[]>>(BASE)).data),
        enabled,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: false,
    })

function useInvalidate() {
    const queryClient = useQueryClient()
    return () => {
        void queryClient.invalidateQueries({ queryKey: OPENCODE_ACCOUNTS_QUERY_KEY })
        void queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY })
    }
}

/** Marca `accountId` como a conta em uso do provider (resposta otimista). */
export function withActiveAccount(rows: readonly OpencodeAuthProviderDto[], integrationId: string, accountId: string): OpencodeAuthProviderDto[] {
    return rows.map((row) =>
        row.id !== integrationId ? row : { ...row, activeAccountId: accountId, accounts: row.accounts.map((account) => ({ ...account, active: account.id === accountId })) },
    )
}

export function useActivateOpencodeAccount() {
    const queryClient = useQueryClient()
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async ({ accountId }: { integrationId: string; accountId: string }) => unwrapApi((await api.post<ApiResponse<unknown>>(`${BASE}/credentials/${seg(accountId)}/activate`)).data),
        onMutate: async ({ integrationId, accountId }) => {
            await queryClient.cancelQueries({ queryKey: OPENCODE_ACCOUNTS_QUERY_KEY })
            const previous = queryClient.getQueryData<OpencodeAuthProviderDto[]>(OPENCODE_ACCOUNTS_QUERY_KEY)
            if (previous) queryClient.setQueryData(OPENCODE_ACCOUNTS_QUERY_KEY, withActiveAccount(previous, integrationId, accountId))
            return { previous }
        },
        onError: (error, _input, context) => {
            if (context?.previous) queryClient.setQueryData(OPENCODE_ACCOUNTS_QUERY_KEY, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível selecionar a conta"))
        },
        onSuccess: () => toast.success("Conta selecionada"),
        onSettled: invalidate,
    })
}

export function useRenameOpencodeAccount() {
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async ({ accountId, label }: { accountId: string; label: string }) => unwrapApi((await api.patch<ApiResponse<unknown>>(`${BASE}/credentials/${seg(accountId)}`, { label })).data),
        onSuccess: () => toast.success("Conta renomeada"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível renomear a conta")),
        onSettled: invalidate,
    })
}

export function useRemoveOpencodeAccount() {
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async ({ accountId }: { accountId: string }) => unwrapApi((await api.delete<ApiResponse<unknown>>(`${BASE}/credentials/${seg(accountId)}`)).data),
        onSuccess: () => toast.success("Conta removida do OpenCode"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível remover a conta")),
        onSettled: invalidate,
    })
}

export function useConnectOpencodeKey() {
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async ({ integrationId, input }: { integrationId: string; input: KeyConnectInput }) => unwrapApi((await api.post<ApiResponse<unknown>>(`${BASE}/${seg(integrationId)}/key`, input)).data),
        onSuccess: () => toast.success("Conta adicionada e selecionada"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível adicionar a conta")),
        onSettled: invalidate,
    })
}

export function useStartOpencodeOauth() {
    return useMutation({
        mutationFn: async ({ integrationId, input }: { integrationId: string; input: OauthStartInput }) => unwrapApi((await api.post<ApiResponse<OpencodeOauthAttemptDto>>(`${BASE}/${seg(integrationId)}/oauth`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar o login")),
    })
}

export function useCompleteOpencodeOauth() {
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async ({ integrationId, attemptId, code }: { integrationId: string; attemptId: string; code: string }) =>
            unwrapApi((await api.post<ApiResponse<unknown>>(`${BASE}/${seg(integrationId)}/oauth/${seg(attemptId)}`, { code })).data),
        onSuccess: () => toast.success("Conta adicionada e selecionada"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível concluir o login")),
        onSettled: invalidate,
    })
}

export function useStartOpencodeCommand() {
    return useMutation({
        mutationFn: async ({ integrationId, input }: { integrationId: string; input: CommandStartInput }) => unwrapApi((await api.post<ApiResponse<OpencodeCommandAttemptDto>>(`${BASE}/${seg(integrationId)}/command`, input)).data),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível iniciar o login")),
    })
}

export type OpencodeLoginKind = "oauth" | "command"

/** Status de um login em andamento; consulta a cada 1,5 s enquanto estiver pendente. */
export function useOpencodeLoginStatus(kind: OpencodeLoginKind, integrationId: string, attemptId: string | null) {
    const invalidate = useInvalidate()
    const query = useQuery({
        queryKey: ["ai", "opencode-login", kind, integrationId, attemptId],
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpencodeLoginStatusDto>>(`${BASE}/${seg(integrationId)}/${kind}/${seg(attemptId ?? "")}`)).data),
        enabled: attemptId !== null,
        refetchInterval: (current) => (current.state.data && current.state.data.status !== "pending" ? false : OPENCODE_LOGIN_POLL_MS),
        retry: false,
        gcTime: 0,
    })
    const status = query.data?.status
    useEffect(() => {
        if (status === "complete") invalidate()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reage só à mudança de status
    }, [status])
    return query
}

export async function cancelOpencodeLogin(kind: OpencodeLoginKind, integrationId: string, attemptId: string): Promise<void> {
    await api.delete(`${BASE}/${seg(integrationId)}/${kind}/${seg(attemptId)}`).catch(() => undefined)
}

/** Contas alteradas (nesta ou em outra aba/janela): recarrega a lista e os modelos do OpenCode. */
export function useOpencodeAccountsRealtime(): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => {
            void queryClient.invalidateQueries({ queryKey: OPENCODE_ACCOUNTS_QUERY_KEY })
            void queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY })
        }
        channel.bind(OPENCODE_ACCOUNTS_UPDATED_EVENT, handler)
        return () => {
            channel.unbind(OPENCODE_ACCOUNTS_UPDATED_EVENT, handler)
            releaseChannel(name)
        }
    }, [queryClient])
}
