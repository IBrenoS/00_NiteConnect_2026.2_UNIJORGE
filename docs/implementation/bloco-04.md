# Bloco 04 — Frequência

**Estado:** backend e superfícies do frontend B04 implementados; revisão visual/funcional e homologações de infraestrutura ainda pendentes
**Base técnica:** código Java, migrations V22–V23 e testes PostgreSQL 17/Testcontainers. A homologação real com Microsoft Entra e implantação pública permanecem pendentes.
**Data:** 2026-11-02

## 1. Escopo e decisões aprovadas

A Frequência registra comparecimento por reunião, sem apuração de horas, carga, solicitações, anexos, reposições ou revisão de períodos. Ela terá consulta pessoal e acompanhamento coletivo limitado a `COORDENADOR` e `GESTOR_GERAL`.

A direção funcional recebida para esta especificação determina:

- Uma confirmação de presença por integrante e reunião.
- A confirmação é individual, autenticada e realizada dentro da janela de QR da reunião.
- A gestão abre a lista, define seu nome e escolhe a janela de confirmação entre 3, 5 e 10 minutos. O servidor registra o instante e a autoria.
- Os resultados individuais são `Presente`, `Justificado` e `Ausente`. Enquanto a lista está aberta, a pessoa sem confirmação aparece como `Aguardando registro`.
- Somente a gestão pode atribuir/corrigir `Justificado`, com base em comunicação externa por e-mail. O sistema não armazena cópia da mensagem.
- O percentual é calculado por reunião realizada e considerada; justificativas permanecem no denominador e não entram no numerador.
- As consultas pessoal e coletiva incluem períodos mensais e semestrais. A gestão recebe sinalização discreta quando há três ausências injustificadas consecutivas.
- A lista coletiva é alfabética e exibe integrante, situação e horário de confirmação, além da autoria e dos horários de abertura/encerramento.
- Não haverá ranking, consequência automática, geolocalização, biometria ou fotografia obrigatória.
- A lista inclui todos os membros institucionais ativos no instante de abertura, independentemente de seus papéis; cada membro aparece uma única vez.
- Reunião regular presencial de quinta-feira só entra no denominador quando sua lista oficial é concluída como realizada. Sem lista concluída não há falta nem reunião contabilizada.
- Reunião excepcional em outra data, tipo ou modalidade exige indicação explícita da gestão para entrar na frequência.
- A contagem começa no instante de ativação da nova Frequência. Presenças legadas são preservadas e exibidas separadamente, sem faltas nem percentuais retroativos.

Esta consolidação fixa a elegibilidade por vínculo ativo, a regra de reuniões regulares/excepcionais, o corte prospectivo, o calendário civil em America/Bahia e os efeitos de cancelamentos/correções. Os parâmetros técnicos adotados estão especificados abaixo; não há regra de horas ou obrigação semanal.

## 2. Estado implementado e dependências restantes

### Implementado no backend

- `attendance_lists` e `attendance_list_members` registram uma lista por encontro, a autoria e os horários do servidor, além do snapshot alfabético dos membros ativos.
- Abertura, renovação do QR, confirmação individual, handoff anônimo, conclusão, cancelamento, justificativas, consultas pessoais/coletivas e trilha append-only têm rotas e serviços ativos.
- A confirmação autenticada usa identidade tid/oid, elegibilidade do snapshot, unicidade por integrante/encontro, QR vigente e `attendance_records.created_at`; não cria segmentos de horas.
- QR tem 32 bytes aleatórios Base64URL e TTL máximo de 120 segundos; a janela da lista aceita 3, 5 ou 10 minutos. A API renova de forma explícita/versionada; a tela de projeção renova próximo à expiração e não altera o prazo global.
- Handoff anônimo é temporário, não cria presença nem revela roster, e só é consumido em confirmação autenticada. Expurgo retém os registros por 24 horas após expirar, em lotes concorrentes de até 500.
- Conclusão idempotente é reconhecida pela trilha persistida e não repete mutações/auditoria para o mesmo ator, versão, resultado e motivo.
- B06 mantém evidência por segmentos históricos e adiciona leitura de confirmação pontual; B03 fornece o contrato de membros ativos e B07 não recebe efeitos automáticos de frequência.

### Dependente do frontend ou da implantação

