"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import { ConversationPickerField } from "@/features/evolution-api/components/ConversationPicker"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import type { SecretaryForm } from "../SecretaryAgentTab"

const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Etapa 1, "Quem pode ser respondido": nunca responder a, responder a (todos/escolhidos) e a regra dos grupos. */
export function AudienceCard({ form, contacts }: { form: SecretaryForm; contacts: EvolutionContactDto[] }) {
    const audience = form.watch("criteria.audience")
    const set = <K extends keyof typeof audience>(key: K, value: (typeof audience)[K]) => form.setValue(`criteria.audience.${key}` as "criteria.audience", value as never, { shouldDirty: true, shouldValidate: true })
    const selectedError = form.formState.errors.criteria?.audience?.selected?.message
    return <Card>
        <CardHeader>
            <CardTitle className="text-base">Etapa 1 · Quem pode ser respondido</CardTitle>
            <CardDescription>Quem não passa aqui nunca é respondido, seja qual for o assunto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
            <div className="space-y-2">
                <p className="text-sm font-medium">Nunca responder a</p>
                <ConversationPickerField items={contacts} selected={audience.blocked} onChange={(items) => set("blocked", items)} placeholder="Ninguém" />
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium">Responder a</p>
                <OptionTabs aria-label="Responder a" value={audience.mode} options={[{ value: "everyone", label: "Todos" }, { value: "selected", label: "Só os escolhidos" }]} onChange={(value) => set("mode", value)} />
                <AnimatePresence initial={false} mode="wait">
                    {audience.mode === "everyone" ? (
                        <motion.div key="everyone" {...reveal} className="flex flex-wrap gap-4 overflow-hidden pt-1">
                            <label className="flex items-center gap-2 text-sm"><Switch checked={audience.direct} onCheckedChange={(value) => set("direct", value)} /> Conversas individuais</label>
                            <label className="flex items-center gap-2 text-sm"><Switch checked={audience.groups} onCheckedChange={(value) => set("groups", value)} /> Grupos</label>
                        </motion.div>
                    ) : (
                        <motion.div key="selected" {...reveal} className="space-y-1 overflow-hidden pt-1">
                            <ConversationPickerField items={contacts} selected={audience.selected} onChange={(items) => set("selected", items)} placeholder="Escolher contatos e grupos" />
                            {selectedError && <p role="alert" className="text-sm text-destructive">{selectedError}</p>}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <div className="space-y-2">
                <p className="text-sm font-medium">Em grupos, responder</p>
                <OptionTabs aria-label="Em grupos, responder" value={audience.groupReply} options={[{ value: "always", label: "Sempre" }, { value: "mention", label: "Só quando me mencionam" }]} onChange={(value) => set("groupReply", value)} />
                <p className="text-xs text-muted-foreground">Vale para todo grupo que passa nesta etapa, inclusive os escolhidos. Conta como menção citar seu número ou responder a uma mensagem sua.</p>
            </div>
        </CardContent>
    </Card>
}
