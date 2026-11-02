# Bloco 04 — contratos da Frequência

**Estado:** contratos de backend e superfícies do frontend B04 implementados; homologação real de OAuth/câmera e implantação pública pendentes.
**Base técnica:** controllers, serviços, migrations V22–V23 e testes PostgreSQL 17/Testcontainers.
**Data:** 2026-11-02

## 1. Estado de implementação e limites

Os endpoints deste documento existem no backend B04, salvo os identificados expressamente como dependências de implantação. A API usa autenticação/autorização de servidor, PostgreSQL e migrations Flyway. O frontend integrado está em `apps/web/src/app/(authenticated)/frequencia` e nas rotas `/frequency/scan`, `/frequency/confirm` e `/frequency/lists/[listId]/projector`. A existência do código não comprova homologação real do callback Entra, câmera em dispositivo físico ou infraestrutura pública.

| Capacidade | Estado verificado |
|---|---|
| Agenda, listas, snapshot, QR, confirmação, conclusão/cancelamento, justificativas e consultas B04 | Implementados em controllers/serviços Java, com persistência e trilha. |
| Scan dentro da aplicação para integrante autenticado | Página e integração ZXing implementadas; endpoint canônico chamado em ação de servidor. Permissão e leitura em câmera física não homologadas. |
| Scan externo e handoff | Página, route handler same-origin, cookie HttpOnly, retorno Entra para destino fixo e confirmação POST implementados. Callback OAuth real não homologado neste fluxo. |
| Projeção de QR temporário | Lista abre e emite QR pela API; SVG é renderizado no servidor, renovado próximo à expiração e removido ao detectar rotação/encerramento. Requer `NEXT_PUBLIC_APP_ORIGIN` correto. |
| Autenticação real Entra | O retorno usa sessão/bearer existentes e testes sintéticos; callback e login real ainda não homologados neste fluxo. |
| Rate limiting de ingresso | Não encontrado no código API, Worker Cloudflare versionado ou Compose. Configuração confiável na borda é gate obrigatório antes de exposição pública. |
| Implantação | Worker Cloudflare não implantado; Compose publica API apenas em loopback. WAF/proxy externo não é verificável neste repositório. |

Nenhum endpoint de horas, saldo, revisão ou justificativa do contrato aposentado é exposto pelo B04. O endpoint legado de check-in continua delegado à mesma regra nova, conforme seção 9; clientes externos fora do repositório seguem como pendência operacional. A interface de Frequência não reutiliza o scanner nem as ações antigas de check-out/retorno.

## 2. Convenções consolidadas

- Prefixos pessoais: /api/v1/me/frequency. Administração/coletivo: /api/v1/attendance.
- Rotas de Frequência requerem Entra Bearer, salvo criação do handoff temporário. Resolver identidade por tid/oid no servidor; não aceitar memberId de cliente em confirmação.
- Consultas pessoais nunca recebem parâmetro de identidade. Dados coletivos, lista completa e operações administrativas exigem membro ativo com COORDENADOR ou GESTOR_GERAL.
- Data-filtro from/to é LocalDate inclusivo em America/Bahia; exigir ambos, from <= to. Converter para início local de from e início do dia após to, intervalo semiaberto. Agrupamento mensal é mês civil; semestral é jan–jun e jul–dez.
- Instantes persistidos/retornados são ISO-8601 UTC. Data oficial da frequência vem de attendance_lists.opened_at; confirmação de attendance_records.created_at.
- Percentual usa contagens inteiras e arredondamento HALF_UP a 2 casas. Sem denominador, retorno é null e noEligibleMeetings=true.
- Páginas usam PageResult, size máximo recomendado 100. Ordenar por snapshot sortKey pt-BR, nome e UUID. O filtro não altera a ordenação.
- QR/handoff retornam Cache-Control: no-store. Token não vai em query, log, telemetria ou referer.
- Escritas administrativas usam `expectedVersion`; abertura usa `Idempotency-Key`. Justificativa aceita códigos administrativos padronizados, sem texto livre.

Os contratos funcionais e as telas/ações do frontend de listas, presença, QR, justificativa e consultas estão implementados. Permanecem pendentes: homologação real de câmera e login/callback Microsoft neste fluxo, configuração e teste do limite de ingresso no ambiente público e inventário de consumidores externos do alias legado.

