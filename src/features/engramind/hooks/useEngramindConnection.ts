"use client"

import { useQuery } from "@tanstack/react-query"
import { api, unwrapApi } from "@/lib/api"
import type { ApiResponse } from "@/lib/types/api"
import type { ConnectionInput } from "../schemas/connection"
import type { ConnectionSaveResultDto, EngramindConnectionDto, EnvironmentOptionDto } from "../types"
import { integrationDetailKey, integrationsListKey } from "@/features/integrations/hooks/useIntegrations"
import { ENGRAMIND_INTEGRATION_ID } from "../constants"
import { areaKey, useEngramindMutation } from "./useEngramind"

/** A conexão grava campos da integração: o detalhe e a lista de /integracoes também mudam. */
const integrationKeys = () => [integrationDetailKey(ENGRAMIND_INTEGRATION_ID), integrationsListKey]

export const connectionKey = [...areaKey("connection")] as const

/** Conexão (URLs, Ambiente, whoami e webhook). */
export const useEngramindConnection = () =>
    useQuery({ queryKey: connectionKey, queryFn: async () => unwrapApi((await api.get<ApiResponse<EngramindConnectionDto>>("/engramind/connection")).data) })

export const useSaveEngramindConnection = () =>
    useEngramindMutation((input: ConnectionInput) => api.put<ApiResponse<ConnectionSaveResultDto>>("/engramind/connection", input).then((res) => unwrapApi(res.data)), {
        invalidate: ["connection", "settings", "apps", "tokens", "status", "env"],
        silentError: true,
        alsoInvalidate: integrationKeys(),
    })

export const useRunEngramindBootstrap = () =>
    useEngramindMutation(() => api.post<ApiResponse<ConnectionSaveResultDto>>("/engramind/connection/bootstrap").then((res) => unwrapApi(res.data)), { invalidate: ["connection", "apps", "tokens"], alsoInvalidate: integrationKeys() })

/** Ambientes cadastrados ou adotados (seletor da aba Conexão). */
export const useEngramindEnvironmentOptions = () =>
    useQuery({ queryKey: [...areaKey("environments")], queryFn: async () => unwrapApi((await api.get<ApiResponse<EnvironmentOptionDto[]>>("/engramind/environments")).data) })
