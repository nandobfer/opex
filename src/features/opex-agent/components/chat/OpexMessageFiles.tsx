"use client"

import { useCallback } from "react"
import { MessageFiles, type FileHref } from "@/components/chat-attachments/MessageFiles"
import { withBasePath } from "@/lib/base-path"
import type { OpexFileDto } from "../../types"
import { useOpexScope } from "../OpexScopeProvider"

/** Arquivos de uma mensagem do chat (kit compartilhado), com a rota do conteúdo no escopo do agente. */
export function OpexMessageFiles({ files, align = "end" }: { files: OpexFileDto[]; align?: "start" | "end" }) {
    const { apiBase } = useOpexScope()
    // A rota do conteúdo segue o escopo (dono: `/api/opex`, portal: `/api/cliente/opex`).
    const fileHref = useCallback<FileHref>((file, download) => withBasePath(`/api${apiBase}/files/${file.id}${download ? "?download=1" : ""}`), [apiBase])
    return <MessageFiles files={files} align={align} fileHref={fileHref} />
}