## 3. Permissões

| Operação | Integrante ativo | COORDENADOR | GESTOR_GERAL | Anônimo |
|---|---:|---:|---:|---:|
| Consultar próprio histórico/resumo | Sim, somente a própria identidade | Sim, somente os próprios dados pela rota /me | Sim, somente os próprios dados pela rota /me | Não |
| Abrir/consultar lista, roster completo e relatório coletivo | Não | Sim | Sim | Não |
| Renovar QR, concluir/cancelar lista, corrigir Justificado | Não | Sim | Sim | Não |
| Confirmar própria presença | Sim, se ativo e no snapshot | Sim, se ativo e no snapshot | Sim, se ativo e no snapshot | Não |
| Criar handoff a partir de QR externo | Não aplicável | Não aplicável | Não aplicável | Sim, apenas intenção de uso único; sem presença ou roster |

Perfil/papel é validado no backend em todo comando. UI não concede autorização. Abertura por gestor não cria presença para o gestor; ele confirma por fluxo individual se estiver no roster.

## 4. Listas e acompanhamento coletivo

### Abrir uma lista

Implementado: `POST /api/v1/attendance/lists`, COORDENADOR/GESTOR_GERAL.

Para evento já cadastrado, enviar apenas seu ID. O título da Agenda é copiado para o nome congelado da lista. Para abertura rápida, sem evento prévio, informar nome; o servidor cria evento mínimo e lista na mesma transação.

Exemplo de evento já cadastrado:

~~~http
POST /api/v1/attendance/lists
Authorization: Bearer <access-token>
Idempotency-Key: 9c72d2a9-8132-4d1d-8fc3-16bc148c74ec
Content-Type: application/json
~~~

~~~json
{
  "calendarEventId": "3b07c8db-3a18-49e1-b70e-79e64a5dcaab",
  "confirmationWindowMinutes": 5
}
~~~

Exemplo de reunião excepcional rápida em outra data:

~~~json
{
  "calendarEventId": null,
  "meetingName": "Reunião excepcional de planejamento",
  "confirmationWindowMinutes": 5,
  "countsForFrequency": true
}
~~~

Abertura rápida gera starts_at e opened_at com relógio do servidor, modalidade presencial, evento EXTRAORDINARIO se a data local não for quinta-feira regular, ends_at nulo e status ABERTO. Se a classificação for excepcional, countsForFrequency é obrigatório, verdadeiro ou falso. A classificação regular exige Agenda kind ENCONTRO, modalidade presencial e início local em quinta-feira; para regular, inclusão é automática ao concluir como realizada e não se envia countsForFrequency. Qualquer outra combinação é excepcional e requer a indicação. Evento existente deve estar AGENDADO, dentro do seu intervalo, sem lista e com tempo restante igual ou maior que a janela solicitada; caso contrário responde 409 CONFIRMATION_WINDOW_EXCEEDS_EVENT. Evento cancelado/encerrado/passado não aceita lista. Eventos diferentes na mesma data são aceitos.

meetingName é obrigatório apenas quando calendarEventId é nulo. Para evento existente, usar o título da Agenda como snapshot; não renomear a Agenda ao abrir. Abertura gera roster completo de todos os membros ATIVO no mesmo commit. Não aceitar IDs de participantes no payload.

confirmationWindowMinutes aceita 3, 5 ou 10. O servidor registra openedAt, openedBy e confirmationDeadline=openedAt+minutos. POST de abertura cria evento/lista/snapshot e não emite token; frontend chama imediatamente POST qr/renew com expectedVersion=0 para receber o primeiro QR. O deadline começa na abertura, não na emissão. Retry com mesma Idempotency-Key retorna a mesma lista e não troca token; outra chave para evento que já possui lista retorna 409 LIST_ALREADY_EXISTS.

Exemplo resumido de resposta 201 (ainda sem token):

~~~json
{
  "listId": "ad91a2c0-6a58-4b0a-859e-175f2ab9b214",
  "calendarEventId": "3b07c8db-3a18-49e1-b70e-79e64a5dcaab",
  "meetingName": "Reunião semanal",
  "meetingClassification": "REGULAR",
  "countsForFrequency": true,
  "status": "ABERTA",
  "outcome": null,
  "openedAt": "2026-11-05T21:00:00Z",
  "openedBy": { "memberId": "…", "displayName": "…", "role": "COORDENADOR" },
  "confirmationWindowMinutes": 5,
  "confirmationDeadline": "2026-11-05T21:05:00Z",
  "qr": null,
  "version": 0
}
~~~

