"use client"

import { useParams } from "next/navigation"
import { DevCenterPage } from "./DevCenterPage"

/**
 * Central de desenvolvimento montada pelo **layout** de `/desenvolvimento`: a tarefa vem de
 * `useParams`. As páginas (`/desenvolvimento` e `/desenvolvimento/[taskId]`) não renderizam nada,
 * porque o Next remonta a página ao trocar de arquivo ou de valor do segmento dinâmico — no layout
 * a tela continua montada e só a mesa anima ao trocar de tarefa.
 */
export function DevCenterRoute() {
    const params = useParams<{ taskId?: string | string[] }>()
    const raw = params?.taskId
    const taskId = (Array.isArray(raw) ? raw[0] : raw) || null
    return <DevCenterPage taskId={taskId} />
}
