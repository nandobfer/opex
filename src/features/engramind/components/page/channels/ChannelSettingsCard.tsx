"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FORM_GRID } from "@/components/ui/form-grid";
import { CHANNEL_HELP } from "../../../help/identities";
import {
  buildSettingsSchema,
  changedSettings,
} from "../../../schemas/settings";
import type { ChannelSettingsView } from "../../../types";
import {
  engramindSend,
  route,
  useEngramindMutation,
  useEngramindQuery,
} from "../../../hooks/useEngramind";
import { formatSettingValue } from "../../shared/format";
import { Section } from "../../shared/Section";
import { QueryBoundary } from "../../shared/QueryBoundary";
import { ListSkeleton } from "../../shared/ListSkeleton";
import { StaleFormNotice } from "../../shared/StaleFormNotice";
import { useFormSnapshot } from "../../shared/useFormSnapshot";
import { SettingField } from "../../integration/settings/SettingField";

/** Configurações do canal: só as chaves que aceitam sobreposição (efetivo, global e sobreposição). */
export function ChannelSettingsCard({ channel }: { channel: string }) {
  const query = useEngramindQuery<ChannelSettingsView>(
    route("channels", channel, "settings"),
  );
  const [dirty, setDirty] = useState(false);
  // Refazer a consulta não descarta o rascunho (remonta só com conteúdo novo e sem alterações pendentes).
  const snapshot = useFormSnapshot(query.data?.settings, dirty);
  return (
    <Section
      title="Configurações do canal"
      info={CHANNEL_HELP.override}
      description="Sem sobreposição, vale o valor global."
    >
      <QueryBoundary
        isLoading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        skeleton={<ListSkeleton rows={3} rowClassName="h-24" />}
      >
        <StaleFormNotice stale={snapshot.stale} onReload={() => snapshot.adopt()} />
        <ChannelSettingsForm
          key={snapshot.key}
          channel={channel}
          metas={snapshot.data ?? []}
          onDirtyChange={setDirty}
          onSaved={async () =>
            snapshot.adopt((await query.refetch()).data?.settings)
          }
        />
      </QueryBoundary>
    </Section>
  );
}

function ChannelSettingsForm({
  channel,
  metas,
  onDirtyChange,
  onSaved,
}: {
  channel: string;
  metas: ChannelSettingsView["settings"];
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const saved = useMemo(
    () =>
      Object.fromEntries(
        metas.map((meta) => [meta.key, meta.override ?? null]),
      ),
    [metas],
  );
  const [draft, setDraft] = useState<Record<string, unknown>>(saved);
  const changes = changedSettings(saved, draft);
  const valid = buildSettingsSchema(metas).safeParse(changes).success;
  const dirty = Object.keys(changes).length > 0;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const save = useEngramindMutation(
    (settings: Record<string, unknown>) =>
      engramindSend("put", route("channels", channel, "settings"), {
        settings,
      }),
    { invalidate: ["channels"], success: "Configurações do canal salvas" },
  );
  return (
    <>
      <div className={FORM_GRID}>
        {metas.map((meta) => (
          <SettingField
            key={meta.key}
            meta={{ ...meta, default: meta.global }}
            value={draft[meta.key] ?? null}
            dirty={meta.key in changes}
            onChange={(value) =>
              setDraft((prev) => ({ ...prev, [meta.key]: value }))
            }
            extra={`Efetivo: ${formatSettingValue(meta.value)}${meta.override != null ? " (sobreposição)" : ""}`}
            resetLabel="Remover sobreposição"
            defaultLabel="Global"
            hideHistory
          />
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => save.mutate(changes, { onSuccess: () => void onSaved() })}
          disabled={
            Object.keys(changes).length === 0 || !valid || save.isPending
          }
        >
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="mr-2 h-4 w-4" aria-hidden />
          )}{" "}
          Salvar
        </Button>
      </div>
    </>
  );
}
