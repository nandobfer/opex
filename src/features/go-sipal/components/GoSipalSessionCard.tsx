"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { KeyRound, Loader2, LogOut, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorState } from "@/components/feedback/ErrorState";
import { fadeUp } from "@/components/motion/presets";
import { apiErrorMessage } from "@/lib/api";
import { cardMotion } from "@/features/integrations/components/detail/draft";
import { useIntegrationTestStream } from "@/features/integrations/hooks/useIntegrationTestStream";
import {
  useCancelGoSipalCode,
  useDisconnectGoSipal,
  useGoSipalSession,
  useGoSipalSessionLive,
  useSendGoSipalCode,
  useVerifyGoSipalCode,
} from "../hooks/useGoSipalSession";
import { GoSipalCodeForm } from "./GoSipalCodeForm";
import { GoSipalSessionInfo } from "./GoSipalSessionInfo";

interface GoSipalSessionCardProps {
  /** Formulário com alterações não salvas: o código usa o e-mail SALVO. */
  dirty: boolean;
}

/**
 * Sessão Go! Sipal: entrar pelo código enviado por e-mail, ver usuário/perfil/expiração,
 * verificar, renovar e desconectar. O JWT nunca chega ao navegador.
 */
export function GoSipalSessionCard({ dirty }: GoSipalSessionCardProps) {
  const query = useGoSipalSession();
  useGoSipalSessionLive();
  const send = useSendGoSipalCode();
  const verify = useVerifyGoSipalCode();
  const cancel = useCancelGoSipalCode();
  const disconnect = useDisconnectGoSipal();
  const test = useIntegrationTestStream("go_sipal", (event) => {
    if (event.type !== "result") return;
    if (event.ok) toast.success(event.message);
    else toast.error(event.message);
    void query.refetch();
  });
  const testing = test.state === "running";
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const session = query.data;
  const connected = session ? session.status !== "disconnected" : false;
  const sendBlock = dirty
    ? "Salve as alterações antes de pedir o código"
    : !session?.email
      ? "Configure e salve o e-mail da integração"
      : null;

  // Sem provider global: cada tooltip traz o seu (padrão do projeto). Sem ele o Radix lança.
  const sendButton = (
    label: string,
    variant: "default" | "outline" = "default",
  ) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={sendBlock ? 0 : undefined}>
            <Button
              type="button"
              size="sm"
              variant={variant}
              onClick={() => send.mutate()}
              disabled={Boolean(sendBlock) || send.isPending}
            >
              {send.isPending ? (
                <Loader2
                  className="mr-1.5 h-3.5 w-3.5 animate-spin"
                  aria-hidden
                />
              ) : (
                <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        {sendBlock && <TooltipContent>{sendBlock}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );

  const view = query.isLoading
    ? "loading"
    : query.isError || !session
      ? "error"
      : session.pending
        ? "code"
        : connected
          ? "connected"
          : "disconnected";

  return (
    <motion.div
      {...cardMotion}
      transition={{ ...cardMotion.transition, delay: 0.05 }}
    >
      <Card>
        <CardHeader className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden /> Sessão Go!
            Sipal
          </CardTitle>
          <CardDescription>
            Entre com o código enviado por e-mail. A sessão vale 28 dias e fica
            cifrada no banco.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-4"
            >
              {view === "loading" && <Skeleton className="h-16 w-full" />}
              {view === "error" && (
                <ErrorState
                  title="Não foi possível carregar a sessão"
                  description={apiErrorMessage(query.error, "Tente novamente.")}
                  onRetry={() => void query.refetch()}
                />
              )}
              {view === "code" && session?.pending && (
                <>
                  {connected && (
                    <p className="text-xs text-muted-foreground">
                      Renovando: a sessão atual continua valendo até o novo
                      código ser confirmado.
                    </p>
                  )}
                  <GoSipalCodeForm
                    pending={session.pending}
                    verifying={verify.isPending}
                    resending={send.isPending}
                    cancelling={cancel.isPending}
                    onVerify={(code) => verify.mutateAsync(code)}
                    onResend={() => send.mutate()}
                    onCancel={() => cancel.mutate()}
                  />
                </>
              )}
              {view === "disconnected" && session && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Desconectado. O código será enviado para{" "}
                    <strong className="text-foreground">
                      {session.email ?? "o e-mail configurado"}
                    </strong>
                    .
                  </p>
                  {sendButton("Enviar código")}
                </div>
              )}
              {view === "connected" && session && (
                <>
                  <GoSipalSessionInfo session={session} />
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setConfirmDisconnect(true)}
                    >
                      <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden />{" "}
                      Desconectar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void test.start()}
                      disabled={testing || session.status === "expired"}
                    >
                      <RefreshCw
                        className={`mr-1.5 h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`}
                        aria-hidden
                      />{" "}
                      Verificar agora
                    </Button>
                    {sendButton(
                      session.status === "connected"
                        ? "Renovar sessão"
                        : "Entrar novamente",
                      session.status === "connected" ? "outline" : "default",
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar do Go! Sipal?</AlertDialogTitle>
            <AlertDialogDescription>
              O token salvo é apagado e tarefas e timers deixam de funcionar até
              você entrar de novo com um código.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => disconnect.mutate()}>
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
