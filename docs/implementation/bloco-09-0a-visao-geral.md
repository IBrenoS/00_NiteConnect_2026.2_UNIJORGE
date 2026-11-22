# Bloco 09.0A — contratos da Visão Geral

## Decisões e plano

Backend aditivo, sem frontend, dependências, migrações ou alteração dos relatórios.
Escolha técnica: projeções SQL pequenas sobre as fontes canônicas em transação
read-only REPEATABLE_READ. Reaproveitar o dashboard antigo manteria a semântica
de criação no intervalo e o vínculo apenas de executor; compor páginas de
listagens carregaria registros desnecessários e prejudicaria a consistência.

Etapas: auditar fontes e ACL; testar rotas e regras; implementar projeções;
validar PostgreSQL e compatibilidade; registrar matriz e limites.

## Auditoria

| Origem | Dados reutilizáveis | Limite da consulta anterior |
|---|---|---|
| Analytics/Dashboard | Datas de criação, eventos e históricos de situação | Dashboard pessoal usa executor e criação no período; dashboards retornam linhas de relatório; relatórios de projetos chamam saúde por projeto. Não reutilizados pelo novo módulo. |
| Atividades e Entregas 08.5A | IDs, vínculos CREATED/EXECUTOR/COLLABORATOR, situação, prioridade, evidências, atraso e atenção | Contrato gerencial paginado não é fila pessoal; conclusão e evidência não homologam entrega. |
| Projetos | Participação vigente, liderança ligada a membership vigente, situação oficial | Participação histórica em um período não concede acesso atual. |
| Saúde | Política vigente e eventos B03 relevantes; regras ProjectHealthRules | Avaliação persistida é snapshot. Nova agregação SQL espelha os limiares, exclui canceladas e classifica não ativos/sem dados como DADOS_INSUFICIENTES. |
| Reuniões | AGENDADA, organizador, convites atuais, início persistido | Falha/criação pendente/aguardando Teams não comprovam compromisso confirmado. Duração planejada não comprova presença. |
| Frequência/Agenda | Eventos agendados com participante esperado; listas abertas | Frequência vigente usa attendance_lists; não contar antigos períodos de trabalho como pendências atuais. |
| Acessos e Convites | Convites válidos pendentes e falhas de envio; last_access_at | Último acesso não é série de acessos, produtividade nem pendência de aprovação. Não exposto. |

## HTTP

- GET /api/v1/dashboard/contexts: PERSONAL para todo integrante ativo;
  INSTITUTIONAL adicional para GESTOR_GERAL e COORDENADOR ativos.
- GET /api/v1/dashboard/personal?from=YYYY-MM-DD&to=YYYY-MM-DD
- GET /api/v1/dashboard/institutional?from=YYYY-MM-DD&to=YYYY-MM-DD

Não existe contexto de projeto. Datas obrigatórias, ordenadas, no máximo 366
dias inclusivos. Intervalos convertidos pelo Clock da aplicação para
[início de from, início do dia posterior a to). Resposta informa timeZone,
generatedAt e asOfDate. Rotas legadas permanecem compatíveis; a página /dashboard
ainda usa os contratos antigos até a etapa de frontend.

## Matriz dos indicadores

P = pessoal: criador ou atribuição vigente, com ACL atual de leitura. Projeto
exige participação vigente ou autoridade global; tarefa independente exige
vínculo pessoal. I = institucional, apenas autoridade global ativa.
CP = projetos de participação vigente do ator, mesmo quando administrador.

| Indicador | Finalidade e fonte | Fórmula | Período | Autorização |
|---|---|---|---|---|
| current.activities.total | Distribuição canônica de activities | count por ID, sem JOIN de múltiplos vínculos | Situação atual | P / I |
| planned/inProgress/completed/cancelled | Situações reais | count por status | Atual | P / I |
| overdue | Prazos vencidos | PLANEJADA ou EM_EXECUCAO e due_on < asOfDate | Atual, inclui pausados | P / I |
| attentionRequired | Atraso operacional | overdue e projeto ATIVO ou independente | Atual | P / I |
| dueSoon | Prazos próximos executáveis | aberta e prazo entre hoje e hoje+7, projeto ativo ou independente | Atual; independe do seletor temporal | P / I |
| current.projects | Distribuição de projects | count agrupado por status | Atual | CP / I |
| current.projectHealth | Saúde agregada | classificação pela política vigente, atraso máximo aberto e dias completos desde último evento relevante de atividade não cancelada | Atual | CP / I |
| risks | Identificar projetos que exigem acompanhamento | total ATENCAO/CRITICO; seis projetos por gravidade, atraso máximo e ID; motivo com sinais e link canônico | Atual | CP / I |
| actions | Trabalho pessoal atribuído | aberta, executor ou colaborador vigente, projeto ativo/independente, start_on ausente ou <= hoje | Atual | Atribuição do ator, inclusive em I |
| actions.items | Priorizar e abrir registro original | seis primeiras: atrasadas, próximas, ALTA/MEDIA/BAIXA/nula, prazo, ID | Atual | Mesmo escopo de actions |
| projects | Contexto, inclusive liderança | total por CP/I, seis destaques com liderança vigente primeiro; openActivities conta abertas do projeto | Atual | CP / I |
| commitments | Compromissos reais próximos | reunião AGENDADA organizada ou convidada PENDENTE/ACEITO, sem recusa de calendário; evento AGENDADO com participante esperado, exceto feriado | Agora até início de hoje+15, exclusivo | Apenas compromissos do ator, inclusive em I |
| evolution | Evolução por dia, origem e evento | criação por activities.created_at uma vez; demais activity_events por occurred_at; project_status_history por occurred_at e new_status | Apenas intervalo selecionado | Atividades P/I e projetos CP/I atuais |
| administrative.pendingProposals | Decisão real pendente | project_proposals.status=PENDENTE | Atual | I |
| administrative.pendingInvitations | Convites válidos | sem aceite/revogação, expires_at>generatedAt, send_state diferente de FAILED | Atual | I |
| administrative.failedInvitations | Acompanhar envio | mesmos critérios, send_state=FAILED | Atual | I |
| administrative.openAttendanceLists | Acompanhar frequência | attendance_lists.status=ABERTA | Atual | I |