- O scanner de `@zxing/browser` está conectado à confirmação autenticada pelo endpoint canônico; permissão e leitura por câmera física ainda não foram homologadas.
- A leitura externa usa route handler same-origin, cookie `__Host-nite-frequency-handoff` e retorno para uma tela de confirmação explícita. O fluxo de código está implementado; o callback OAuth real não foi homologado.
- Os testes usam identidade JWT sintética. Não comprovam callback real do Microsoft Entra, permissões de câmera do navegador, HTTPS público ou comportamento no domínio institucional.
- Não há rate limiting na API, no Worker Cloudflare versionado nem no Compose local. Antes da exposição, o ingresso confiável que recebe a leitura do navegador deverá limitar `POST /api/v1/frequency/qr/handoffs`, responder 429 e impedir que outro caminho contorne a mesma proteção. Se Next.js chamar a API servidor-servidor, o limite por cliente deve ser aplicado na borda que ainda conhece a origem do navegador; limite agregado no IP do BFF não substitui essa proteção. O número deve ser definido e testado contra o pico de leitores no ambiente de implantação.
- `infra/cloudflare` não tem Worker implantado, e `infra/compose.yaml` publica a API apenas em loopback para desenvolvimento. A configuração real externa de WAF/proxy não é verificável neste repositório.

### Limites de contrato observados na integração frontend

- A API não oferece consulta pessoal de lista aberta nem de elegibilidade para a lista atual. A visão pessoal exibe a ação compacta do scanner, sem afirmar qual reunião está aberta ou se aquela conta está no snapshot.
- `HistoryEntry` não devolve o estado final/resultado da lista nem a causa de `inApuration=false`; a interface mostra “Fora da apuração” e não infere cancelamento.
- A API de participantes não recebe busca por nome. A busca e as contagens exibidas na gestão por reunião se restringem à página carregada; a consulta coletiva de integrantes continua paginada.
- `Summary` retorna `period`, `counts` e `buckets` aninhados. O parser do frontend valida esse record Java; o exemplo contratual anterior com contagens no nível superior foi corrigido.
- O QR da projeção usa a origem pública `NEXT_PUBLIC_APP_ORIGIN`. Em produção deve ser HTTPS, corresponder ao domínio real e estar configurada antes de abrir/renovar listas.

`event_participants` continua representando participantes esperados na Agenda; o roster completo da Frequência vem do snapshot de `attendance_list_members`, não dessa tabela.

## 3. Modelo de domínio e identidade da reunião

calendar_events permanece a identidade canônica da reunião; attendance_lists representa a apuração de frequência, com relação um-para-um à reunião. A sessão de QR é somente um mecanismo temporário de confirmação, não uma reunião nem a conclusão da lista.

- Uma lista possui calendar_event_id único. Repetir a abertura para o mesmo evento não cria outra lista.
- Reuniões distintas no mesmo dia são permitidas porque têm calendar_event_id diferentes. Não usar unicidade por data/nome nem deduplicação aproximada.
- Ao abrir evento já cadastrado na Agenda, o nome da lista é uma fotografia do título do evento. Ao abrir sem evento prévio, a gestão informa meetingName; a transação cria evento mínimo com esse título e copia o nome para a lista.
- Idempotency-Key impede que retries de abertura rápida produzam eventos/listas duplicados. Uma reunião física deve usar um evento canônico da Agenda; IDs diferentes representam reuniões diferentes.

### Classificação para contabilização

Reunião regular é evento ENCONTRO, presencial, cuja data local de início em America/Bahia cai numa quinta-feira. Quando sua lista oficial é concluída como realizada, é contabilizável automaticamente. Evento em outra data, modalidade ou tipo é excepcional; a gestão deve registrar explicitamente countsForFrequency=true ou false na abertura. Sem essa indicação, não se abre lista excepcional. Excepcional só entra no denominador se a gestão indicar true e a lista for concluída como realizada.

Não se cria ocorrência nem falta a partir do calendário semanal. Quinta-feira sem lista oficial concluída não entra no denominador nem gera falta. Evento cancelado ou lista aberta por engano também não conta. ENCERRADO da Agenda não prova que a reunião ocorreu; o resultado explícito da lista é a fonte da contabilidade.

### Fotografia do roster

Na mesma transação da abertura, um contrato do diretório/módulo de membros fornece todos os integrantes com vínculo ATIVO. Papel institucional não é filtro: Coordenador, Gestor Geral e demais papéis ativos entram igualmente. Pessoa com vários papéis continua uma linha de participante, identificada por member_id, não uma linha por papel.

attendance_list_members guarda list_id, FK member_id, nome de exibição congelado, estado ATIVO no snapshot, captured_at e chave estável de ordenação. Restrições: UNIQUE(list_id, member_id), FK para lista e membro sem exclusão em cascata. attendance_records mantém sua restrição única (event_id, member_id); a lista única por evento torna as identidades consistentes. Snapshot e trilha administrativa são imutáveis; alterações posteriores de nome, admissão, desligamento, reativação ou papel não recalculam listas anteriores.