O POST subsequente de `qr/renew` emite o primeiro conteúdo QR. Lista/evento ficam criados mesmo se a resposta do token se perder; a gestão consulta a versão e pode solicitar nova emissão, que revoga qualquer emissão anterior. A primeira chamada usa `expectedVersion=0`; cada rotação incrementa a versão. GET nunca devolve token. A tela de projeção renova próximo à expiração, com polling para refletir rotação/encerramento concorrente; a API em si não renova automaticamente.
### Consultar lista, participantes e atualizações

Implementado, gestão somente:

- GET /api/v1/attendance/lists?from&to&status&page=0&size=20: filtra por data local de opened_at, estado e página.
- GET /api/v1/attendance/lists/{listId}: detalhes, nome/classificação, resultado, autor e horários de abertura/conclusão.
- GET /api/v1/attendance/lists/{listId}/participants?status&page=0&size=50: roster snapshot alfabético, incluindo nome, situação e confirmedAt.
- GET /api/v1/attendance/lists/{listId}/updates?afterVersion={version}: mudanças leves para tela de projeção, incluindo versão da lista, estado, qrVersion e qrExpiresAt; nunca contém QR/token. Polling recomendado a cada 3–5 segundos; ao detectar nova versão do QR, a tela limpa imediatamente o código local exibido. Não há canal push atual identificado.

Resposta participante contém memberId, displayName do snapshot, situação, confirmedAt e, quando cabível, changedAt/changedBy/reason mínimo. Não retorna e-mail, claims, endereço ou cadastro adicional. Para lista fora da apuração, a leitura não classifica pessoa como AUSENTE.

### Renovar QR automaticamente

Implementado: `POST /api/v1/attendance/lists/{listId}/qr/renew`, gestão, lista ABERTA e deadline ainda futuro. É a rota de primeira emissão e renovação.

~~~json
{ "expectedVersion": 0 }
~~~

Token aleatório de 32 bytes Base64URL, representado por 43 caracteres sem padding; banco guarda SHA-256. Validade por token é 120 segundos no máximo. Expiração real=min(issuedAt+120s, confirmationDeadline). Cada renovação substitui hash e revoga imediatamente código anterior. Não há mais de um token válido. Se várias telas tentarem renovar a mesma versão, lock e `expectedVersion` permitem uma vencedora; as demais recebem 409 `VERSION_CONFLICT`. A projeção acompanha updates e remove o QR local quando a versão muda. A API não renova automaticamente.

Resposta 200 devolve o novo QR uma única vez e no-store. Prazo global expirado retorna 409 CONFIRMATION_WINDOW_CLOSED; não renova nem reabre a janela. A expiração do QR não finaliza a lista.

### Concluir ou cancelar

Implementado: `POST /api/v1/attendance/lists/{listId}/finalize`.

~~~json
{
  "expectedVersion": 7,
  "outcome": "REALIZADA_CONTABILIZAVEL",
  "reason": "Reunião regular realizada"
}
~~~

Resultado válido: REALIZADA_CONTABILIZAVEL, REALIZADA_NAO_CONTABILIZAVEL ou NAO_REALIZADA. Regular só aceita realizada contabilizável ou não realizada. Excepcional exige countsForFrequency=true para contabilizável, false para realizada não contabilizável; a opção foi fixada na abertura e não pode ser alterada ao finalizar. Em transação, define concluída/closedAt/closedBy, revoga QR/handoffs, preserva PRESENTE/JUSTIFICADO e cria AUSENTE somente para snapshot aguardando se resultado for contabilizável. Resultado não contabilizável/não realizado não gera ausências.

Retry idempotente: para a mesma lista, ator, `expectedVersion`, `outcome` e `reason`, o backend reconhece o evento `LIST_FINALIZED` persistido e retorna a lista atual sem duplicar auditoria, mesmo se a primeira resposta se perdeu após o commit. Resultado, motivo, versão ou identidade diferentes continuam em conflito. Duas solicitações iguais concorrentes produzem uma finalização e um único evento de fechamento.

