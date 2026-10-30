"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Fingerprint, KeySquare, Loader2, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useReadHostFingerprint, useTrustHostKey } from "../hooks/useOpencodeService"
import type { OpencodeServiceStatusDto } from "../types"

/**
 * Acesso SSH ao host (só para o ciclo de vida do serviço): mostra a configuração e a impressão digital
 * confiada; "Ler chave do host" + "Confiar" grava a impressão digital (a verificação nunca é desligada).
 */
export function SshAccessCard({ ssh }: { ssh: OpencodeServiceStatusDto["ssh"] }) {
    const read = useReadHostFingerprint()
    const trust = useTrustHostKey()
    const [seen, setSeen] = useState<string | null>(null)
    return (
        <Card>
            <CardHeader className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-base">
                    <KeySquare className="h-4 w-4 text-primary" aria-hidden /> Acesso SSH ao host
                    <Badge variant={ssh.trusted ? "success" : ssh.configured ? "warning" : "outline"}>{ssh.trusted ? "Pronto" : ssh.configured ? "Falta confiar na chave" : "Não configurado"}</Badge>
                </CardTitle>
                <CardDescription>Usado só para iniciar, parar, reiniciar e atualizar o serviço e ler os logs com ele parado. Host, usuário e chave privada ficam na aba Configuração.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <p className="font-mono text-xs text-muted-foreground">
                    {ssh.user ?? "usuário?"}@{ssh.host ?? "host?"}:{ssh.port} · executável {ssh.bin ?? "(detectado com o serviço no ar)"}
                </p>
                {ssh.fingerprint ? (
                    <p className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-success" aria-hidden /> <span className="font-mono text-xs">{ssh.fingerprint}</span>
                    </p>
                ) : null}
                <AnimatePresence initial={false}>
                    {seen && seen !== ssh.fingerprint ? (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2 rounded-md border bg-muted/40 p-3">
                            <p>O host apresentou a chave:</p>
                            <p className="font-mono text-xs text-foreground">{seen}</p>
                            <p className="text-xs text-muted-foreground">Confira na máquina com: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</p>
                            <Button type="button" size="sm" className="gap-1.5" disabled={trust.isPending} onClick={() => trust.mutate(seen, { onSuccess: () => setSeen(null) })}>
                                {trust.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                                Confiar
                            </Button>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
                {!ssh.fingerprint && ssh.configured ? (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={read.isPending} onClick={() => read.mutate(undefined, { onSuccess: (result) => setSeen(result.fingerprint) })}>
                        {read.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Fingerprint className="h-4 w-4" aria-hidden />}
                        Ler chave do host
                    </Button>
                ) : null}
            </CardContent>
        </Card>
    )
}