Contadores abrangem o conjunto completo. Destaques têm limite fixo seis e total
explícito; sem pesquisa, paginação ou seletor de projeto. Prioridade nula permanece
nula. Tarefas com múltiplos vínculos aparecem uma vez e linkKinds mantém cada
vínculo. Criador sem atribuição acompanha a atividade na distribuição, sem
receber execução imediata. Colaborador pode contribuir; isso não lhe concede
permissão para concluir a tarefa. Links usam os registros originais.

## Evolução, indisponibilidade e limites

Eventos são acontecimentos, não taxa de produtividade. Várias transições da
mesma tarefa contam como eventos distintos. Evolução usa o conjunto atualmente
autorizado; não afirma atribuição histórica ao usuário nem reconstitui estoques
pretéritos. Dias sem eventos são omitidos, não indisponíveis. Tarefas excluídas
permanentemente e seus eventos retirados não podem ser reconstituídos.

unavailable explicita ausência de aprovação formal de entregas, estados históricos
completos e produtividade. Erros de banco continuam erros HTTP; não são
convertidos em zero. Saúde DADOS_INSUFICIENTES preserva desconhecimento, não
equivale a REGULAR. A agregação de saúde deve manter paridade com
ProjectHealthRules ao evoluir o domínio.

As seções de distribuição, evolução, ações, compromissos, projetos contextuais,
saúde e pendências descritas acima têm fontes persistidas. Entregas formalmente
aprovadas e produtividade não podem ser implementadas com estes contratos.
Riscos institucionais disponíveis são atraso operacional, saúde ATENCAO/CRITICO,
falhas de convite e listas abertas; não há cadastro genérico de ocorrências.

Não se presume vínculo reunião-projeto nem equivalência entre calendário e
reunião: não há relação canônica para deduplicar fontes diferentes.

## Dados de teste

Todos os registros persistidos autorizados entram nos totais, incluindo projetos
de homologação. Não há filtro por título, exclusão automática ou inferência de
dados de teste. Recomendação: bancos e ambientes separados; se um ambiente
precisar misturar dados, introduzir classificação explícita auditada em bloco
próprio, com regra documentada de inclusão. Este bloco não altera o esquema.

## Validação executada

PostgreSQL 17.11 real, provisionado por Testcontainers.

- Estado final: `./mvnw.cmd -Dtest=DashboardOverviewTest test`: 14 testes,
  zero falhas/erros. Abrange quatro papéis, inatividade, negação anônima,
  conjunto vazio, tarefas independentes, deduplicação criador/executor,
  colaboração, criador sem atribuição, perda de participação, liderança,
  pausa, prazo próximo, início futuro, destaques limitados com total completo,
  criação/eventos no período e fronteiras de meia-noite, convites com falha,
  compromissos autorizados e paridade da saúde em diferentes atrasos/pausa.
- Regressão anterior que permanece válida:
  `./mvnw.cmd '-Dtest=DashboardOverviewTest,AnalyticsTest,ActivityManagementTest,InstitutionalProjectRoleTest,ProjectHealthRulesTest' test`.
  AnalyticsTest (8), ActivityManagementTest (8), InstitutionalProjectRoleTest (6)
  e ProjectHealthRulesTest (5) passaram. O comando combinado falhou no novo
  dashboard por alias SQL reservado; corrigido e revalidado nos 14 testes finais.
  Os quatro módulos antigos não foram alterados posteriormente e suas 27
  aprovações continuam válidas; não se afirma sucesso do comando combinado.
- `git diff --check`: sem erros de whitespace.
- Frontend, homologação visual, testes de carga e suíte backend completa não
  foram executados; frontend permaneceu intacto. Sem chamadas a provedores externos.
- Limite da cobertura: não foram exercitadas todas as combinações de recusa/
  revogação de convites de reuniões nem todos os limiares de silêncio da saúde.
  Não há medição de desempenho com volume de produção.

Revisão independente identificou falta de identificação dos projetos críticos;
a projeção `risks` passou a devolver os IDs e sinais com limite e ordenação por
gravidade. Sem commit.