Implementado: `POST /api/v1/attendance/lists/{listId}/cancel`, antes ou depois da conclusão.

~~~json
{
  "expectedVersion": 7,
  "reason": "Lista aberta por engano ou reunião cancelada",
  "confirmed": true
}
~~~

Após conclusão, confirmed=true é obrigatório. Cancelamento muda reunião/lista para fora da apuração, não apaga attendance_records nem decisões anteriores, registra before/after e recalcula contagens/sinal na próxima leitura. Cancelamento exige expectedVersion e role autorizada. Repetição no estado já cancelado não cria evento duplicado de auditoria.

Para qualquer evento, `POST /api/v1/agenda/events/{id}/session` retorna 410 `LEGACY_SESSION_DISABLED` após validar autenticação e papel. QR de Frequência só emite pela rota da lista. Para evento ligado a lista, Agenda `POST /close` retorna 409 e orienta usar finalize; Agenda `POST /cancel` delega à mesma operação auditada de cancelamento da lista. Para evento sem lista, Agenda ainda permite encerramento/cancelamento sob as regras antigas.

## 5. Confirmação e continuação após login

### Integrante já autenticado

Implementado: `POST /api/v1/me/frequency/confirmations`.

~~~json
{
  "qrToken": "<opaque-token>"
}
~~~

Identidade vem do Bearer Entra; request não aceita `memberId`. O corpo aceita exatamente uma das propriedades `qrToken` ou `handoffId`, nunca ambas. `qrToken` atende o scanner autenticado; `handoffId` atende a continuação externa depois do login. Token malformado é rejeitado na validação do DTO; token sintaticamente válido mas desconhecido/expirado responde 409. Na transação, a API trava primeiro a lista, depois relê/trava o QR ou handoff e revalida estado, prazo e versão. Confirmação revalida vínculo ativo, snapshot e unicidade antes de inserir `attendance_records` e mudar a situação para `PRESENTE`.

Para continuação externa, o payload alternativo é:

~~~json
{ "handoffId": "<opaque-handoff-id>" }
~~~

~~~json
{
  "attendanceId": "e8d7885d-c654-4332-9c96-9cafba06bb88",
  "calendarEventId": "3b07c8db-3a18-49e1-b70e-79e64a5dcaab",
  "listId": "ad91a2c0-6a58-4b0a-859e-175f2ab9b214",
  "status": "PRESENTE",
  "confirmedAt": "2026-11-05T21:00:41Z",
  "alreadyRegistered": false
}
~~~

Se já havia presença própria, repetição responde 200, `alreadyRegistered=true` e o mesmo `attendanceId`/`confirmedAt`, inclusive com QR expirado ou handoff consumido pela mesma identidade. Para manter essa resposta depois do expurgo do registro temporário, a trilha imutável guarda somente o hash do handoff associado à confirmação; o token bruto nunca é persistido. Handoff consumido por outra identidade, membro fora do snapshot ou membro inativo não cria presença. Constraints únicas `(event_id, member_id)` e `(list_id, member_id)` são a última barreira. Nenhuma leitura permite consultar a presença de outra pessoa.

### Câmera externa, handoff e Microsoft

**Status:** API e integração do frontend estão implementadas. O trecho abaixo descreve o comportamento existente no checkout; OAuth/câmera reais ainda requerem homologação em ambiente autorizado.

1. O QR usa `GET /frequency/scan#t=<opaque-token>`. O cliente da rota remove o fragmento imediatamente com `history.replaceState`; fragmento não acompanha a requisição HTTP.
2. A página faz POST same-origin para `POST /api/frequency/qr/handoffs`. O route handler envia `{"qrToken":"<opaque-token>"}` a `POST /api/v1/frequency/qr/handoffs`, sem autenticação. A API valida token vigente e grava intenção de uso único ligada à lista, versão/hash QR e expiração; não grava presença nem revela roster. O handler não repassa `handoffId` ao JavaScript.
3. O route handler grava `__Host-nite-frequency-handoff` (HttpOnly, Secure, SameSite=Lax, Path=/, sem Domain) e responde `no-store`. O cookie mantém o ID opaco por cinco minutos após a expiração para permitir repetição idempotente; o backend ainda nega handoff expirado sem confirmação anterior. O prefixo `__Host-` exige HTTPS. O ID não vai em query, destino OAuth, log, analytics ou referer.
4. `signInWithMicrosoft` consulta o cookie apenas no servidor e escolhe o destino fixo `/frequency/confirm` ou `/dashboard`; não aceita `redirectTo` do cliente.
5. GET `/frequency/confirm` só apresenta contexto e botão. O POST explícito lê o cookie HttpOnly e chama `POST /api/v1/me/frequency/confirmations` com Bearer e `handoffId`. A API consome handoff e registra presença na mesma transação; a ação remove o cookie após resposta conclusiva.
6. QR expirado/rotacionado, lista fechada ou handoff expirado/consumido por outra identidade retorna conflito e exige nova leitura. Uma presença já confirmada pela mesma identidade continua reconhecida pelo backend mesmo após expiração; nenhum GET registra presença.