Ordenação alfabética determinística: gerar na abertura sort_key a partir do nome Unicode normalizado NFD, sem marcas diacríticas, minúsculo pt-BR, com espaços externos/duplicados removidos; ordenar por sort_key, nome fotografado e member_id como desempate. A chave e o nome congelados mantêm páginas estáveis após mudança de cadastro. Não copiar e-mail nem outros dados cadastrais desnecessários.

### Abertura, Agenda e horário do servidor

Toda abertura recebe opened_at do relógio do servidor (Instant). Essa data local é a data oficial usada para mês/semestre e para reunião rápida. Evento existente só aceita lista quando estiver AGENDADO, não tiver lista anterior, o instante atual estiver dentro do intervalo agendado e restar tempo suficiente para a janela escolhida completa. Evento cancelado, encerrado ou passado não aceita nova lista; não encurtar a janela selecionada. A criação rápida grava starts_at=opened_at, status=ABERTO e ends_at nulo; closed_at da lista é o fim operacional real. ends_at permanece nulo enquanto o evento rápido está aberto e recebe closed_at na conclusão/cancelamento.

A janela global começa em opened_at e dura exatamente 3, 5 ou 10 minutos escolhidos. Para evento agendado, confirmation_deadline não pode passar de ends_at e abertura é rejeitada se não couber a janela inteira. Evento rápido sem ends_at usa somente a janela escolhida. A janela não se confunde com validade curta de cada token. A Agenda precisa aceitar ends_at nulo somente para evento rápido ainda aberto e atualizar leitores/DTOs que atualmente pressupõem esse valor.

attendance_lists guarda nome da lista, classificação (REGULAR/EXCEPTIONAL), counts_for_frequency, opened_at/by, confirmation_window_minutes, confirmation_deadline, status/resultado, closed_at/by, versão e hash/expiração/versão do QR atual (nulos até a primeira emissão). A emissão inicial e as rotações usam o mesmo endpoint. attendance_list_members guarda o snapshot individual. attendance_records continua sendo a fonte do fato de presença e de created_at; novas presenças não criam segmentos.

## 4. Estados, encerramento e consistência

Estado persistido da lista: ABERTA, CONCLUIDA ou CANCELADA. A janela de confirmação é dimensão temporal: enquanto a lista está aberta, qrWindowState é ATIVA antes de confirmationDeadline e EXPIRADA a partir desse instante. A expiração não conclui lista nem encerra reunião.

~~~mermaid
stateDiagram-v2
    [*] --> ABERTA_ATIVA: criar lista e snapshot
    ABERTA_ATIVA --> ABERTA_EXPIRADA: atingir deadline global
    ABERTA_ATIVA --> CONCLUIDA: gestão finaliza
    ABERTA_EXPIRADA --> CONCLUIDA: gestão finaliza
    ABERTA_ATIVA --> CANCELADA: engano ou reunião cancelada
    ABERTA_EXPIRADA --> CANCELADA: gestão cancela
    CONCLUIDA --> CANCELADA: cancelamento posterior auditado
~~~

ABERTA_ATIVA e ABERTA_EXPIRADA são projeções do mesmo estado persistido ABERTA. Conclusão pode ocorrer com QR ativo ou expirado. Concluir/cancelar revoga token e handoffs; novas confirmações ficam bloqueadas.

Resultado ao concluir:

- REALIZADA_CONTABILIZAVEL: reunião ocorreu e entra no denominador. Permitido para regular; para excepcional, somente se countsForFrequency=true.
- REALIZADA_NAO_CONTABILIZAVEL: reunião excepcional ocorreu, mas a gestão marcou countsForFrequency=false.
- NAO_REALIZADA: reunião não ocorreu; não entra em numerador/denominador.
- Lista aberta por engano é cancelada, não finalizada como realizada.

Reunião regular concluída como realizada conta; não se oferece escolha livre para excluí-la. Excepcional sem indicação explícita nunca é contabilizada. Expiração do QR sozinha nunca seleciona resultado.

Finalização repetida com a mesma lista, identidade, versão esperada, resultado e motivo retorna o estado persistido após o commit, inclusive em retry após perda da resposta. Conflitos de ator, versão, resultado ou motivo continuam rejeitados; a trilha da conclusão não é duplicada.

### Situação individual

Antes da conclusão, participante do snapshot está em AGUARDANDO, PRESENTE ou JUSTIFICADO. Ao concluir como contabilizável, AGUARDANDO vira AUSENTE; PRESENTE e JUSTIFICADO são preservados. Lista cancelada/não contabilizável não gera falta; quem não tem presença/justificativa aparece como FORA_DA_APURACAO, estado derivado da reunião, não uma falta.

