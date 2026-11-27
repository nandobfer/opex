"use client";

import { FORM_GRID } from "@/components/ui/form-grid";
import { Input } from "@/components/ui/input";
import { OptionTabs } from "@/components/ui/option-tabs";
import type { HealthcheckMode, HealthcheckOverride } from "../../schemas";
import { ArgsField } from "./ArgsField";

const MODE_OPTIONS = [
  {
    value: "shell",
    label: "Shell",
    title: "CMD-SHELL: o comando roda num shell",
  },
  {
    value: "exec",
    label: "Exec",
    title: "CMD: um argumento por linha, sem shell",
  },
  {
    value: "disable",
    label: "Desligado",
    title: "Sem healthcheck (nem o da imagem)",
  },
] as const;

type Timed = Exclude<HealthcheckOverride, { mode: "disable" }>;
const EMPTY_TIMED: Omit<Timed, "mode" | "test"> = {
  interval: "",
  timeout: "",
  startPeriod: "",
  retries: null,
};

/** Healthcheck do serviço (OPE-211): shell, exec ou desligado, com as durações (vazio = padrão do Docker). */
export function HealthcheckField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: HealthcheckOverride;
  onChange: (value: HealthcheckOverride) => void;
}) {
  const changeMode = (mode: HealthcheckMode) => {
    if (mode === "disable") return onChange({ mode: "disable" });
    const timed =
      value.mode === "disable" ? { ...EMPTY_TIMED, test: [""] } : value;
    onChange({
      ...timed,
      mode,
      test: mode === "shell" ? [timed.test.join(" ")] : timed.test,
    });
  };
  return (
    <div className="space-y-2">
      <OptionTabs
        id={`${id}-mode`}
        aria-label="Tipo do healthcheck"
        options={MODE_OPTIONS}
        value={value.mode}
        onChange={changeMode}
        className="w-full"
      />
      {value.mode !== "disable" && (
        <>
          {value.mode === "shell" ? (
            <Input
              aria-label="Comando do healthcheck"
              className="font-mono"
              placeholder="curl -fsS http://localhost:3000/api/health || exit 1"
              value={value.test[0] ?? ""}
              onChange={(event) =>
                onChange({ ...value, test: [event.target.value] })
              }
            />
          ) : (
            <ArgsField
              id={`${id}-test`}
              label="Argumentos do healthcheck"
              value={value.test}
              onChange={(test) => onChange({ ...value, test })}
            />
          )}
          <div className={FORM_GRID}>
            <Input
              aria-label="Intervalo do healthcheck"
              className="font-mono"
              placeholder="intervalo (30s)"
              value={value.interval}
              onChange={(event) =>
                onChange({ ...value, interval: event.target.value })
              }
            />
            <Input
              aria-label="Timeout do healthcheck"
              className="font-mono"
              placeholder="timeout (10s)"
              value={value.timeout}
              onChange={(event) =>
                onChange({ ...value, timeout: event.target.value })
              }
            />
            <Input
              aria-label="Início do healthcheck"
              className="font-mono"
              placeholder="start_period (0s)"
              value={value.startPeriod}
              onChange={(event) =>
                onChange({ ...value, startPeriod: event.target.value })
              }
            />
            <Input
              aria-label="Tentativas do healthcheck"
              className="font-mono"
              inputMode="numeric"
              placeholder="tentativas (3)"
              value={value.retries === null ? "" : String(value.retries)}
              onChange={(event) =>
                onChange({
                  ...value,
                  retries:
                    event.target.value.trim() === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