Respostas/páginas `/frequency/*` e `/api/frequency/*` usam no-store e Referrer-Policy no-referrer. API/proxy/Next não devem logar corpos contendo token/handoff. Handoff curto é vinculado ao navegador pelo cookie, não à identidade antes do login. Compartilhamento remoto da imagem QR continua possível; autenticação, janela/rotação, uso único, snapshot e unicidade limitam abuso sem provar proximidade física.

### Expurgo e contenção do endpoint anônimo

O backend expurga no máximo 500 linhas por execução, com intervalo fixo de uma hora, somente quando `expires_at` é anterior a `agora - 24 horas`. O lote usa `FOR UPDATE SKIP LOCKED`; assim, duas instâncias não removem o mesmo lote e nenhum handoff ainda utilizável é selecionado. O hash necessário para retry idempotente permanece na trilha append-only; o expurgo não remove eventos de auditoria. A V23 adiciona o índice global `(expires_at, handoff_hash)` usado por essa consulta.

Não há rate limiter implementado no backend nem no Worker Cloudflare versionado. Antes da exposição pública, configurar no ingresso confiável que recebe o scan do navegador um limite para `POST /api/v1/frequency/qr/handoffs`, retornar 429/`Retry-After`, usar identidade de origem da borda confiável e impedir bypass direto ao container. Se Next.js chamar a API servidor-servidor, o limite por cliente deve ocorrer antes do BFF, que ainda conhece a origem; limite agregado no IP do BFF não substitui essa proteção. Definir e testar o threshold contra o pico esperado de leitores. A API atual não garante 429 sem essa configuração.

## 6. Justificativa e correção administrativa

Implementado: `PATCH /api/v1/attendance/lists/{listId}/participants/{memberId}`, gestão somente.

~~~json
{
  "expectedVersion": 2,
  "targetStatus": "JUSTIFICADO",
  "reason": "EMAIL_EXTERNO_RECEBIDO"
}
~~~

Enquanto ABERTA, gestão pode mudar AGUARDANDO para JUSTIFICADO. Depois de lista concluída contabilizável, pode corrigir AUSENTE para JUSTIFICADO e, com reason, voltar JUSTIFICADO para AUSENTE. AUSENTE não é atribuído manualmente; só nasce na conclusão. PRESENTE é terminal e não pode ser criado por gestão. Em lista cancelada/não contabilizável não há falta para justificar/corrigir.

`reason` aceita somente `EMAIL_EXTERNO_RECEBIDO` ao atribuir `JUSTIFICADO` e `CORRECAO_ADMINISTRATIVA` ao retornar a situação para `AUSENTE`. O backend persiste e retorna rótulos fixos (“Comunicação externa recebida por e-mail” ou “Correção administrativa”); conteúdo/endereço/anexo da mensagem e observação livre são rejeitados. Cada mudança exige `expectedVersion` e cria evento com before/after, ator, instante e motivo padronizado na mesma transação. Retry de estado idêntico retorna sem novo evento. Justificação mantém reunião no denominador e não altera numerador.

## 7. Consultas pessoal e coletivas

### Pessoal

Implementado:

- GET /api/v1/me/frequency/summary?from=2026-01-01&to=2026-06-30&groupBy=SEMESTER: resumo com intervalo/zona, elegíveis, presenças, justificadas, ausências, percentual e noEligibleMeetings.
- GET /api/v1/me/frequency/history?from&to&page=0&size=20: histórico cronológico, reunião/nome, data local, estado, confirmedAt e marcação LEGADO/fora da apuração.
- groupBy MONTH retorna um bucket por mês civil; SEMESTER retorna Jan–Jun e Jul–Dez.

