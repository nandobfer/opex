/** Envio de e-mails (integração SMTP da central `@nandobfer/integracoes`), com o runtime do Opex já configurado. */
import "@/lib/integrations/runtime"

export { getSmtpConfig, isMockMode, sendEmail, verifyConnection } from "@nandobfer/integracoes/smtp/server"
