# NITE Connect — Reuniões: auditoria, Graph e contratos propostos

**Etapa:** 1 — auditoria e viabilidade, para revisão antes da implementação

**Data:** 02/11/2026

**Estado:** proposta técnica; nenhuma integração Microsoft foi executada ou homologada no tenant UniJorge.

## Resumo executivo

**Parecer:** viável com dependências institucionais. Recomendo avaliar, em prova técnica no tenant, eventos do calendário Outlook com `isOnlineMeeting=true` e `onlineMeetingProvider="teamsForBusiness"` para **Iniciar agora** e **Agendar**. Essa escolha dá um único modelo externo para convites, respostas do calendário, edição, cancelamento e futura visão de Calendário. A permissão Graph inicial é delegada ao organizador: `Calendars.ReadWrite`. Ela opera no calendário desse usuário, não é limitada a um evento específico e concede leitura/escrita de calendário enquanto a permissão estiver consentida.

Para **Iniciar agora**, o evento começa no instante atual. O Graph ainda exige um horário final; por isso, o contrato propõe exigir `plannedDurationMinutes` também nesse fluxo. Não se deve inventar uma duração padrão. Se o produto não quiser perguntar duração, precisa aprovar explicitamente um valor previsto padrão.

O backend atual não possui token Graph, OBO, permissões Graph consentidas, adaptador Graph, reuniões ou notificações internas entregues. A arquitetura Entra é compatível com OBO, mas o backend hoje é somente Resource Server e não tem credencial de cliente confidencial para trocar o bearer da API por token delegado do Graph. A UniJorge precisa aprovar e provisionar esse fluxo, a permissão Graph e a capacidade Teams/Outlook do tenant.

Relatórios de presença e tempos individuais são viáveis de modo **condicionado**. Exigem permissões delegadas adicionais, disponibilidade do relatório no Teams, associação confiável da identidade reportada ao integrante e uma decisão institucional sobre acesso e retenção dos dados. Duração prevista e duração real devem continuar campos separados.

## 1. Base e limites da auditoria

Foram lidos a especificação funcional consolidada, os contratos de autenticação, os domínios de Agenda/Frequência/identidade/integrantes e acadêmico, as migrações Flyway e a navegação autenticada. A especificação consolidada indica que aprovação funcional não substitui homologação institucional; a decisão deste documento também não concede consentimento Graph nem valida licenças do tenant.

As afirmações abaixo distinguem:

- **Verificado no código:** estado observado neste checkout.
- **Documentado pela Microsoft:** capacidade descrita nas páginas Graph v1.0/Entra consultadas em 02/11/2026.
- **Proposta:** contrato recomendado para implementação futura.
- **Pendente UniJorge:** condição que requer autorização, política ou prova no tenant institucional.

Nenhuma chamada real ao Graph foi feita. Não foram alterados configuração Entra, credenciais, banco, infraestrutura, rotas, código ou migrações. Nenhum teste foi executado, pois esta etapa é de leitura e especificação.

## 2. Diagnóstico do código atual

### Shell e navegação

Em `Meu espaço`, a navegação atual lista **Agenda** como item `development`, sem `href`; não há página funcional de Agenda no shell autenticado. **Frequência** tem rota ativa `/frequencia`. Portanto, a troca futura do rótulo/posição visual pode ser feita quando existir a rota de Reuniões; esta etapa não altera o shell.

Referência: [authenticated-navigation.tsx](../../apps/web/src/components/shell/authenticated-navigation.tsx).

### Agenda e dependências B04/B06

Agenda está implementada no pacote `attendance`, não como módulo isolado de calendário:

