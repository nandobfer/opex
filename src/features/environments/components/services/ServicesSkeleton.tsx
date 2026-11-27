import { Skeleton } from "@/components/ui/skeleton";
import { SERVICE_ITEM, SERVICE_ITEM_HEADER } from "./ServiceOverrideItem";

/** Itens de carregamento com a caixa e o cabeçalho de um serviço (lendo o compose). */
export function ServicesSkeleton() {
  return (
    <div className="space-y-2" aria-label="Lendo o compose">
      {[0, 1].map((row) => (
        <div key={row} className={SERVICE_ITEM}>
          <div className={SERVICE_ITEM_HEADER}>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      ))}
    </div>
  );
}