~~~mermaid
stateDiagram-v2
    [*] --> AGUARDANDO: membro ativo fotografado
    AGUARDANDO --> PRESENTE: confirmação própria validada
    AGUARDANDO --> JUSTIFICADO: gestão registra comunicação externa
    AGUARDANDO --> AUSENTE: conclusão contabilizável
    AUSENTE --> JUSTIFICADO: correção administrativa
    JUSTIFICADO --> AUSENTE: correção administrativa motivada
    PRESENTE --> [*]: terminal
~~~

PRESENTE só nasce da confirmação individual autenticada, nunca de ação administrativa. Gestão não pode substituir presença validada por ausência/justificativa. Repetição do titular retorna “Presença já registrada”. JUSTIFICADO pode ser atribuído enquanto aberta ou após conclusão; depois de conclusão, gestão pode corrigir AUSENTE↔JUSTIFICADO com versão e trilha. Guardar ator, instante, estado anterior/novo e motivo administrativo mínimo, sem armazenar e-mail. Justificativa não entra no numerador e não remove reunião do denominador.

O motivo enviado pela API é um código fechado: `EMAIL_EXTERNO_RECEBIDO` ao marcar `JUSTIFICADO` e `CORRECAO_ADMINISTRATIVA` ao corrigir para `AUSENTE`. Só rótulos administrativos fixos são persistidos; texto livre, conteúdo da mensagem e detalhes pessoais são rejeitados.

### Cancelamento após confirmação ou conclusão

Cancelar antes da conclusão preserva confirmações/auditoria, mas não gera ausência nem frequência. Se a gestão cancelar depois da conclusão, lista passa a CANCELADA/NAO_REALIZADA; todas as contagens da reunião deixam imediatamente de compor numerador, denominador e sinal de ausências. Presenças e estados anteriores não são apagados: a leitura indica reunião cancelada/fora da apuração e mantém confirmedAt como fato histórico. A mudança tardia exige expectedVersion, motivo, confirmação explícita e trilha imutável.

Check-in, finalização e cancelamento serializam por lock/versão da lista na mesma transação. Se check-in obtiver lock e validar token/prazo primeiro, conclusão verá PRESENTE; se conclusão/cancelamento obtiver lock primeiro, confirmação será rejeitada. Expiração é validada no servidor dentro da transação depois do lock. Resumos são derivados das listas/situações atuais, sem agregado cacheado; correção/cancelamento aparece na próxima consulta.

## 5. Corte histórico e cálculos

Contagem oficial inicia no instante activated_at da nova Frequência, gravado uma única vez no registro de configuração pelo servidor no cutover de produção. Não definir nem inferir data anterior. Eventos antigos não viram listas oficiais por backfill.

Para pessoa m e intervalo local P:

~~~text
reunioesElegiveis(m,P) =
  listas abertas em/apos activated_at,
  concluídas como REALIZADA_CONTABILIZAVEL,
  com opened_at local dentro de P,
  cujo snapshot contém m como ATIVO

presencas(m,P) =
  reuniõesElegiveis em que m tem resultado PRESENTE e attendance_records

percentual(m,P) =
  reunioesElegiveis == 0 ? null : arredondar(100 * presencas / reunioesElegiveis, 2)
~~~

JUSTIFICADO e AUSENTE permanecem no denominador e não são presenças. Excepcional só integra reuniões elegíveis quando foi explicitamente marcada countsForFrequency=true antes da finalização como realizada. Cancelada, não realizada, excepcional não contabilizável e quinta-feira sem lista concluída não entram. Presença legada não entra no numerador.

Períodos civis em America/Bahia:

- Mês: primeiro dia local às 00:00 até primeiro dia do mês seguinte, intervalo [início, fim).
- Semestre 1: 1º de janeiro a 1º de julho; semestre 2: 1º de julho a 1º de janeiro seguinte; ambos [início, fim).
- Filtros from/to são datas locais inclusivas; converter para instantes usando meia-noite de from e meia-noite do dia após to em America/Bahia. Exigir ambos e from <= to.
- Persistir/transportar instantes UTC. Agrupar por attendance_lists.opened_at em America/Bahia; horário de confirmação vem de attendance_records.created_at.
- Somar contagens inteiras e arredondar uma vez para duas casas decimais usando HALF_UP. Denominador zero retorna attendancePercentage nulo e noEligibleMeetings=true, nunca 0%.