Exemplo real do record Java `Summary`, com `counts` aninhado:

~~~json
{
  "period": { "from": "2026-01-01", "to": "2026-06-30", "zoneId": "America/Bahia" },
  "counts": {
    "eligibleMeetings": 12,
    "present": 9,
    "justified": 1,
    "unjustifiedAbsences": 2,
    "attendancePercentage": 75.00,
    "noEligibleMeetings": false
  },
  "buckets": [
    {
      "period": { "from": "2026-01-01", "to": "2026-06-30", "zoneId": "America/Bahia" },
      "counts": {
        "eligibleMeetings": 12,
        "present": 9,
        "justified": 1,
        "unjustifiedAbsences": 2,
        "attendancePercentage": 75.00,
        "noEligibleMeetings": false
      }
    }
  ]
}
~~~

Dados são escopados ao membro autenticado. Histórico legado aparece separado e não entra na fórmula.

Limites confirmados na integração do frontend: não existe endpoint pessoal para consultar lista aberta/elegibilidade do integrante; a visão pessoal oferece leitura de QR sem afirmar uma reunião atual apta. O histórico pessoal não expõe estado final/resultado da lista nem motivo específico de `inApuration=false`, então a interface mostra “Fora da apuração” sem inferir cancelamento. A lista de participantes e o resumo coletivo são paginados; participantes não aceitam busca remota por nome. A busca de nomes e as contagens de participantes são explicitamente limitadas à página carregada.

### Coletiva

Implementado, gestão somente:

- GET /api/v1/attendance/frequency/summary?from&to&page=0&size=50: uma linha por membro que conste elegível em pelo menos uma lista do período, ainda que esteja inativo hoje, alfabética, totais/percentual e sinal de três ausências.
- GET /api/v1/attendance/frequency/members/{memberId}/history?from&to&page=0&size=50: histórico coletivo individual autorizado.
- GET /api/v1/attendance/lists/{listId}/participants: lista da reunião, alfabética com integrante, situação e horário de confirmação.

Resumo usa o snapshot para determinar quem entra em cada denominador, não o status atual do membro. Sinal acompanha as três reuniões de origem e é recalculado em toda consulta. Sem e-mail, conteúdo de justificativa ou ranking. Outro papel recebe 403.

## 8. Erros, atomicidade e concorrência

| HTTP | Condição |
|---|---|
| 400 | janela fora de 3/5/10, data/período inválido, falta campo condicional, token QR fora do formato Base64URL de 43 caracteres ou motivo de justificativa fora dos códigos permitidos. |
| 401 | Bearer Entra ausente/inválido em rota autenticada. |
| 403 | vínculo inativo, role sem autorização ou membro não elegível. |
| 404 | lista/evento/membro inexistente ou recurso pessoal que não pode ser revelado. |
| 409 | QR bem formado mas desconhecido/expirado/revogado, handoff expirado/consumido por outra identidade, deadline fechado, janela escolhida não cabe no evento agendado, lista duplicada/estado inválido, versão/parâmetros de finalização conflitantes ou operações concorrentes. Retry do titular retorna 200 `alreadyRegistered=true` quando a própria confirmação foi persistida. |
| 410 | `POST /api/v1/agenda/events/{id}/session` retorna `LEGACY_SESSION_DISABLED`; check-out e retorno retornam `LEGACY_SEGMENT_FLOW_DISABLED`. |
| 429 | Deve ser gerado pelo limitador do ingresso confiável quando implantado. Atualmente não há limitador configurado; exposição pública está bloqueada até configurá-lo e testar o threshold. |

Abertura grava evento/lista/snapshot atomicamente; a primeira emissão do QR é um POST versionado separado. Emissão/rotação/confirmação/finalização/cancelamento e justificativa gravam trilha append-only em suas transações. Finalização correlaciona ator, versão, resultado e motivo com o evento persistido, retornando o estado atual sem duplicar auditoria. Confirmação, criação anônima de handoff e renovação bloqueiam primeiro a linha da lista e depois o QR/handoff necessário; a criação anônima não toma o advisory lock administrativo global. A validação do QR ocorre novamente depois dos bloqueios. Constraints únicas são a última barreira em múltiplas instâncias.