- `GET/POST/PATCH /api/v1/agenda/events`, leitura e comandos de participantes, sessão, fechamento e cancelamento ficam em [AgendaController.java](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/api/AgendaController.java) e [AgendaService.java](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/AgendaService.java).
- `AgendaService.create`, `update`, `close` e `participants` exigem administrador. O endpoint de sessão legado responde `410 LEGACY_SESSION_DISABLED`. Não reutilizar essa autorização para Reuniões: o escopo aprovado permite que qualquer integrante ativo organize a própria reunião.
- A migração [V5](../../apps/api/src/main/resources/Migrations/V5__agenda_attendance_work_logs.sql) criou `calendar_events`, `event_participants` e `attendance_records`. A [V22](../../apps/api/src/main/resources/Migrations/V22__frequency_attendance_lists.sql) adicionou `attendance_lists.calendar_event_id` como FK única para `calendar_events` e ligou presença oficial B04 ao evento existente.
- `FrequencyService` e `FrequencyRepository` criam/consultam eventos e encaminham o cancelamento de um evento vinculado a uma lista de frequência. Não excluir ou reaproveitar essas tabelas para reuniões Teams.
- `AttendanceAcademicReader` é contrato de leitura consumido por `AcademicEvidenceService` no B06. Ele lê presença B04, verifica autorização e emite evidência acadêmica dessa origem; não deve receber presença Teams. A especificação consolidada também mantém frequência e presença como conceitos próprios.
- A web consulta Agenda por meio dos dados de Frequência; a referência do endpoint permanece parte do contrato B04.

**Conclusão:** manter `calendar_events`, `/api/v1/agenda/**`, `/api/v1/me/agenda/**`, listas B04 e leitores B06. Reuniões precisa de agregado e rotas próprios. O futuro Calendário pode compor leituras dos domínios por contratos sem fundir os registros.

### Identidade, autorização e integrantes

O frontend usa Microsoft Entra via Auth.js; o bearer é guardado no JWE servidor e `getAuthenticatedNiteSession()` só o lê no servidor. A API valida token destinado à própria API e resolve `(tid, oid)` para integrante via `IdentityDirectory`. O backend reavalia vínculo/estado; claims de papel no token não concedem autorização operacional.

Os estados de integrante incluem `ATIVO`, `AFASTADO` e `DESLIGADO`; endpoints operacionais usam `AccessService.requireActive`. O contrato deve exigir organizador ativo e convidados ativos ao criar/alterar a reunião. O organizador vem da identidade autenticada, nunca de um `organizerId` arbitrário no corpo.

`MemberDirectory` já é uma fronteira explícita para leituras de integrantes e a regra de projeto proíbe consulta cruzada indiscriminada a tabelas. Reuniões deve pedir ao módulo `members` um contrato de busca por nome que devolva apenas `id` e `name` ao cliente. E-mail institucional fica no backend para criar convidados do evento Graph. Não abrir o endpoint administrativo `/api/v1/members` para integrantes comuns nem acoplar Reuniões à consulta específica de participantes de projetos.

### Graph e autenticação atual

O scope atual do cliente web é `openid profile email offline_access` mais o scope delegado da API NITE. `docs/implementation/auth-web-entra.md` declara expressamente que Graph e `User.Read` não fazem parte da configuração atual; `docs/implementation/bloco-01-api.md` diz que a API valida tokens de acesso à própria API e não usa client secret.

Logo, o bearer disponível na chamada NITE **não é token Graph**. Não pode ser encaminhado diretamente a `graph.microsoft.com`. O OBO é um encaixe arquitetural possível: a API recebe o token destinado a si, troca-o no Entra usando uma credencial de aplicação confidencial e recebe token Graph delegado pelo mesmo usuário. Para isso, o backend precisa de credencial em secret manager/certificado, escopos Graph consentidos e implementação OBO. Esses elementos não existem no código inspecionado.

### Notificações e contratos de API

Não foi localizado serviço, tabela ou API genérica de notificações internas. `AcademicNotificationEvent` é apenas um payload futuro de integração, sem entrega ou caixa de entrada. Reuniões pode começar com notificações persistidas no próprio domínio e endpoints de consulta/leitura; isso não deve ser apresentado como infraestrutura já existente.

Os padrões atuais incluem rotas `/api/v1`, DTOs em vez de entidades HTTP, paginação `{items,page,size,total}`, erros `ProblemDetail`, `expectedVersion`, Flyway append-only, SQL via `JdbcTemplate` e testes de fronteira/integração com PostgreSQL. Não foi localizado arquivo OpenAPI/Swagger versionado. A configuração de `Clock` usa `America/Bahia` por padrão; a apresentação web já formata datas nesse fuso. Persistir instantes em `timestamptz`/UTC e converter para `America/Bahia` na apresentação.

