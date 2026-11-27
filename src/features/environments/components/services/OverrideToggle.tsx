"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";

interface Props {
  id: string;
  label: string;
  /** Personalizar ligado: o valor do formulário substitui o do compose. */
  customized: boolean;
  onToggle: (customized: boolean) => void;
  /** Valor do compose (desligado); `null` = não declarado; `undefined` = compose ainda não lido. */
  composeText: string | null | undefined;
  error?: string | null;
  children: ReactNode;
}

/**
 * Um campo do serviço com o interruptor "Personalizar" (OPE-211): desligado, mostra o valor do compose e
 * não escreve nada no override; ligado, o editor do campo substitui o valor do compose por inteiro.
 */
export function OverrideToggle({
  id,
  label,
  customized,
  onToggle,
  composeText,
  error,
  children,
}: Props) {
  return (
    <div
      className="space-y-2 rounded-md border border-border p-3"
      data-field={id}
    >
      <div className="flex items-center justify-between gap-2">
        <span id={`${id}-label`} className="text-xs font-semibold">
          {label}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          Personalizar
          <Switch
            aria-label={`Personalizar ${label}`}
            checked={customized}
            onCheckedChange={onToggle}
          />
        </span>
      </div>
      <AnimatePresence initial={false} mode="wait">
        {customized ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-2"
          >
            {children}
          </motion.div>
        ) : (
          <motion.p
            key="compose"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="break-all font-mono text-xs text-muted-foreground"
          >
            {composeText === undefined
              ? "Do compose: leia o compose para ver o valor."
              : composeText === null
                ? "Do compose: não declarado."
                : `Do compose: ${composeText}`}
          </motion.p>
        )}
      </AnimatePresence>
      {customized && error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
