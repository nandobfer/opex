"use client";

import { Textarea } from "@/components/ui/textarea";

/**
 * `command`/`entrypoint` na forma exec (OPE-211): um argumento por linha. Vazio = o padrão da imagem
 * (`!reset` no override).
 */
export function ArgsField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="space-y-1">
      <Textarea
        id={id}
        aria-label={label}
        spellCheck={false}
        className="min-h-20 w-full resize-y whitespace-pre font-mono text-xs"
        placeholder={"sh\n-c\nnpm start"}
        value={value.join("\n")}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? [] : event.target.value.split("\n"),
          )
        }
      />
      <p className="text-xs text-muted-foreground">
        Um argumento por linha. Vazio = o padrão da imagem.
      </p>
    </div>
  );
}
