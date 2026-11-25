# Agente Secretário

Agente que lê as mensagens que o dono recebe no WhatsApp (integração `evolution-api`, ver `evolution-api.md`) e,
quando a conversa atende aos critérios, responde **como o próprio dono** (nunca se identifica como assistente).
Tem memórias próprias no Engramind, aprende sozinho e pergunta ao dono o que não sabe (OPE-192).

Configuração: `/integracoes/ia?aba=agente-secretario&secao=<geral|criterios|personalidade|memorias|conversas|avisos>`.
Página de métricas: `/agente-secretario` (Visão geral, Histórico e Memórias).

Código: `src/features/secretary-agent/` — puros: `constants.ts`, `schemas.ts`, `criteria.ts`, `personality.ts`,
`conversation-id.ts`, `split.ts`, `cost.ts`, `limits.ts`, `owner-reply.ts`; servidor em `server/` (`settings`,
`models`, `inbound`, `turn`, `classify`, `media`, `ai`, `owner-questions`, `personality`, `analysis`,
`conversations`, `memory-queue`, `metrics`); telas em `components/`. Rotas em `src/app/api/secretary/**` e
`src/app/api/ai/features/secretary-agent`.

Fora do escopo (refinamento): modo Sugerir, Apresentação, horário de atuação e "pedir decisão".

## Aba Geral

Feature `secretary-agent` em `ai_feature_settings` (`loadFeature`/`persistFeature`, padrões novos por
`withSecretaryDefaults`). O mesmo schema (`secretarySettingsSchema`) valida a tela e a rota.

1. **Provedor e modelo** (`ProviderModelCard`): só `OPEX_PROVIDER_IDS` (inferência por API com ferramentas, sem o
   OpenCode de sessão).
2. **Ligar/desligar**. Ligado exige provedor, modelo e instância.
3. **Instância** do WhatsApp (da integração Evolution API).
4. **Modo** (`OptionTabs`): **Responder** (envia sozinho) ou **Só observar** (aprende e registra, sem enviar nem
   marcar como lida).
5. **Mídia**: **Ler imagens** e **Transcrever áudios**, com **Modelo de mídia** ("Mesmo do agente" ou outro).
   Chave desligada, modelo sem suporte ao tipo (`opexFileDelivery`/`modelFileKinds`) ou erro → marcador
   (`[imagem]`, `[áudio]`, `[documento: nome.pdf]`, `[figurinha]`) e o turno segue.
6. **Comportamento humano**: agrupar mensagens (15 s), atraso aleatório (3 a 10 s), "digitando…", dividir em
   mensagens curtas (`splitMessages`, até 4 partes) e marcar como lida (só ao enviar).
7. **Pausa quando o dono responde pelo celular**: 30 min naquela conversa.
8. **Limites**: 20 respostas por conversa por hora e orçamento diário de US$ 2 (dia de São Paulo).
9. **Preços estimados**: com o agente ligado, todo modelo em uso (principal, mídia, análise) de provedor que não
   informa o custo (fora de `opencode-go` e `command-code`) exige o preço em US$ por 1M de tokens de entrada e
   saída. O custo do passo é o informado pelo provedor ou, sem ele, `estimateCostUsd` pela tabela.

## Critérios (aba Critérios)

`evaluateCriteria(criteria, conversa, assunto)` (pura) devolve `{ decision, rule, reason }`. Precedência
(mostrada na tela): **contato/grupo excluído > assunto "nunca" > assunto "sempre" > inclusões > escopo base**.
O tipo de conversa (individuais/grupos) e o "só quando mencionado" fazem parte da camada do escopo base: uma
inclusão ou um assunto "sempre" passam por cima deles. Em grupo, conta como menção a menção ao número do dono ou a
resposta (citação) a uma mensagem dele (`mentionsOwner`).

- Assunto: a IA classifica (saída estruturada) só quando há critério de assunto preenchido e a conversa não está
  excluída; o tópico curto alimenta "assuntos mais frequentes".
- **Testar critérios** (`POST /api/secretary/criteria/test`): conversa + mensagem (+ "menciona o dono" em grupo),
  com os critérios em edição; mostra "Responderia"/"Não responderia", a regra e o motivo. Não envia nada.
- **Registro de decisões** (`secretary_decisions`, `GET /api/secretary/decisions?jid=`), uma por mensagem
  recebida: respondeu, ignorou, pausado, assunto bloqueado, limite atingido, só observar, perguntou ao dono,
  desligado, agrupada, descartada, erro.