Sinal coletivo: verificar, para cada integrante, as três reuniões contabilizáveis mais recentes em que estava no snapshot, independentemente do filtro/período da página. Dispara somente se todas forem AUSENTE. PRESENTE/JUSTIFICADO interrompem a sequência. Reuniões sem lista concluída, canceladas, excepcionais não contabilizáveis ou sem elegibilidade são ignoradas: não geram falta nem interrompem a sequência. Correção de justificativa ou cancelamento recalcula o sinal na leitura seguinte. A gestão vê sinal discreto e as três reuniões de origem, sem ranking/consequência automática.

### Histórico legado

Preservar attendance_records, segmentos e trilhas anteriores ao activated_at. Histórico pessoal pode exibir a presença antiga e created_at como item LEGADO, separado dos percentuais oficiais. Não inferir elegibilidade por event_participants, não gerar faltas e não misturar reuniões antigas aos indicadores. O início prospectivo é regra consolidada, não pendência de reconciliação.

## 6. QR Code e autenticação

### Integrante autenticado no navegador (API e integração frontend implementadas)

A visão pessoal oferece Escanear QR Code, abre leitor ZXing dentro do navegador e envia o token pelo corpo de uma Server Action. A API resolve identidade por Bearer Entra (tid/oid), requer vínculo ativo e presença do membro no snapshot; memberId não é aceito do cliente. Na mesma transação, revalida lista/janela/token, insere attendance_records, define PRESENTE e não cria attendance_segments. A câmera exige HTTPS e permissão; a leitura física não foi homologada.

O servidor impõe UNIQUE(event_id,member_id) e UNIQUE(list_id,member_id). Retry/concorrência do mesmo integrante devolve a confirmação persistida com alreadyRegistered=true; não cria outra linha. confirmedAt usa created_at do servidor.

### QR curto e rotação automática (API e projeção implementadas)

Contrato técnico implementado: token aleatório criptograficamente forte de 32 bytes Base64URL; persistir somente SHA-256, nunca token bruto. Cada token dura no máximo 120 segundos. Janela global da lista dura exatamente 3, 5 ou 10 minutos desde opened_at. A tela de projeção renova próximo à expiração, usando `expectedVersion`, enquanto a janela global estiver ativa. Expiração do token individual é min(issued_at + 120 s, confirmation_deadline). Cada rotação substitui hash e revoga imediatamente token anterior; rotação não amplia deadline. Uma só emissão válida por lista.

A tela usa renovação autenticada com expectedVersion. Se várias telas tentarem renovar a mesma versão, uma vence e as demais recebem conflito, atualizam o estado e limpam eventual QR local; elas não renovam automaticamente. Polling detecta mudança de versão e remove QR antigo. Uma nova emissão exige comando explícito da gestão e invalida imediatamente qualquer código ainda exibido em outra tela. POST de renovação retorna QR/token uma vez com Cache-Control: no-store; GET nunca revela token. Depois do deadline, QR não renova e check-in é recusado, mas lista segue ABERTA para finalização/cancelamento. Fechamento/cancelamento revoga QR e handoffs.

### Fluxo de câmera externa e continuação após login Microsoft (integração implementada; OAuth real pendente)

API e integração frontend estão implementadas. Os passos abaixo descrevem o fluxo no checkout.

O fluxo usa fragmento do QR e cookie efêmero HttpOnly; handoff não passa por query string, cookie JavaScript, referer ou destino arbitrário:

1. QR aponta para `/frequency/scan#t=<token>`. A página lê o fragmento no navegador e o apaga imediatamente com `history.replaceState`; fragmento não é enviado no GET inicial.
2. A página envia token no corpo a endpoint same-origin do Next.js. O route handler chama `POST /api/v1/frequency/qr/handoffs` sem autenticação; API valida QR atual e cria intenção de uso único com hash/versão do QR, lista e expiração, sem registrar presença nem retornar roster.
3. Route handler grava somente handoffId aleatório no cookie `__Host-nite-frequency-handoff`: HttpOnly, Secure, SameSite=Lax, Path=/, sem Domain, Cache-Control: no-store e prazo não maior que o token QR. O prefixo `__Host-` exige Secure e, portanto, HTTPS. ID não é devolvido ao JavaScript nem registrado pela aplicação.
4. `signInWithMicrosoft` lê o cookie no servidor e escolhe somente destino fixo: `/frequency/confirm` se houver handoff válido ou `/dashboard` se não houver. Nunca aceita callback URL de query/body. SameSite=Lax preserva cookie no retorno top-level do login Microsoft.
5. Após OAuth, GET `/frequency/confirm` apenas lê a sessão e mostra aviso de confirmação pendente e botão explícito Confirmar presença; GET não registra presença. POST do botão, por server action, chama API com Bearer autenticado e handoffId. API revalida hash/versão vigente, prazo, identidade Entra ativa, elegibilidade, lista e unicidade. A ação consome handoff e grava presença na mesma transação; repetição pela mesma identidade retorna a confirmação existente. A ação limpa cookie após resposta conclusiva.
6. Se token expirar, rotacionar, for revogado, lista expirar/cancelar ou handoff for consumido por outra identidade antes do POST, responder conflito, limpar cookie e orientar nova leitura. Uma repetição depois de resposta perdida pode usar o ID opaco retido por cinco minutos; o backend devolve presença anterior da mesma identidade ou nega handoff vencido sem confirmação. Validação anônima inicial nunca se transforma em presença futura.

