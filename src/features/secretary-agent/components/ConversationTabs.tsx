"use client"

import { useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { MessagesSquare } from "lucide-react"
import { ConversationLabel } from "@/features/evolution-api/components/ConversationPicker"
import { EvolutionSyncAction } from "@/features/evolution-api/components/EvolutionSyncAction"
import { useEvolution, useEvolutionAction } from "@/features/evolution-api/hooks/useEvolution"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { CONVERSATION_STATE_LABELS, NOTICE_KIND_LABELS, type ConversationAgentState, type SecretaryNoticeKind } from "../constants"
import type { ConversationActionInput, NoticeActionInput } from "../schemas"
import { CONVERSATION_PARAM } from "../memory-focus"

type Conversation = EvolutionContactDto & { chatId: string; state: ConversationAgentState; pausedUntil: string | null }
export function ConversationsTab({ minutes }: { minutes: number }) {
    const query = useEvolution<Conversation[]>("/secretary/conversations", true, 30_000)
    const rows = query.data ?? []
    const scroll = useRef<HTMLDivElement>(null)
    const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroll.current, estimateSize: () => 82, enabled: rows.length > 50, overscan: 6 })
    return <Card><CardHeader><CardTitle>Conversas</CardTitle></CardHeader><CardContent>
        {query.isPending && <Skeleton className="h-64" />}
        {query.isError && <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>}
        {query.data?.length === 0 && <div className="flex flex-col items-center gap-3 py-8 text-center">
            <MessagesSquare className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p>Nenhuma conversa ainda.</p>
            <EvolutionSyncAction />
        </div>}
        {rows.length <= 50 ? rows.map((row) => <ConversationRow key={row.chatId} row={row} minutes={minutes} />) : <div className="max-h-[65vh] overflow-auto" ref={scroll}>
            <div className="relative" style={{ height: virtual.getTotalSize() }}>{virtual.getVirtualItems().map((item) => <div key={rows[item.index]!.chatId} data-index={item.index} ref={virtual.measureElement} className="absolute inset-x-0 top-0" style={{ transform: `translateY(${item.start}px)` }}><ConversationRow row={rows[item.index]!} minutes={minutes} /></div>)}</div>
        </div>}
    </CardContent></Card>
}

function ConversationRow({ row, minutes }: { row: Conversation; minutes: number }) {
    const action = useEvolutionAction<unknown, ConversationActionInput>(`/secretary/conversations/${encodeURIComponent(row.chatId)}`, "post", "Conversa atualizada")
    return <div className="flex flex-wrap items-center gap-3 border-b py-3">
        <Link href={`/integracoes/ia?aba=agente-secretario&secao=memorias&${CONVERSATION_PARAM}=${encodeURIComponent(row.chatId)}`} className="min-w-0 flex-1"><ConversationLabel contact={row} /></Link>
        <p className="text-sm">{CONVERSATION_STATE_LABELS[row.state]}{row.state === "paused" && row.pausedUntil ? ` até ${new Date(row.pausedUntil).toLocaleString("pt-BR")}` : ""}</p>
        <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate(row.state === "paused" ? { action: "resume" } : { action: "pause", minutes })}>{row.state === "paused" ? "Retomar" : "Pausar"}</Button>
        <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: row.state === "excluded" ? "include" : "exclude" })}>{row.state === "excluded" ? "Remover exclusão" : "Excluir dos critérios"}</Button>
    </div>
}

interface NoticeDto { _id: string; text: string; jid: string; kind: SecretaryNoticeKind; status: string; answer?: string; memoryChannel?: string }
export function NoticesTab() {
    const query = useEvolution<{ pending: number; items: NoticeDto[] }>("/secretary/notices")
    return <Card><CardHeader><CardTitle>Avisos · {query.data?.pending ?? 0} pendentes</CardTitle></CardHeader><CardContent className="space-y-4">
        {query.isPending && <Skeleton className="h-40" />}
        {query.isError && <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>}
        {query.data?.items.length === 0 && <p>Nenhum aviso registrado.</p>}
        {query.data?.items.map((notice) => <NoticeItem key={notice._id} notice={notice} />)}
    </CardContent></Card>
}
function NoticeItem({ notice }: { notice: NoticeDto }) {
    const [answer, setAnswer] = useState("")
    const action = useEvolutionAction<unknown, NoticeActionInput>(`/secretary/notices/${encodeURIComponent(notice._id)}`, "post", "Aviso atualizado")
    return <article className="space-y-2 rounded-lg border p-4">
        <p className="font-medium">{NOTICE_KIND_LABELS[notice.kind]} · {notice.jid}</p><p>{notice.text}</p>
        {notice.answer && <p className="text-sm">Sua resposta: {notice.answer}</p>}
        {notice.memoryChannel && <p className="text-sm text-muted-foreground">Memória gravada em {notice.memoryChannel}</p>}
        {notice.status === "answering" && <p className="text-sm text-muted-foreground">Aprendendo a resposta… Se travar por mais de 5 minutos, você pode responder de novo ou descartar.</p>}
        {(notice.status === "pending" || notice.status === "answering") && <><Textarea aria-label="Sua resposta" value={answer} onChange={(event) => setAnswer(event.target.value)} /><div className="flex gap-2">
            <Button disabled={!answer.trim() || action.isPending} onClick={() => action.mutate({ action: "answer", answer })}>Responder</Button>
            <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: "discard" })}>Descartar</Button>
        </div></>}
    </article>
}
