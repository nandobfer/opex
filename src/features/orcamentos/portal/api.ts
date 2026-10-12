"use client"

import axios, { type AxiosInstance } from "axios"
import { withBasePath } from "@/lib/base-path"

/**
 * Cliente HTTP do portal do cliente: autenticação por **cookie de sessão** (mesmo domínio). O header
 * `x-client-id` identifica o cliente em escopo — obrigatório quando o **dono** está pré-visualizando
 * o portal (a sessão dele não tem cliente). Para o usuário de cliente o servidor usa o `clientId` do
 * cookie e ignora o header.
 */
export function createClientePortalApi(clientId: string): AxiosInstance {
    return axios.create({
        baseURL: withBasePath("/api"),
        headers: { "Content-Type": "application/json", "x-client-id": clientId },
        withCredentials: true,
    })
}