Corpo do POST anônimo e tokens não devem ser registrados por Next.js/API, proxy, analytics ou telemetria; páginas scan/confirm definem Referrer-Policy: no-referrer e respostas no-store. QR compartilhado remotamente pode ser usado por outra conta ativa elegível enquanto válido; autenticação titular, janela curta, rotação, unicidade e auditoria reduzem abuso, mas não provam presença física. Sem geolocalização, biometria ou reconhecimento facial.

### Estado atual da autenticação

`apps/web/src/lib/auth/actions.ts` lê o cookie HttpOnly e escolhe apenas os destinos internos `/frequency/confirm` ou `/dashboard`. Auth.js mantém OAuth state/callback; o ID opaco do handoff permanece em cookie same-site por cinco minutos após sua expiração para permitir repetição idempotente; o backend rejeita handoffs sem confirmação anterior. O handoff só é consumido por POST após a sessão autenticada. O callback real Microsoft continua pendente de homologação.

## 7. Integrações e transição dos contratos atuais

### Agenda

calendar_events é reunião; attendance_lists guarda apuração e attendance_records guarda presença individual. AGENDADO/ABERTO/ENCERRADO/CANCELADO descrevem ciclo da Agenda, não resultado de frequência. Só o resultado explícito da lista define contabilização.

Ao abrir lista, evento existente passa a ABERTO; ao concluir, passa a ENCERRADO; cancelar lista/evento preserva trilha e marca CANCELADO. `POST /api/v1/agenda/events/{id}/session` retorna 410 `LEGACY_SESSION_DISABLED` para qualquer evento após autenticação/autorização. `POST /close` de evento com lista retorna 409 orientando finalização; `POST /cancel` de evento com lista delega ao cancelamento auditado. Eventos sem lista continuam sob as regras existentes de Agenda. PATCH de nome/horário não altera evento depois de aberta uma lista.

QR novo é validado contra a lista, hash e deadline, não por calendar_events.qr_hash/qr_expires_at nem pelo ends_at da Agenda. Agenda POST session é desativado para eventos de Frequência, evitando duas autoridades de QR. Consultas Agenda devem tratar ends_at nulo em evento rápido ainda aberto.

### Transição de check-in, check-out e retorno

O contrato canônico ativo é `POST /api/v1/me/frequency/confirmations`; toda presença exige lista e snapshot. `POST /api/v1/me/attendance/check-in` permanece ativo como alias legado e chama `FrequencyService.confirmLegacy`, que aplica o mesmo QR atual, janela, conta ativa, vínculo ao evento informado, snapshot e unicidade. Sem lista ou elegibilidade, rejeita; não cria segmento. O consumidor interno `apps/web/src/lib/attendance/actions.ts` ainda chama esse alias. Consumidores externos são desconhecidos; removê-lo exige inventário operacional.

`POST /api/v1/me/attendance/check-out` e `POST /api/v1/me/attendance/{id}/return` já retornam HTTP 410 `LEGACY_SEGMENT_FLOW_DISABLED`; não alteram segmentos. `/api/v1/me/attendance` continua read-only para histórico legado; histórico novo está em `/api/v1/me/frequency/history`. Nenhum registro antigo foi removido. O scanner/ação interna ainda requer migração ao endpoint canônico.

### Autenticação e autorização

Consultas pessoais e confirmação exigem Entra Bearer, resolução do membro por tid/oid e vínculo ativo. Todos os membros ativos podem confirmar se constam no snapshot, inclusive gestores/coordenadores; abrir lista não cria presença. Operações coletivas/administrativas exigem COORDENADOR ou GESTOR_GERAL ativo. Anônimo só cria handoff temporário por POST; não lê roster/status, não escolhe memberId e não grava presença.

### B06, B03 e B07

B06 mantém a fonte ATTENDANCE para attendance_segments e já adiciona ATTENDANCE_CONFIRMATION, chaveada por attendance_records.id, lendo reunião, modalidade e created_at. Não criar segmentos artificiais nem alterar snapshots B06 existentes. A extensão é aditiva; leitor/contrato atual segue disponível para evidência por intervalo.