## 9. Migração e compatibilidade

V22 criou as listas, snapshots, handoffs, trilha append-only, corte `activated_at` e suporte a evento rápido com `ends_at` nulo. V23 adicionou o índice global de expiração `(expires_at, handoff_hash)` usado pelo expurgo em lote. V1–V22 permanecem imutáveis; novas evoluções devem ser aditivas.

attendance_records mantém UNIQUE(event_id,member_id), `created_at` e a FK existente; Frequência nova não escreve `attendance_segments`. V22 revogou e limpou os hashes QR antigos de `calendar_events`; as colunas legadas permanecem no esquema, mas não são autoridade nem fonte de validação do QR de Frequência.

### Endpoints legados efetivos e transição

- `POST /api/v1/me/attendance/check-in` continua ativo como alias. `AttendanceService.checkIn` delega a `FrequencyService.confirmLegacy`, que exige QR válido, lista do evento, conta ativa e presença no snapshot; insere pelo mesmo caminho canônico e não cria segmento. `eventId` do corpo é comparado com o evento associado ao QR, portanto não permite contornar elegibilidade, deadline ou unicidade. O alias deve permanecer até inventariar consumidores fora do repositório; o consumidor interno `apps/web/src/lib/attendance/actions.ts` ainda o chama.
- `POST /api/v1/me/attendance/check-out` e `POST /api/v1/me/attendance/{id}/return` retornam HTTP 410 `LEGACY_SEGMENT_FLOW_DISABLED`; não criam/alteram segmentos. Registros/segmentos históricos permanecem legíveis por `/api/v1/me/attendance` e pelo leitor histórico do B06.
- `POST /api/v1/agenda/events/{id}/session` retorna HTTP 410 `LEGACY_SESSION_DISABLED` para qualquer evento após autenticação e checagem do papel de gestão; não abre QR de Agenda.
- `POST /api/v1/agenda/events/{id}/close`: para evento ligado a lista, retorna 409 e exige a finalização da lista; sem lista, continua aplicando as regras de encerramento antigas. `POST /cancel` ligado a lista delega ao cancelamento auditado da Frequência; sem lista, permanece no fluxo antigo.
- Consumidores externos não são verificáveis no repositório. Não remover o alias sem inventário operacional; manter compatibilidade adicional não duplica a implementação de check-in.

### Procedimento para sessões legadas ainda `ABERTO`

V22 revoga QRs antigos, mas não altera automaticamente o estado dos eventos nem cria listas retroativas. Antes da operação B04: (1) consultar eventos `ABERTO` sem `attendance_lists` e confirmar que `qr_hash`/`qr_expires_at` estão nulos; (2) comparar Agenda, `attendance_records` e trilhas existentes com a gestão para decidir se o encontro terminou ou foi cancelado; (3) para cada evento, a gestão usa close ou cancel da Agenda com `expectedVersion`, que grava auditoria; (4) não criar lista retroativa nem inferir presença/frequência pelo status `ABERTO`, pelo QR antigo ou por participantes esperados. O corte de `activated_at` mantém essas presenças como legado e fora dos percentuais.

### Agenda e B06

Evento ligado à lista não pode ser encerrado diretamente sem resultado; close antigo recebe 409, cancel antigo delega ao cancelamento da lista. Toda mudança administrativa usa AccessService/Journaling.

B06 inclui `AcademicStates.Source.ATTENDANCE_CONFIRMATION` e leitura por `attendance_records.id/created_at`. `ATTENDANCE` permanece ligado a `attendance_segments` e continua lendo intervalos históricos. A integração é aditiva e não reinterpreta snapshots.

Dados anteriores ao activated_at são LEGADO apenas. Nunca gerar faltas retroativas por ausência de lista.

## 10. Garantias do contrato implementado e dependências de frontend

