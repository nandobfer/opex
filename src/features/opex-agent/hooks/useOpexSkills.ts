"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { acquireChannel, isPusherClientAvailable, releaseChannel } from "@/lib/pusher/client"
import {
    OPEX_SKILLS_EVENT,
    type OpexSkillCreateInput,
    type OpexSkillDetailDto,
    type OpexSkillDiscoveryDto,
    type OpexSkillDto,
    type OpexSkillFileDto,
    type OpexSkillInstallInput,
    type OpexSkillResultDto,
    type OpexSkillUpdateInput,
    type OpexSkillUpdateManyInput,
    type OpexSkillUsageDto,
} from "../skills"

/** Skills do Agente Opex (seção Skills e seleção do motor Opex nos rotineiros, OPE-153). */

export const OPEX_SKILLS_KEY = ["opex-skills"] as const
const listKey = [...OPEX_SKILLS_KEY, "list"] as const
const detailKey = (id: string) => [...OPEX_SKILLS_KEY, "detail", id] as const
const fileKey = (id: string, path: string) => [...OPEX_SKILLS_KEY, "file", id, path] as const
const usageKey = (id: string) => [...OPEX_SKILLS_KEY, "usage", id] as const

const fetchList = async (refresh = false) => unwrapApi((await api.get<ApiResponse<OpexSkillDto[]>>("/opex/skills", { params: refresh ? { refresh: "1" } : undefined })).data)

export const useOpexSkills = () => useQuery({ queryKey: listKey, queryFn: () => fetchList(), staleTime: 30_000 })

/** "Atualizar" da lista: consulta de novo o GitHub (ignora o cache de versões). */
export function useRefreshOpexSkills() {
    const queryClient = useQueryClient()
    return async () => {
        try {
            queryClient.setQueryData(listKey, await fetchList(true))
        } catch (error) {
            toast.error(apiErrorMessage(error, "Não foi possível atualizar a lista de skills"))
        }
    }
}

/** Detalhe para o editor: sempre fresco (nunca abre com conteúdo velho). */
export const useOpexSkill = (id: string | null) =>
    useQuery({
        queryKey: detailKey(id ?? ""),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexSkillDetailDto>>(`/opex/skills/${id}`)).data),
        enabled: Boolean(id),
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
        retry: false,
    })

export const useOpexSkillFile = (id: string | null, path: string | null) =>
    useQuery({
        queryKey: fileKey(id ?? "", path ?? ""),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexSkillFileDto>>(`/opex/skills/${id}/file`, { params: { path } })).data),
        enabled: Boolean(id && path),
        staleTime: 0,
        gcTime: 0,
        retry: false,
    })

export const useOpexSkillUsage = (id: string | null) =>
    useQuery({
        queryKey: usageKey(id ?? ""),
        queryFn: async () => unwrapApi((await api.get<ApiResponse<OpexSkillUsageDto>>(`/opex/skills/${id}/usage`)).data),
        enabled: Boolean(id),
        staleTime: 0,
    })

/** Qualquer mudança numa skill (tela, outra aba ou remoção) relê lista, detalhe e uso. */
export function useOpexSkillsRealtime(enabled = true): void {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!enabled || !isPusherClientAvailable()) return
        const name = appChannel()
        const channel = acquireChannel(name)
        const handler = () => void queryClient.invalidateQueries({ queryKey: OPEX_SKILLS_KEY })
        channel.bind(OPEX_SKILLS_EVENT, handler)
        return () => {
            channel.unbind(OPEX_SKILLS_EVENT, handler)
            releaseChannel(name)
        }
    }, [enabled, queryClient])
}

const useInvalidate = () => {
    const queryClient = useQueryClient()
    return () => void queryClient.invalidateQueries({ queryKey: OPEX_SKILLS_KEY })
}

export function useCreateOpexSkill() {
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async (input: OpexSkillCreateInput) => unwrapApi((await api.post<ApiResponse<OpexSkillDetailDto>>("/opex/skills", input)).data),
        onSuccess: (skill) => toast.success(`Skill ${skill.name} criada`),
        onSettled: invalidate,
    })
}

export function useUpdateOpexSkill() {
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async ({ id, input }: { id: string; input: OpexSkillUpdateInput }) => unwrapApi((await api.put<ApiResponse<OpexSkillDetailDto>>(`/opex/skills/${id}`, input)).data),
        onSuccess: (skill) => toast.success(`Skill ${skill.name} salva`),
        onSettled: invalidate,
    })
}

/** Switch com resposta otimista; falha reverte (a linha volta animada) e avisa. O estado final vem do servidor. */
export function useToggleOpexSkill() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => unwrapApi((await api.patch<ApiResponse<OpexSkillDto>>(`/opex/skills/${id}`, { enabled })).data),
        onMutate: async ({ id, enabled }) => {
            await queryClient.cancelQueries({ queryKey: listKey })
            const previous = queryClient.getQueryData<OpexSkillDto[]>(listKey)
            queryClient.setQueryData<OpexSkillDto[]>(listKey, (list) => list?.map((item) => (item.id === id ? { ...item, enabled } : item)))
            return { previous }
        },
        onError: (error, _vars, context) => {
            if (context?.previous) queryClient.setQueryData(listKey, context.previous)
            toast.error(apiErrorMessage(error, "Não foi possível alterar a skill"))
        },
        onSuccess: (saved) => toast.success(saved.enabled ? `Skill ${saved.name} ligada` : `Skill ${saved.name} desligada`),
        onSettled: () => void queryClient.invalidateQueries({ queryKey: listKey }),
    })
}

export function useDeleteOpexSkill() {
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async (id: string) => unwrapApi((await api.delete<ApiResponse<{ deleted: true; unlinked: number }>>(`/opex/skills/${id}`)).data),
        onSuccess: (result) => toast.success(result.unlinked ? `Skill removida (saiu de ${result.unlinked} agente(s) rotineiro(s))` : "Skill removida"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível remover a skill")),
        onSettled: invalidate,
    })
}

export function useDiscoverOpexSkills() {
    return useMutation({
        mutationFn: async (source: string) => unwrapApi((await api.post<ApiResponse<OpexSkillDiscoveryDto>>("/opex/skills/discover", { source }, { timeout: 0 })).data),
    })
}

const summarize = (results: OpexSkillResultDto[], verb: string) => {
    const ok = results.filter((item) => item.ok).length
    const failed = results.length - ok
    if (failed === 0) toast.success(`${ok} skill(s) ${verb}`)
    else if (ok === 0) toast.error(`Nenhuma skill ${verb}: ${results[0]?.message ?? "erro"}`)
    else toast.warning(`${ok} skill(s) ${verb}, ${failed} com erro`)
}

export function useInstallOpexSkills() {
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async (input: OpexSkillInstallInput) => unwrapApi((await api.post<ApiResponse<{ results: OpexSkillResultDto[] }>>("/opex/skills/install", input, { timeout: 0 })).data),
        onSuccess: ({ results }) => summarize(results, "instalada(s)"),
        onSettled: invalidate,
    })
}

export function useUpdateOpexSkills() {
    const invalidate = useInvalidate()
    return useMutation({
        mutationFn: async (input: OpexSkillUpdateManyInput) => unwrapApi((await api.post<ApiResponse<{ results: OpexSkillResultDto[] }>>("/opex/skills/update", input, { timeout: 0 })).data),
        onSuccess: ({ results }) => summarize(results, "atualizada(s)"),
        onError: (error) => toast.error(apiErrorMessage(error, "Não foi possível atualizar as skills")),
        onSettled: invalidate,
    })
}
