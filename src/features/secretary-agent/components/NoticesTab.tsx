"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Bell } from "lucide-react"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ConversationLabel } from "@/features/evolution-api/components/ConversationPicker"
import { useEvolution, useEvolutionAction } from "@/features/evolution-api/hooks/useEvolution"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { NOTICE_KIND_LABELS, type SecretaryNoticeKind } from "../constants"
import type { NoticeActionInput } from "../schemas"
import { channelDisplay } from "@/features/engramind/channel-namespace"
import { useChannelNamespace } from "@/features/engramind/hooks/useChannelNamespace"
interface NoticeDto { _id: string; text: string; contact: EvolutionContactDto; author?: string; excerpt?: string; kind: SecretaryNoticeKind; status: string; answer?: string; memoryChannel?: string }
export function NoticesTab() {
    const query = useEvolution<{ pending: number; items: NoticeDto[] }>("/secretary/notices")
    return <Card><CardHeader><CardTitle>Avisos · {query.data?.pending ?? 0} pendentes</CardTitle></CardHeader><CardContent className="space-y-4">
        {query.isPending && <div role="status" aria-label="Carregando avisos" className="space-y-4">{[0, 1].map((row) => <div key={row} className="space-y-2 rounded-lg border p-4"><Skeleton className="h-9 w-44" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>)}</div>}
        {query.isError && <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>}
        {query.data?.items.length === 0 && <EmptyState icon={Bell} title="Nenhum aviso registrado." description="Perguntas ao dono e avisos de limite aparecem aqui." actionLabel="Atualizar avisos" onAction={() => void query.refetch()} />}
        {query.data?.items.map((notice) => <NoticeItem key={notice._id} notice={notice} />)}
    </CardContent></Card>
}
function NoticeItem({ notice }: { notice: NoticeDto }) {
    const [answer, setAnswer] = useState("")
    const ns = useChannelNamespace({ enabled: Boolean(notice.memoryChannel) }).data
    const action = useEvolutionAction<unknown, NoticeActionInput>(`/secretary/notices/${encodeURIComponent(notice._id)}`, "post", "Aviso atualizado")
    return <article className="space-y-2 rounded-lg border p-4">
        <ConversationLabel contact={notice.contact} />
        <p className="text-sm font-medium">{NOTICE_KIND_LABELS[notice.kind]}{notice.author ? ` · ${notice.author}` : ""}</p><p>{notice.text}</p>
        {notice.excerpt && <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3 text-sm text-muted-foreground">{notice.excerpt}</blockquote>}
        {notice.answer && <p className="text-sm">Sua resposta: {notice.answer}</p>}
        {notice.memoryChannel && <p className="text-sm text-muted-foreground">Memória gravada em {channelDisplay(ns, notice.memoryChannel)}</p>}
        {notice.status === "answering" && <p className="text-sm text-muted-foreground">Aprendendo a resposta… Se travar por mais de 5 minutos, você pode responder de novo ou descartar.</p>}
        {(notice.status === "pending" || notice.status === "answering") && <><Textarea aria-label="Sua resposta" value={answer} onChange={(event) => setAnswer(event.target.value)} /><div className="flex gap-2">
            <Button disabled={!answer.trim() || action.isPending} onClick={() => action.mutate({ action: "answer", answer })}>Responder</Button>
            <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ action: "discard" })}>Descartar</Button>
        </div></>}
    </article>
}