B03/identidade fornece contrato de leitura de membros ativos para o snapshot; B04 não consulta tabelas internas de outro domínio sem interface explícita. B07 não tem agregação ativa de frequência/hora e não recebe faltas, percentuais, rankings ou sanções. attendance_list_events registra autor, instante, antes/depois e motivo das operações da lista; Agenda/attendance_events mantém sua trilha atual.

## 8. Persistência e migração

V22 já implementa listas, snapshot, QR/handoff, trilha append-only, corte `activated_at` e evento rápido com `ends_at` nulo. V23 adiciona o índice `(expires_at, handoff_hash)` para o expurgo global em lotes. V1–V22 não foram alteradas; qualquer evolução futura deve ser aditiva. `attendance_records` mantém a unicidade por evento/membro e a Frequência não escreve `attendance_segments`.

Handoffs são expurgados em lotes concorrentes de até 500, uma vez por hora, somente depois de 24 horas da expiração. A trilha append-only não é removida; ela conserva apenas o hash usado para retry idempotente de uma confirmação já persistida.

Backfill: manter presenças anteriores como LEGADO para consulta; não criar listas/snapshots artificiais, ausências, realização nem percentuais antes de activated_at. O esquema e a fonte B06 atualizada são aditivos.

Para presença nova, attendance_records.created_at é o horário real e não há attendance_segments. ATTENDANCE_CONFIRMATION já lê esse fato; ATTENDANCE continua lendo segmentos históricos. AcademicStates.Source, AcademicEvidenceService, AttendanceAcademicReader e os testes foram estendidos sem reinterpretação de evidência existente.

## 9. Pendências efetivamente bloqueantes

O contrato funcional não tem regra de negócio aguardando decisão. No checkout, as páginas e ações de Frequência, scanner ZXing, handoff protegido e projeção de QR estão implementados. Para uso real ainda faltam: homologar câmera e callback/login Entra em ambiente autorizado; configurar e testar rate limiting confiável para o handoff anônimo antes de qualquer exposição pública; inventariar consumidores externos do alias legado; executar procedimento institucional para eventos legados ainda `ABERTO`; configurar `NEXT_PUBLIC_APP_ORIGIN` corretamente e implantar em HTTPS autorizado.

### Transição de sessões legadas `ABERTO`

V22 revoga os QRs de sessão anteriores, mas não fecha nem classifica automaticamente eventos legados `ABERTO`. Antes da operação B04, gestão/operador deverá listar eventos `ABERTO` sem `attendance_lists`, verificar QR antigo revogado e confrontar Agenda, presenças antigas e trilhas disponíveis. Para cada evento, a gestão confirma encerramento ou cancelamento e usa o endpoint Agenda vigente com `expectedVersion`; não criar lista retroativa, não inferir realização pelo estado e não alterar os fatos históricos. O corte em `activated_at` mantém esses registros fora dos percentuais novos.

## 10. Garantias implementadas e dependências do frontend

- Abertura lista todos os membros ATIVO, sem filtro por papel, uma vez por UUID, com nome/status fotografados e ordenação determinística pt-BR. Inativos/não fotografados não confirmam nem recebem falta.
- Reunião regular (ENCONTRO presencial de quinta-feira local) só conta após lista oficial concluída como realizada; sem lista não há ausência/denominador. Excepcional exige escolha explícita de inclusão.
- Uma lista por evento; eventos distintos na mesma data são válidos. Idempotência impede duplicação de abertura rápida; restrições únicas impedem presença repetida.
- Expiração do QR só encerra a janela de confirmação; a lista permanece aberta até conclusão/cancelamento.
- Cada token dura no máximo 120s; a projeção renova próximo da expiração e detecta rotações/encerramentos em polling, sem prolongar o deadline. A API revoga o token anterior na rotação.
- A confirmação exige POST autenticado e revalidação. O frontend implementa scanner interno e handoff externo HttpOnly com confirmação explícita após o login; OAuth e câmera reais não foram homologados.
- Conclusão contabilizável gera ausência só para snapshot sem presença/justificativa; justificativa não é presença. Gestão não cria presença nem altera presença própria confirmada.
- Cancelamento antes/depois da conclusão preserva trilha/presenças, exclui reunião de todos os cálculos e recalcula o sinal; mutações exigem versão/ator/motivo.
- Histórico antes de activated_at é legado e fica fora dos indicadores. Mês/semestre civis em America/Bahia; percentual HALF_UP em duas casas; denominador zero retorna nulo.
- Três ausências avaliam as três reuniões contabilizáveis elegíveis mais recentes, cruzando meses; listas não contabilizáveis são ignoradas.
- B06 legado continua lendo segmentos; nova fonte pontual lê attendance_records.created_at; snapshots existentes permanecem imutáveis.
- Testes de persistência/migration usam banco efêmero e dados sintéticos, nunca base institucional.