## 3. Viabilidade Microsoft Graph v1.0

| Capacidade | Parecer | Condições e limites |
|---|---|---|
| Criar reunião Teams independente | **Viável** | `POST /me/onlineMeetings`, permissão delegada `OnlineMeetings.ReadWrite`. A reunião é independente do calendário e não aparece no Outlook. |
| Criar evento de calendário Teams | **Viável, condicionado ao tenant** | `POST /me/events` com início, fim, convidados, `isOnlineMeeting=true` e `onlineMeetingProvider="teamsForBusiness"`. Requer `Calendars.ReadWrite` delegado e calendário configurado pelo tenant para reuniões online. |
| Iniciar imediatamente pela API `onlineMeeting` | **Viável** | Cloud communications API documenta reunião independente com início imediato, mas não cria evento de calendário. Exige `OnlineMeetings.ReadWrite` delegado. |
| Iniciar imediatamente pela Calendar API unificada | **Condicionado à prova técnica** | Proposta: criar evento Teams cujo início é o instante atual. A API de calendário exige início e fim, mas não oferece um modo separado chamado “instantâneo”; comportamento joinable imediato precisa ser comprovado no tenant. |
| Agendar, alterar e cancelar | **Viável** | Criar/alterar evento no calendário do organizador; cancelar pela ação `event: cancel`, que envia cancelamento aos convidados. Alterações do organizador devem ser aplicadas no Graph antes de confirmar o estado final no NITE. |
| Resposta Outlook/Teams | **Viável como dado Graph** | Evento expõe estados como `accepted`, `tentativelyAccepted`, `declined` e `none`. Não equivale às respostas internas NITE; primeira versão não deve sincronizar ou mesclar as duas fontes sem reconciliação definida. |
| Link oficial | **Viável** | Evento Teams retorna `onlineMeeting.joinUrl`. Tratar como valor opaco; não analisar nem reconstruir a URL. Expor apenas depois da autorização NITE para organizador/convidado. |
| Relatório de presença e duração individual | **Condicionado** | `attendanceReports` e `attendanceRecords` expõem início/fim, e-mail/identidade, intervalos e `totalAttendanceInSeconds`. Requer permissões próprias e relatório disponível; retenção documentada de um ano. Não suporta channel meetings e não inclui informação de breakout room. |
| Ver se a reunião está ao vivo | **Indisponível no fluxo proposto** | Evento de calendário não informa estado de chamada em tempo real. Horário de início/fim previsto não comprova que a sessão começou/terminou. |
| Criar como usuário sem licença Teams | **Não presumir disponível** | A documentação de papéis de reuniões Teams descreve o organizador como usuário com conta Microsoft 365 e licença Teams. A capacidade real do organizador deve ser verificada no tenant; erro Graph não pode virar reunião confirmada. |
| Convidado sem licença/conta Teams | **Condicionado à política Teams** | É possível entrar pelo navegador sem conta em reuniões configuradas para isso; políticas podem exigir autenticação/verificação e lobby. A autorização NITE não substitui as políticas Teams. |

