# Bloco 08.2B — pesquisa e decisão arquitetural

**Estado:** decisão técnica aplicada ao escopo 08.2B; não altera a homologação manual da experiência. A auditoria foi feita no código e nas migrations existentes antes da migration V43.

## Conceitos consultados

| Conceito oficial do Notion | Aplicação no NITE Connect | Limite deliberado |
|---|---|---|
| Bancos de dados como páginas com propriedades | `activity_plannings` representa o espaço de planejamento; `activities` continua representando cada tarefa executável | Sem editor universal de blocos ou bancos configuráveis |
| Projetos e tarefas relacionados | O agrupamento pode ter `projectId`; tarefas mantêm seu próprio ID e `projectId`, compatível com o agrupamento | Uma tarefa pertence a no máximo um agrupamento |
| Subitens e dependências | Tarefas aparecem dentro do agrupamento e em consultas pessoais/de projeto | Sem dependências entre tarefas nem deslocamento automático de datas; exclusão do agrupamento desassocia tarefas, preservando autoria e histórico |
| Propriedades de banco | Título, descrição, situação, prioridade, datas, responsável, colaboradores, projeto e versão | Tipos e valores fixos do contrato NITE; sem fórmulas ou propriedades customizadas |
| Banco de tarefas e sprints | Dados executáveis existentes servem às perspectivas pessoais e de projeto | Sem sprints, ciclos ou velocity |
| Minhas tarefas | Consulta pessoal reúne tarefas criadas ou com atribuição vigente, deduplicadas por `activityId` | Não gera cópias por pessoa; aplica a ACL do projeto antes de contar/paginar |
| Quadros e movimentações | A API mantém mutações versionadas de situação/prioridade; cada resposta retorna o estado efetivo | Sem estado/ordenação mantidos no cliente; sem ordenação manual nesta entrega |
| Views, filtros e ordenação | Reutilizam-se filtros, ordenações e paginação de `/activities`; as tarefas do agrupamento usam o mesmo contrato | Sem armazenar definições arbitrárias de views no servidor |
| Relações e rollups | Indicadores agregados do servidor sobre tarefas relacionadas, com denominadores explícitos | Sem agregações customizadas; conclusão de tarefas não equivale à validação formal de entrega ou progresso físico |