- Seleção de contatos/grupos com foto e busca (`ConversationPicker`).

## Turno

Sem fila nem worker: o webhook chama `handleIncomingMessage` (em `runAfterResponse`).

- Conversa consigo mesmo: nunca é respondida; `fromMe` nela só vale como resposta a pergunta pendente.
- `fromMe` numa conversa comum (com ~3 s de espera e ignorando os ids enviados pelo próprio agente,
  `secretary_sent`) **pausa** a conversa (`pausedUntil`, `lastOwnerMessageAt`).
- Agente desligado ou sem modelo: decisão "desligado".
- Cada mensagem recebida grava um **token novo** e entra na lista pendente; depois da janela, só o turno cujo token
  ainda é o atual responde (os outros ficam como "agrupada").
- Ordem: excluído → pausado → limites (o orçamento esgotado barra também o modo Só observar) → mídia → mensagem
  só de mídia não lida vira "ignorou" → critérios ("assunto bloqueado" fica quieto, não avisa e não marca como
  lida) → contexto (histórico de ~30 mensagens, personalidade base + variante, memórias) → geração.
- **Conferência antes de enviar**: antes de cada parte, confere se o token é o mesmo, se o dono não falou na
  conversa e se ela não foi pausada; se mudou, descarta ("descartada"). Marca como lida só ao enviar a primeira
  parte e só com a opção ligada.
- Erro (Evolution fora, instância desconectada, provedor) → decisão "erro" com a classe do erro no motivo e log
  Pino (`feature: secretary-agent`, instância e conversa, sem texto de mensagem), sem reenvio.
- Grupo com "só quando mencionado": vale a menção ou a citação pelo número do dono ou pelo LID dele
  (`ownerLid`, aprendido das mensagens do dono em grupos; ver `evolution-api.md`).
- Mensagens que o próprio Opex envia (respostas do agente e a mensagem de teste da integração) ficam em
  `secretary_sent` e não pausam a conversa quando voltam como `fromMe`.
- Consumo em `ai_consumption_logs` com origem `secretary-agent` (`secretary-analysis` na análise).

## Perguntar ao dono e aba Avisos

- Quando o modelo não sabe, responde uma frase natural de espera e devolve a pergunta: o agente cria o aviso
  (`secretary_notices`, `question`), envia "❓ <contato>: pergunta + trecho" à conversa do dono consigo mesmo e
  guarda o id da mensagem.
- Resposta do dono (`resolveOwnerReply`): citando a pergunta, vale para ela; sem citação e com uma pendente, vale
  para ela; com várias, o agente pede que cite; sem pendentes, ignora. Também pela aba Avisos.
- Depois: a pergunta fica reservada (`answering`), a IA extrai um fato e escolhe o canal (global ou da conversa) e a
  memória é gravada; só então o aviso vira respondido e mostra onde gravou. Se a inferência ou a gravação falharem,
  a pergunta volta para pendente (o dono responde de novo; resposta reservada há mais de 5 min também pode ser
  refeita). A conversa é retomada depois da resposta (`runAfterResponse`, fora da requisição da aba Avisos), a menos
  que o dono já tenha falado nela depois da pergunta.
- Responder e descartar são auditados (`AgenteSecretario`, sem o texto da resposta). A aba Avisos lista também as
  respostas em andamento; uma presa há mais de 5 min pode ser respondida de novo ou descartada.
- Logs de falha (turno, mídia, análise, perguntas) levam só a classe e o status HTTP do erro (`safeErr`), nunca o
  objeto do erro da SDK de IA, que carrega o prompt, a mídia e a resposta do provedor.
- Pergunta sem prazo; **Descartar** na aba Avisos.
- Limite ou orçamento: aviso com `_id` da janela (`limit:<conversa>:<hora>` / `budget:<dia>`), enviado ao dono
  e listado em Avisos **uma vez por janela**; retoma sozinho na janela seguinte.
- Contador de pendentes na aba (evento `secretary-notices-updated`).

## Personalidade (aba Personalidade)

- Blocos fixos (Identidade; Tom e formalidade; Vocabulário, gírias e expressões; Emojis, risadas e pontuação;
  Tamanho e ritmo; Assuntos, opiniões e posicionamentos; O que nunca faço; Exemplos reais) e blocos extras.
- **Variantes por conversa**: só os blocos que mudam ou complementam a base; o prompt usa a base mais a variante
  (`composePersonality`). Selo "Criada pela análise". Variante de conversa excluída é mantida.
