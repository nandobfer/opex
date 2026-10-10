"use client"

import axios, { type AxiosInstance } from "axios"
import { withBasePath } from "@/lib/base-path"

/**
 * Cliente HTTP do portal do cliente: autenticação pelo token do cliente no header
 * `x-client-token` (a página recebe o token por `?t=` e o repassa).
 */
export function createClientPortalApi(token: string): AxiosInstance {
    return axios.create({
        baseURL: withBasePath("/api"),
        headers: { "Content-Type": "application/json", "x-client-token": token },
    })
}
