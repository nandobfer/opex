import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { SECRETARY_DECISION_LABELS } from "../../constants"
import type { DecisionRowDto } from "../../types"

/** Linha do registro: o mesmo conteúdo do antigo card de Critérios (decisão, contato, motivo e data/hora). */
export function DecisionRow({ row, name }: { row: DecisionRowDto; name?: string }) {
    return (
        <div className="py-2" data-testid="decision-row">
            <strong>{SECRETARY_DECISION_LABELS[row.decision]}</strong> · {name ?? row.jid}
            <p className="text-sm text-muted-foreground">{row.reason} · {format(new Date(row.at), "Pp", { locale: ptBR })}</p>
        </div>
    )
}
