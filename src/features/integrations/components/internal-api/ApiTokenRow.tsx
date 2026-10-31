"use client"

import { motion } from "framer-motion"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { listItem } from "@/components/motion/presets"
import { describeScopes, type ScopeBadge } from "../../api-tokens/scopes"
import type { ApiTokenDto, ApiTokenScopeCatalogDto } from "../../api-tokens/types"
import { ApiTokenScopeBadges } from "./ApiTokenScopeBadges"
import { TOKEN_ROW, TOKEN_ROW_ACTIONS, TOKEN_ROW_BODY } from "./api-token-row-layout"

const day = (iso: string) => format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

/** Badges da linha: escopos resumidos e a situação da expiração. */
export function tokenBadges(token: ApiTokenDto, catalog?: ApiTokenScopeCatalogDto): ScopeBadge[] {
    const badges = describeScopes(token.legado ? null : token.escopos, catalog).badges
    if (token.expirado) return [{ key: "expired", label: "Expirado", tone: "destructive" }, ...badges]
    if (token.expiraEm) return [...badges, { key: "expires", label: `Expira ${format(new Date(token.expiraEm), "dd/MM/yyyy", { locale: ptBR })}`, tone: "warning" }]
    return badges
}

interface ApiTokenRowProps {
    token: ApiTokenDto
    catalog?: ApiTokenScopeCatalogDto
    onEdit: (token: ApiTokenDto) => void
    onRevoke: (token: ApiTokenDto) => void
}

/** Um token de sistema: nome, prefixo, escopos (badges), datas, editar escopos e revogar. */
export function ApiTokenRow({ token, catalog, onEdit, onRevoke }: ApiTokenRowProps) {
    return (
        <motion.li layout="position" variants={listItem} initial="hidden" animate="visible" exit="exit" className={TOKEN_ROW} data-testid={`api-token-${token.id}`}>
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className={TOKEN_ROW_BODY}>
                <p className="text-sm font-medium">
                    {token.nome} <span className="font-mono text-xs text-muted-foreground">{token.prefixo}…</span>
                </p>
                <ApiTokenScopeBadges badges={tokenBadges(token, catalog)} />
                <p className="text-xs text-muted-foreground">
                    {token.ultimoUsoEm ? `usado em ${day(token.ultimoUsoEm)}` : "ainda não usado"} · criado em {day(token.criadoEm)}
                </p>
            </div>
            <div className={TOKEN_ROW_ACTIONS}>
                <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(token)}>
                    Editar escopos
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onRevoke(token)}>
                    Revogar
                </Button>
            </div>
        </motion.li>
    )
}