## 11. Referências de código, testes e consumidores

Componentes ativos e limitações:

- [AgendaController](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/api/AgendaController.java) e [AttendanceController](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/api/AttendanceController.java): rotas atuais.
- [AttendanceContracts](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/api/AttendanceContracts.java), [AgendaService](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/AgendaService.java), [AttendanceService](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/AttendanceService.java), [AttendanceQueries](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/AttendanceQueries.java) e [AttendanceRepository](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/infrastructure/AttendanceRepository.java): DTOs, sessão, QR, duplicidade, autorização e consultas.
- [FrequencyService](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/FrequencyService.java), [FrequencyRepository](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/infrastructure/FrequencyRepository.java) e [FrequencyHandoffRetention](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/FrequencyHandoffRetention.java): regras atuais, locks e expurgo.
- [V5](../../apps/api/src/main/resources/Migrations/V5__agenda_attendance_work_logs.sql), [V21](../../apps/api/src/main/resources/Migrations/V21__remove_retired_participation_scope.sql), [V22](../../apps/api/src/main/resources/Migrations/V22__frequency_attendance_lists.sql) e [V23](../../apps/api/src/main/resources/Migrations/V23__frequency_handoff_retention_index.sql): histórico, persistência Frequência e índice do expurgo.
- [AttendanceAcademicReader](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/attendance/application/AttendanceAcademicReader.java), [AcademicStates](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/academic/domain/AcademicStates.java) e [contrato B06](bloco-06-contrato.md): leitor atual de segmentos.
- [AccessService](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/access/application/AccessService.java) e [IdentityDirectory](../../apps/api/src/main/java/br/edu/unijorge/niteconnect/identity/application/IdentityDirectory.java): vínculo e autorização.
- [Frequência pessoal e coletiva](../../apps/web/src/app/(authenticated)/frequencia/page.tsx), [ações server-side](../../apps/web/src/lib/frequency/actions.ts) e [contratos de frontend](../../apps/web/src/lib/frequency/contracts.ts): consultas, mutações, autorização por papel e parsing dos records do backend.
- [Scanner interno](../../apps/web/src/components/frequency/qr-scanner.tsx), [handoff público](../../apps/web/src/app/api/frequency/qr/handoffs/route.ts), [tela de confirmação externa](../../apps/web/src/app/(authenticated)/frequency/confirm/page.tsx) e [projeção](../../apps/web/src/app/frequency/lists/[listId]/projector/page.tsx): fluxos B04 atuais; leitura física e OAuth ainda dependem de homologação.
- [Auth.js sign-in action](../../apps/web/src/lib/auth/actions.ts): usa o cookie HttpOnly server-side e só escolhe destino interno fixo.
- [Scanner legado](../../apps/web/src/components/attendance/qr-check-in.tsx) e [ação legada](../../apps/web/src/lib/attendance/actions.ts): permanecem no código por compatibilidade, mas não são usados pela Frequência nova.

Os testes de backend incluem:

- [FrequencyBoundaryTest](../../apps/api/src/test/java/br/edu/unijorge/niteconnect/FrequencyBoundaryTest.java), [FrequencySummaryTest](../../apps/api/src/test/java/br/edu/unijorge/niteconnect/FrequencySummaryTest.java), [AttendanceTransactionsTest](../../apps/api/src/test/java/br/edu/unijorge/niteconnect/AttendanceTransactionsTest.java), [FrequencyHandoffRetentionTest](../../apps/api/src/test/java/br/edu/unijorge/niteconnect/FrequencyHandoffRetentionTest.java), [AttendanceHistoryIntegrityTest](../../apps/api/src/test/java/br/edu/unijorge/niteconnect/AttendanceHistoryIntegrityTest.java) e [AttendanceAcademicReaderTest](../../apps/api/src/test/java/br/edu/unijorge/niteconnect/AttendanceAcademicReaderTest.java) cobrem contratos, concorrência, migração legada e integrações.
- Testes do frontend cobrem parser de contrato, períodos, consultas pessoais/coletivas, QR same-origin, navegação/papéis, mensagens de erro da câmera e respostas idempotentes/expiradas do handoff. Capturas sintéticas revisam Light/Dark nos breakpoints 320, 360, 768, 1024 e 1440 px. A câmera em dispositivo físico, o fluxo OAuth real e a integração contra API institucional ainda dependem de homologação.