- **Histórico de versões** (`secretary_personality_versions`): cada edição, análise, análise cancelada ou
  restauração gera uma versão com o diff por bloco (`diffPersonality`); **Restaurar** gera uma versão nova. A
  gravação confere a versão lida (409 se mudou).
- **Analisar minhas conversas** (`secretary_analyses`): todas (`findChats`) ou escolhidas, período padrão 6 meses.
  Uma por vez (índice único parcial em `running`, 409). Conversa por conversa, lê o histórico da Evolution
  (ignorando o que o próprio agente enviou), com foco no que o dono escreveu; a IA devolve os blocos e a variante
  e usa a ferramenta `report_progress` para as descobertas. Progresso persistido e publicado
  (`secretary-analysis-updated`): anel "N de M conversas lidas", mensagens, conversa atual, fase (lendo,
  comparando, escrevendo), tempo estimado, custo, estado de cada conversa (na fila, lendo, lida, sem conteúdo
  útil) e descobertas. O trabalho é feito num rascunho: concluída vira a personalidade atual (versão "Análise");
  **Cancelar** guarda o rascunho na versão "Análise cancelada" (restaurável, não aplicada). Batimento a cada 15 s;
  sem batimento por 90 s a análise vira "Interrompida". Sem teto de custo; não conta no orçamento diário.
  Falha numa conversa (Evolution, modelo) marca só essa conversa como "Não foi lida (erro)" e a análise segue. Se a
  personalidade for editada durante a análise (conflito de versão) ou houver erro fatal, o que já foi aprendido fica
  na versão "Análise não aplicada" (restaurável, não aplicada) e a mensagem diz a causa. Iniciar e cancelar são
  auditados com a contagem de conversas.
- **Editor**: uma versão nova (análise, restauração) só substitui a tela sem edição pendente; com edição pendente
  o texto digitado fica, a tela avisa e o Salvar trava até "Recarregar e descartar minhas edições". O próprio
  salvamento vira a versão de referência (sem aviso). O `PUT /api/secretary/personality` leva `expectedVersionId` (a
  versão em que a edição se baseou) e responde 409 `SECRETARY_PERSONALITY_CHANGED` se ela mudou.
  Modelo próprio ("Modelo da análise": o mesmo do agente ou outro).

## Memórias (aba Memórias)

- Engramind: identidade `opex/secretario`, canal global `agentes/secretario/global` e um canal por conversa
  `agentes/secretario/conversas/<id>` (`conversationIdOfJid`: dígitos do contato, `g-<id>` do grupo,
  `lid-<dígitos>`), criado na primeira gravação. Assinatura só `agentes/secretario/*` (não lê as Memórias do Opex).
- Contexto do turno: só o global e o canal da conversa atual.
- Aprendizado autônomo (criar, editar, ativar/desativar) com a chave `secretario` em Memórias autônomas.
- Universo do agente (`AgentUniverseCard`): canais das conversas rotulados pelo nome (número na dica;
  `secretaryChannelLabels`); a foto fica na aba Conversas e nos seletores (decisão do dono no planejamento: a lib
  `@engramind/client` não aceita foto no rótulo do canal; a foto no universo é tarefa separada).
- `?conversa=<id>` (ação "abrir as memórias" da aba Conversas) abre o universo só com o global e o canal daquela
  conversa, com Nova memória já no canal dela (`conversationFocus`), e um botão para voltar a todas.
- Engramind fora do ar: a gravação vai para a fila `engramind_pending_writes` (ver `engramind.md`) e a ferramenta
  devolve `pendente:<chave>`.

## Conversas (aba Conversas)

Lista das conversas com foto e o estado do agente (ativo, pausado até…, excluído, aguardando o dono), virtualizada
acima de 50. Ações: pausar (pelo tempo da pausa configurado), retomar, excluir/remover exclusão dos critérios e
abrir as memórias.

## Tempo real (`private-app`)

`secretary-decision-recorded` (`{ chatId }`), `secretary-conversation-updated` (`{ chatId }`),
`secretary-notices-updated` (`{ pending }`), `secretary-personality-updated` (`{ versionId }`),
`secretary-analysis-updated` (`{ id }`) e `ai-feature-updated` da configuração.

## Coleções

`secretary_conversations`, `secretary_sent`, `secretary_decisions`, `secretary_notices`, `secretary_personality`,
`secretary_personality_versions`, `secretary_analyses`.