Fontes oficiais: [Introdução a databases](https://www.notion.com/help/intro-to-databases), [projetos e tarefas](https://www.notion.com/help/guides/getting-started-with-projects-and-tasks), [subtarefas e dependências](https://www.notion.com/help/tasks-and-dependencies), [propriedades](https://www.notion.com/help/database-properties), [sprints](https://www.notion.com/help/sprints), [Minhas tarefas](https://www.notion.com/help/guides/give-your-to-dos-a-home-with-task-databases), [quadros](https://www.notion.com/help/boards), [filtros e ordenação](https://www.notion.com/help/views-filters-and-sorts), [relações e agregações](https://www.notion.com/help/relations-and-rollups). Consulta realizada em 17/11/2026.

## Auditoria e escolha

Foram verificados `Activity`, `ActivityService`, `ActivityPolicy`, `ActivityRepository`, `ActivityCapabilities`, rotas e segurança, consultas pessoais/de projeto e regras de saúde do projeto. No banco, V4 define `activities` como executáveis com um executor vigente garantido por constraint trigger, períodos em `activity_assignments`, eventos imutáveis, evidências privadas e chaves de objetos. V40 adiciona início/prioridade. V41 autoriza exclusão definitiva da tarefa por autoria e versão, preserva referências históricas de saúde e sanitiza snapshots de auditoria sob contexto restrito, além de processar objetos privados via outbox após commit. V42 adiciona participação sem alterar atividades. V11 mantém avaliações de saúde com IDs capturados sem FK operacional desde V41. V13 e V5 tinham referências a atividades em contratos de participação/trabalho que V21 removeu ao aposentar esse escopo; não há tabelas operacionais correspondentes hoje. Não foi localizada associação de atividades com documentos da biblioteca nas migrations. `ProjectHealthRepository` consulta tarefas e não define rollup de agrupamentos. Mutações reutilizam transação PostgreSQL, advisory lock compartilhado, versão e ACL centralizada.

**Alternativa escolhida: A — entidade independente de planejamento.** A alternativa B tornaria executáveis existentes também contêineres, exigindo semântica artificial de status, executor e exclusão para pais não executáveis, além de aumentar o risco sobre contratos, triggers e dados legados. V43 cria `activity_plannings` e adiciona `activities.planning_id` anulável com FK restritiva. Nenhuma tarefa antiga é convertida. Projeto do agrupamento é imutável após a criação; a tarefa precisa ter exatamente o mesmo projeto (inclusive ambos independentes), verificado no banco.

Ao excluir um agrupamento, as tarefas não são excluídas. A API as desassocia e avança suas versões dentro da mesma transação, registra evento funcional de desassociação e remove apenas o agrupamento. Ações de tarefa continuam obedecendo à política própria de autoria/permissão; o criador do agrupamento não ganha poder de editar tarefas de terceiros. O lock transacional compartilhado e locks das linhas do agrupamento/tarefas serializam a criação, associação, edição e exclusão na API.

## Autorização aplicada

| Ação | Regra |
|---|---|
| Ler agrupamento independente | Criador ou administrador, integrante ativo |
| Criar/editar agrupamento independente | Criador autenticado/ativo; projeto só pode ser anexado por ator com `ProjectAccess.requireManage` |
| Ler agrupamento de projeto e tarefas | `ProjectAccess.requireRead`; não participante recebe 404 |
| Criar/editar agrupamento de projeto | Gestor vigente do projeto ou administrador, por `ProjectAccess.requireManage` |
| Criar tarefa no agrupamento | Mesma validação de `ActivityService.create`; contexto do projeto vem do agrupamento, executor padrão é o criador; versão do agrupamento é exigida |
| Editar/transicionar/atribuir/excluir tarefa | Política atual de atividades; autoria do agrupamento não amplia capacidade |
| Excluir agrupamento | Criador ativo e versão vigente; se perder acesso ao projeto, só a operação de exclusão/desassociação fica disponível, sem leitura das tarefas/detalhes privados |
| Estatísticas pessoais/de projeto/integrante | Integrante ativo; dados pessoais ACL-filtered antes de agregar; consulta de outro integrante exige papel administrativo global ou `requireRead` no projeto informado |

Tarefas vinculadas precisam compartilhar o `projectId` do agrupamento. A relação FK é `RESTRICT`; nenhuma cascata apaga tarefa, documento, evidência, atribuição ou histórico. Estatísticas de estado usam todos os estados como denominador da distribuição; `completionRate = concluídas / (total - canceladas)`, ou zero se esse denominador for zero. Atraso considera apenas tarefas com prazo anterior à data corrente e status não terminal. `total` inclui tarefas canceladas.

## Contratos HTTP entregues

| Método e rota | Contrato |
|---|---|
| `POST /api/v1/activity-plannings` | Cria com `title`, `description?` e `projectId?`; criador vem da identidade autenticada |
| `GET /api/v1/activity-plannings` | Lista acessível com `projectId?`, `q?`, `page`, `size` |
| `GET /api/v1/activity-plannings/{id}` | Detalhe, versão e capacidades efetivas |
| `GET /api/v1/activity-plannings/{id}/capabilities` | Pode retornar somente `canDelete` e `version` ao criador que perdeu acesso ao projeto, sem abrir detalhes |
| `PATCH /api/v1/activity-plannings/{id}` | Atualização parcial com `expectedVersion`; propriedade ausente é preservada; descrição `null` vira vazia; projeto é imutável |
| `POST /api/v1/activity-plannings/{id}/tasks` | Cria tarefa pelo `ActivityService`; exige `expectedVersion` do planejamento e retorna tarefa/versionamento atualizado |
| `GET /api/v1/activity-plannings/{id}/tasks` | Página de tarefas canônicas com filtros de status, prioridade, executor, datas e ordenação |
| `GET /api/v1/activity-plannings/{id}/stats` | Agregados de todas as tarefas do planejamento |
| `DELETE /api/v1/activity-plannings/{id}` | Exige corpo `{ expectedVersion, confirmed: true }`; desassocia tarefas, apaga só o agrupamento e retorna 204 |
| `GET /api/v1/me/activities/stats` | Agregados pessoais deduplicados e filtrados por ACL |
| `GET /api/v1/projects/{id}/activity-stats` | Agregados de tarefas do projeto, sob `requireRead` |
| `GET /api/v1/members/{memberId}/activity-stats?projectId=...` | Sem projeto exige papel administrativo global; com projeto exige acesso de leitura ao projeto |

`/api/v1/activities`, `/api/v1/me/activities` e `/api/v1/projects/{id}/activities` continuam sendo as consultas canônicas de tarefa e aceitam `planningId?` como filtro opcional. Os registros legados seguem com `planningId: null` e continuam no resultado sem filtro.

## Sequência de implementação

1. Congelar esta decisão e atualizar o contrato 08.0 sem remover decisões anteriores.
2. Criar migration V43 aditiva com a tabela, FK e trigger de compatibilidade de projeto.
3. Implementar contratos/serviços/repositórios, endpoints e matrizes de capacidade, mantendo `/activities` como API canônica de tarefa.
4. Abrir testes de integração PostgreSQL para hierarquia, autorização, versão, desassociação, transições, consultas e métricas; executar `mvnw.cmd verify`.

## Referências históricas identificadas

- `activity_assignments`, `activity_events`, `activity_evidence`, `evidence_objects` e tabelas de outbox pertencem às tarefas e permanecem intactas na exclusão do agrupamento.
- `project_health_evaluation_sources.activity_id` é snapshot independente e não é atualizado ou removido ao excluir agrupamento.
- `audit_events` e o histórico funcional das tarefas não são sanitizados na exclusão de agrupamento; o evento de desassociação documenta a alteração estrutural.
- Não há FK de biblioteca documental a `activities` identificada nas migrations; o contrato documental não é alterado.