Documentação oficial: [escolha entre Calendar API e onlineMeeting](https://learn.microsoft.com/en-us/graph/choose-online-meeting-api), [criação de evento](https://learn.microsoft.com/en-us/graph/api/calendar-post-events?view=graph-rest-1.0), [criação de onlineMeeting](https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings?view=graph-rest-1.0), [obtenção de onlineMeeting por `joinWebUrl`](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-get?view=graph-rest-1.0), [relatório de presença](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-get?view=graph-rest-1.0), [attendanceRecord](https://learn.microsoft.com/en-us/graph/api/resources/attendancerecord?view=graph-rest-1.0), [retenção do relatório](https://learn.microsoft.com/en-us/graph/api/resources/meetingattendancereport?view=graph-rest-1.0), [entrar sem conta](https://support.microsoft.com/en-gb/teams/meetings/join-a-meeting-without-an-account-in-microsoft-teams).

### Permissões recomendadas

| Fase | Permissão | Tipo | Uso |
|---|---|---|---|
| Inicial | `Calendars.ReadWrite` | Delegada | Criar, ler, atualizar e cancelar eventos no calendário do organizador autenticado; inclui reunião online do calendário. O escopo não se limita ao evento NITE. |
| Histórico Teams | `OnlineMeetings.Read` | Delegada | Resolver o objeto `onlineMeeting` pelo `joinWebUrl` do evento quando o relatório for implementado. |
| Histórico Teams | `OnlineMeetingArtifact.Read.All` | Delegada | Ler artefatos/relatórios e registros da reunião do usuário organizador. É permissão sensível, mesmo com escopo delegado. |
| Alternativa rejeitada | `OnlineMeetings.ReadWrite.All` | Aplicação | Não solicitar: criação app-only exige também application access policy administrada no tenant. O fluxo delegado do organizador é preferível. |

O catálogo da Microsoft marca `OnlineMeetingArtifact.Read.All` delegado como consentível sem admin em tenants que permitem consentimento de usuário. Esse escopo permite ler artefatos das reuniões do usuário, não apenas as reuniões criadas pelo NITE. Isso **não garante** consentimento no tenant UniJorge: políticas institucionais podem exigir aprovação administrativa. `Calendars.ReadWrite` e qualquer alteração de registro de aplicação/OBO também dependem de validação do time responsável pelo tenant.

## 4. Comparação de abordagens Graph

| Abordagem | Vantagem | Custo/limite | Parecer |
|---|---|---|---|
| Calendário Outlook para ambos os fluxos | Um evento Graph; convites Microsoft, respostas, atualização, cancelamento, link e futura visão Calendário no mesmo agregado. `Calendars.ReadWrite` delegada. | “Agora” ainda exige um fim previsto; o tenant precisa habilitar Teams no calendário e a entrada imediata deve ser provada. | **Recomendada se a prova de “agora” passar**. Menor superfície e melhor compatibilidade futura. |
| `onlineMeeting` independente para agora + evento para agendadas | A reunião independente é naturalmente instantânea e permite configurar participantes. | Duas formas externas, permissões e tratamento de convites diferentes; a reunião imediata não aparece no Outlook. | Alternativa se o produto rejeitar duração prevista para o fluxo imediato. Não é a menor integração. |
| `onlineMeeting` independente para tudo | API direta de reunião com link Teams. | Não cria eventos de calendário; exige implementar agenda/invites/repostas NITE por fora. | Não atende Agendar e Calendário. |

A Microsoft recomenda a Calendar API quando o objetivo é integração direta com Outlook; a API `onlineMeeting` independente documenta explicitamente a possibilidade de início imediato, mas não cria nem atualiza eventos de calendário. Usar evento de calendário com início atual é uma inferência sobre o contrato de evento e deve ser testada. Se o Graph não criar link joinable a tempo, o fallback é manter o mesmo agregado/UX NITE e usar `onlineMeeting` independente somente para o modo imediato, aceitando uma segunda integração Graph.

## 5. Fluxos propostos

### Iniciar agora

1. Cliente envia título, convidados e **duração prevista obrigatória**. O início é escolhido pelo servidor (`Clock.instant()`), não pelo relógio do navegador.
2. API autentica o integrante NITE ativo, valida convidados ativos/únicos e grava operação idempotente pendente.
3. API obtém token Graph delegado via OBO e verifica que o calendário suporta `teamsForBusiness`.
4. API cria evento do organizador, início atual, fim calculado com a duração prevista, convidados e campos Teams.
5. Só confirma `AGENDADA` depois de persistir o `event.id` e o `onlineMeeting.joinUrl` retornados pelo Graph. Se Graph falhar ou o resultado ficar incerto, manter `CRIACAO_PENDENTE` e devolver estado consultável; não mostrar botão de entrada como se houvesse link confirmado.
6. Após a confirmação, persistir convites e notificações internas. O evento Outlook já é a fonte dos convites de calendário; não enviar outro e-mail de convite pelo NITE.

### Agendar

O corpo recebe título, início ISO-8601 com offset e duração prevista. A UI apresenta/aceita horário em `America/Bahia`; backend converte e persiste instantes UTC. Para Graph, enviar os instantes com `timeZone="UTC"` evita depender de conversão entre IANA e os identificadores Windows do Exchange; usuários veem a conversão de acordo com o fuso do cliente Outlook, enquanto o NITE mantém apresentação institucional em `America/Bahia`. A API calcula `plannedEndsAt`, cria evento Teams e salva IDs do evento e link oficial. Atualizações e cancelamento são autorizados somente ao organizador autenticado, com `expectedVersion` local e controle de concorrência do evento Graph. O cancelamento local só passa a confirmado depois da confirmação Graph; o histórico local permanece.

## 6. Contrato de API proposto

Prefixo `/api/v1`, autenticação bearer NITE atual. Autorização é contextual no backend: organizador ou convidado ativo. Para operações externas, OBO representa o mesmo usuário autenticado. Não aceitar `organizerId` nem identidade Teams vindos do corpo.

### Criar reunião

`POST /api/v1/meetings` — exige `Idempotency-Key` único por organizador/operação. Repetir mesma chave e mesmo corpo devolve o mesmo recurso/estado; mesma chave com corpo diferente devolve `409`.

```json
{
  "mode": "IMMEDIATE",
  "title": "Revisão do protótipo",
  "startsAt": null,
  "plannedDurationMinutes": 45,
  "inviteeIds": ["<member-uuid>"]
}
```

Para `mode="SCHEDULED"`, `startsAt` é obrigatório em ISO-8601 com offset e `plannedDurationMinutes` também. Para `IMMEDIATE`, `startsAt` deve ser nulo e o backend usa o instante atual. Os `45` acima apenas exemplificam o formato; não são duração institucional recomendada. Retorno `201` quando o evento e link foram confirmados; `202` com `meetingId`/`operationStatus` quando o resultado Graph está pendente ou incerto. Erros Graph definitivos não criam confirmação local.

Falhas de negócio NITE mantêm `400/403/404/409` e `ProblemDetail` com código estável. Falta de permissão/configuração Graph deve retornar erro de dependência (`503 MEETING_PROVIDER_UNAVAILABLE` ou equivalente aprovado), sem encaminhar o corpo bruto Microsoft. Timeout/5xx sem resultado conclusivo mantém `202`/`RESULTADO_INDETERMINADO`; throttling segue `Retry-After`. Um Graph 403 por política Teams/licença é falha do provedor, não “convite aceito” nem reunião criada.

### Rotas

| Método e caminho | Autorização | Contrato resumido |
|---|---|---|
| `GET /api/v1/meetings/invitees?q=&page=&size=` | Integrante ativo | Busca paginada por nome em integrantes `ATIVO`; resposta contém somente `id` e `name`. |
| `POST /api/v1/meetings` | Integrante ativo | Cria via Graph; idempotência obrigatória; `201` ou `202`. |
| `GET /api/v1/meetings?scope=upcoming\|past&page=&size=` | Organizador ou convidado | Lista apenas reuniões em que o usuário é organizador ou convidado. |
| `GET /api/v1/meetings/{id}` | Organizador ou convidado ativo | Detalhes autorizados, `plannedEndsAt`, estados NITE e do provedor sem misturá-los. |
| `PATCH /api/v1/meetings/{id}` | Organizador ativo | Atualiza título, início, duração prevista e convidados; exige `expectedVersion`; reconcilia Graph. |
| `POST /api/v1/meetings/{id}/cancel` | Organizador ativo | Cancela o evento Graph e envia motivo opcional; só confirma após resposta Graph. |
| `PUT /api/v1/meetings/{id}/my-response` | Convidado ativo | Grava resposta interna `ACEITO` ou `RECUSADO`, com `expectedVersion`. Não altera resposta Outlook. |
| `GET /api/v1/meetings/{id}/join` | Organizador ou convidado ativo | `302/303` para `joinUrl` Graph, `Cache-Control: no-store`; sem URL arbitrária no request. Teams decide lobby e admissão. |
| `GET /api/v1/meetings/{id}/attendance` | Organizador ativo; acesso individual próprio para convidado se aprovado | Consulta snapshot do relatório Graph, ou indica `INDISPONIVEL/PENDENTE`; não estima dados faltantes. |
| `GET /api/v1/me/notifications?page=&size=` | Integrante ativo | Caixa interna do usuário; `POST /api/v1/me/notifications/{id}/read` marca leitura. |

O DTO de reunião deve distinguir `plannedDurationMinutes/plannedEndsAt` de `actualStartsAt/actualEndsAt/actualDurationSeconds`, estes últimos anuláveis e preenchidos somente por relatório Graph disponível ou outra fonte explicitamente identificada.

## 7. Convites, respostas e notificações

### Resposta interna e Outlook

`meeting_invites.internal_status`: `PENDENTE`, `ACEITO`, `RECUSADO`, `REVOGADO` ou `ACESSO_REVOGADO`. `internal_responded_at` registra a resposta NITE. Em campo independente, guardar `calendar_response_status` (`NAO_SINCRONIZADO`, `NONE`, `TENTATIVELY_ACCEPTED`, `ACCEPTED`, `DECLINED`, `NOT_RESPONDED`) e `calendar_response_observed_at`, somente após uma reconciliação Graph efetivamente executada.

Na primeira entrega, resposta NITE é a resposta registrada pelo NITE Connect; resposta Outlook/Teams permanece `NAO_SINCRONIZADO`. Não converter aceitação NITE em resposta Graph, nem afirmar que os estados são iguais.

### Tipos internos

- `CONVITE_RECEBIDO`, `CONVITE_ACEITO`, `CONVITE_RECUSADO`.
- `REUNIAO_ALTERADA`, `REUNIAO_CANCELADA`.
- `HORARIO_DE_INICIO`, `FIM_PREVISTO`.
- `RELATORIO_DE_PRESENCA_DISPONIVEL`.

Graph não informa pelo evento de calendário se a chamada realmente está ao vivo ou se foi encerrada. Assim, os dois tipos baseados no relógio devem ser apresentados como início previsto/fim do horário previsto. “Reunião encerrada” e duração real só aparecem quando o relatório Teams confirma fim/participação; sem relatório, a interface informa que os dados não foram disponibilizados.

Graph envia convite/atualização/cancelamento de calendário aos participantes; notificações NITE ficam na caixa interna e são uma comunicação separada, sem email duplicado. Persistir essas notificações somente após a operação de domínio alcançar o estado correspondente.

### Compartilhamento WhatsApp

Compartilhamento é iniciado pelo usuário, sem integração de envio WhatsApp. Recomendo compartilhar URL NITE autenticada (`/reunioes/{id}/entrar`) que valida se a identidade logada é organizador ou convidado ativo e então redireciona para Teams. Não incluir e-mails, lista de convidados, relatório ou dados pessoais no texto compartilhado. O link Microsoft pode ser encaminhado por terceiros depois de exposto; lobby/verificação são responsabilidade das políticas Teams, não do gate NITE.

## 8. Persistência mínima e resiliência

Criar migrações Flyway novas, sem editar/apagar V1–V23 nem alterar dados históricos B04:

| Tabela proposta | Conteúdo mínimo |
|---|---|
| `meetings` | UUID interno; `organizer_member_id`; título; modo; `starts_at`; `planned_ends_at`; instantes reais opcionais; estado local; `graph_event_id`; `graph_online_meeting_id` opcional; `join_url` protegido; `graph_change_key` opcional; versão; timestamps. |
| `meeting_invites` | reunião, integrante, resposta NITE e instante, estado de acesso, resposta do calendário separada/observada, criação e revogação; unique `(meeting_id, member_id)`. |
| `meeting_provider_operations` | chave idempotente/hash, operação Graph, estado `PENDENTE/CONFIRMADA/FALHOU/RESULTADO_INDETERMINADO`, tentativas, `retry_at`, categoria de erro e correlação; sem token/URL em logs. |
| `meeting_history` | reunião, ator/fonte, ação, versão, snapshot anterior/posterior sem segredo, instante; append-only. |
| `meeting_attendance` | relatório Graph/importação, identidade externa quando disponível e autorizada, `member_id` nullable, duração efetiva opcional, origem e captura. |
| `meeting_attendance_intervals` | intervalos reais com início/fim UTC e segundos, se retornados. |
| `meeting_notifications` | destinatário, reunião, tipo, versão de origem, `created_at`, `read_at`; sem cópia de dados desnecessária. |

Regras:

1. Usar `Idempotency-Key` local e o `transactionId` Graph estável para criação; a Microsoft documenta `transactionId` para evitar POST redundante em retries. Nunca gerar uma nova chave só porque houve timeout.
2. O Graph não participa da transação PostgreSQL. Persistir operação pendente antes da chamada, fazer chamada fora da transação longa, depois gravar referência Graph/histórico/convites/notificações atomicamente. Resultado de rede incerto permanece pendente até retry/reconciliação.
3. Respeitar `Retry-After` em throttling e usar retry limitado para falhas transitórias. Não interpretar timeout, falta de consentimento ou Graph 5xx como sucesso.
4. Atualização/cancelamento guardam uma operação e versão; se Graph aceitou e a gravação local falhou, operação fica recuperável. Não aplicar mutação local antes de Graph confirmar.
5. Não gravar access/refresh token, nem registrar `joinUrl`, e-mails de convidados ou payload bruto de relatório em log. `joinUrl` é dado de acesso sensível e só deve aparecer para ator autorizado.
6. Presença real só vem do relatório Graph. Associar por identificador estável do tenant quando disponível; não casar por nome exibido. Se a identidade não puder ser associada com segurança, preservar como não identificada ou omitir do vínculo individual.
7. O relatório tem retenção Microsoft documentada de um ano; período de retenção da cópia NITE requer decisão de privacidade institucional. Persistir apenas os campos necessários, nunca inventar intervalo/duração ausente.

## 9. Acesso, desativação e coexistência

- Qualquer integrante `ATIVO` pode organizar, convidar integrantes `ATIVO`, responder e acessar reuniões às quais está vinculado. Não criar dashboards separados por papel global.
- Integrante inativo some da busca e não consegue usar endpoints operacionais. Preservar convite/histórico já criado; não apagar registro nem cancelar reunião de forma silenciosa. Acesso futuro ao link NITE é negado. Efeito no convite Outlook e eventual transferência de reunião do organizador inativo exigem decisão institucional; não existe transferência automática presumida.
- Conta sem licença Teams: não confirmar criação até o Graph responder com evento/link válidos. Exibir falha de capacidade do organizador e instrução operacional; não criar reunião só local.
- Convidado sem licença: não negar convite NITE por esse motivo. A entrada pode funcionar como convidado pelo navegador se as políticas Teams permitirem; senão, exibir o resultado/política Microsoft sem simular acesso.
- Reuniões Teams não geram `attendance_records`, listas B04, `participation_periods` ou evidências B06. Não contam como frequência ou horas.
- A navegação pode futuramente mostrar **Reuniões** no Meu espaço; os contratos de Agenda continuam sustentando B04. Um futuro Calendário consome projeções por contrato de Agenda e Reuniões, sem mesclar tabelas ou migrar histórico retroativamente.

## 10. Riscos e decisões para revisão

1. **Duração prevista de reunião imediata:** aprovar que o organizador informe duração prevista para “Iniciar agora” (recomendado), ou definir padrão de produto. O Graph precisa de `end`; não vou assumir valor.
2. **Consentimento e prova do tenant:** equipe UniJorge precisa confirmar calendário com `teamsForBusiness`, licença/caixa do organizador, políticas de usuário consentir e autorização Graph/OBO. Nenhuma dessas capacidades foi validada em produção/teste.
3. **OBO e credencial:** definir aplicação/confidencial client responsável (API preferível), credencial segura e consentimento delegado no Entra. Isso altera documentação atual que explicitamente exclui Graph.
4. **Respostas Outlook:** decidir se primeira fase mostra só resposta NITE ou reconcilia resposta externa. Recomendação inicial: manter fonte externa `NAO_SINCRONIZADO` até existir reconciliação/teste.
5. **Relatórios de presença:** aprovar `OnlineMeetings.Read` + `OnlineMeetingArtifact.Read.All`, política de visualização organizador/convidado, associação de identidade e retenção NITE antes de persistir dados individuais.
6. **Estado ao vivo:** Graph Calendar não fornece sinal em tempo real no contrato proposto. Usar avisos de horário previsto; não apresentar `em andamento`/`encerrada` como fato sem relatório ou declaração de fonte explícita.
7. **Desativação do organizador:** estabelecer procedimento operacional para reuniões futuras vinculadas a conta bloqueada/removida, sem transferir organizador automaticamente.

## 11. Sequência recomendada para implementação do backend

1. Aprovar as decisões acima; obter ambiente/conta de teste institucional e autorização Graph delegada. Validar `allowedOnlineMeetingProviders`, criar evento com início imediato e confirmar que o link permite entrada, além de criar, atualizar, convidar, responder, cancelar e entrar pelo navegador. Incluir organizador sem licença e comportamento de lobby.
2. Definir contrato OpenAPI/documentação e domínio de Reuniões, incluindo estados externos separados, erros Graph e semântica `201/202`.
3. Expor contrato explícito do módulo `members` para busca de integrantes ativos e resolução de e-mail apenas no backend; aplicar `AccessService.requireActive` a organizador/convidados.
4. Criar migrações append-only do módulo `meetings`, chaves únicas/idempotentes, FK e histórico; validar com PostgreSQL/Testcontainers.
5. Implementar OBO no backend e adaptador Calendar Graph v1.0 com token/cache em memória servidor (sem persistir token), preflight do calendário e redaction de dados sensíveis.
6. Implementar criação e reconciliação idempotente; estados pendentes e respostas não confirmadas; depois edição/cancelamento com versão/concorrência.
7. Implementar convites internos/respostas, caixa de notificações e controle de acesso para listagem, detalhe e redirect de entrada Teams.
8. Implementar histórico de presença Teams em fase separada após aprovação das permissões/privacidade; importar apenas relatórios reais e tratar `null`/não identificado.
9. Cobrir autorização, integrante inativo, erro Graph 401/403/429/5xx/timeout, criação duplicada, falha parcial Graph/PostgreSQL, atualização/cancelamento concorrentes, fuso `America/Bahia` e contrato de Agenda/B04/B06. Executar a suíte aplicável antes de declarar o bloco concluído.

## Referências Microsoft e do repositório

- [Choose an API in Microsoft Graph to create and join online meetings](https://learn.microsoft.com/en-us/graph/choose-online-meeting-api)
- [Create event — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/calendar-post-events?view=graph-rest-1.0)
- [Update event — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0)
- [Cancel event — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/event-cancel?view=graph-rest-1.0)
- [Event resource / `transactionId` — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0)
- [Create `onlineMeeting` — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings?view=graph-rest-1.0)
- [Get `onlineMeeting` by `joinWebUrl` — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-get?view=graph-rest-1.0)
- [Get meeting attendance report — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/meetingattendancereport-get?view=graph-rest-1.0)
- [Attendance record — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/resources/attendancerecord?view=graph-rest-1.0)
- [Attendance report retention — Graph v1.0](https://learn.microsoft.com/en-us/graph/api/resources/meetingattendancereport?view=graph-rest-1.0)
- [OBO flow — Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-on-behalf-of-flow)
- [Join without a Teams account](https://support.microsoft.com/en-gb/teams/meetings/join-a-meeting-without-an-account-in-microsoft-teams)
- [Teams meeting roles and organizer license](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/teams-apps-in-meetings)
- [Especificação funcional consolidada](../product/NITE_Connect_Especificacao_Funcional_Consolidada_v1.0.pdf)
- [Autenticação web Entra](../implementation/auth-web-entra.md)
- [Contrato da API B01](../implementation/bloco-01-api.md)