- Criação inclui todos os membros ativos, independentemente do papel; identidade por member UUID e unique list/member.
- Evento regular é presencial ENCONTRO de quinta em America/Bahia; excepcional exige boolean countsForFrequency explícito. Sem lista concluída não há ausência ou denominador.
- Identidade do evento canônica por calendarEventId; duplicação no mesmo evento é negada, outro evento no mesmo dia permitido.
- Data/hora, autor, deadline e confirmação são do servidor.
- QR dura até 120s, o anterior é revogado na renovação, e a janela de 3/5/10min não se prolonga. Rotação automática aos 90s depende do frontend.
- API GET não confirma; somente o POST autenticado registra a presença. O frontend implementa handoff em cookie HttpOnly e confirmação explícita; OAuth real e câmera física continuam pendentes de homologação.
- Token expirado/rotacionado sem confirmação anterior exige nova leitura; uma repetição idempotente ainda pode reconhecer presença já registrada pela mesma identidade.
- Confirmar fora do snapshot, conta inativa, papel incorreto em rota coletiva e repetição concorrente resultam em negação/sem duplicidade.
- Cancelamento posterior preserva fatos e trilha, remove a reunião de todos os cálculos e recalcula sinal.
- Datas agrupam por opened_at em America/Bahia; semestres civis; arredondamento HALF_UP 2 casas; denominador zero nulo.
- B06 mantém leitura por segmento e adiciona fonte pontual. Histórico anterior ao activated_at não entra em percentuais.
- Migration tests usam PostgreSQL efêmero, nunca banco institucional.


## 11. Referências de código e testes

Código ativo de referência:

- [AgendaController](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/api/AgendaController.java) e [AttendanceController](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/api/AttendanceController.java).
- [AttendanceContracts](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/api/AttendanceContracts.java), [AgendaService](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/AgendaService.java), [AttendanceService](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/AttendanceService.java), [AttendanceQueries](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/AttendanceQueries.java), [AttendanceRepository](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/infrastructure/AttendanceRepository.java).
- [V5](../../apps/api/src/main/resources/Migrations/V5__agenda_attendance_work_logs.sql), [V21](../../apps/api/src/main/resources/Migrations/V21__remove_retired_participation_scope.sql).
- [FrequencyService](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/FrequencyService.java), [FrequencyRepository](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/infrastructure/FrequencyRepository.java), [V22](../../apps/api/src/main/resources/Migrations/V22__frequency_attendance_lists.sql), [V23](../../apps/api/src/main/resources/Migrations/V23__frequency_handoff_retention_index.sql).
- [AttendanceAcademicReader](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/AttendanceAcademicReader.java), [AcademicStates](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/academic/domain/AcademicStates.java), [contrato B06](bloco-06-contrato.md).
- [AccessService](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/access/application/AccessService.java), [IdentityDirectory](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/identity/application/IdentityDirectory.java).
- [Rota pessoal e gestão](../../apps/web/src/app/(authenticated)/frequencia/page.tsx), [ações server-side](../../apps/web/src/lib/frequency/actions.ts) e [parsers](../../apps/web/src/lib/frequency/contracts.ts): integração de consultas e mutações B04.
- [Scanner ZXing](../../apps/web/src/components/frequency/qr-scanner.tsx), [handoff same-origin](../../apps/web/src/app/api/frequency/qr/handoffs/route.ts), [continuação após login](../../apps/web/src/app/(authenticated)/frequency/confirm/page.tsx), [scan](../../apps/web/src/app/frequency/scan/page.tsx) e [projeção](../../apps/web/src/app/frequency/lists/[listId]/projector/page.tsx): código integrado; câmera física/OAuth real pendentes de homologação.
- [Auth.js action](../../apps/web/src/lib/auth/actions.ts) escolhe destino fixo com base no cookie de handoff HttpOnly, nunca em `redirectTo` fornecido pelo cliente.
- [Scanner/action legados](../../apps/web/src/components/attendance/qr-check-in.tsx) e [actions.ts](../../apps/web/src/lib/attendance/actions.ts): mantidos por compatibilidade, sem uso pela nova página Frequência.

Testes de backend cobrem autorização, idempotência, concorrência, QR/handoff, justificativas, Agenda, B06 e migrações. Testes de frontend cobrem parsers, períodos, consultas pessoais/coletivas, navegação por papel, scanner, mensagens de permissão/câmera ausente e respostas de handoff idempotentes/expiradas. Capturas sintéticas revisam Light/Dark e os breakpoints 320, 360, 768, 1024 e 1440 px. Câmera física, callback OAuth real, rate limiting 429 e acesso direto à origem ainda dependem de homologação/infraestrutura.
