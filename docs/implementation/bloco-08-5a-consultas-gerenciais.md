# Bloco 08.5A — contrato backend de Gestão do NITE: Atividades e Entregas

Implementado em 21/11/2026, sem frontend, sem nova migration e sem fluxo de submissão ou aprovação formal. As consultas são somente leitura e projetam `activities`, `activity_assignments`, `activity_plannings`, `activity_evidence` e o estado atual de `projects` com seus IDs originais.

## Contratos HTTP

| Rota | Uso | Autorização no backend |
|---|---|---|
| `GET /api/v1/management/activities` | Escopo global para coordenação/gestão geral | `AccessService.requireAdministrator`: integrante ativo com `COORDENADOR` ou `GESTOR_GERAL` |
| `GET /api/v1/projects/{projectId}/management/activities` | Escopo de um projeto | `ProjectAccess.requireManage`: integrante ativo e líder vigente do projeto, ou autoridade administrativa global |

Nenhuma das rotas exige participação do gestor geral/coordenador. Ambas exigem JWT autenticado; a lista de rotas foi adicionada ao matcher `authenticatedJwt` em `SecurityConfiguration`, mantendo o modo deny-all do restante da API. As rotas pessoais `/api/v1/me/activities`, `/api/v1/me/projects` e `/api/v1/me/activities/stats` não foram alteradas.

### Parâmetros de consulta

`projectId`, `memberId`, `planningId`, `status`, `priority`, `executorId`, `dueFrom`, `dueTo`, `startFrom`, `startTo`, `overdue`, `q`, `page` e `size`. `page >= 0`, `1 <= size <= 100`, intervalos com início não posterior ao fim, prioridade em `ALTA|MEDIA|BAIXA`, situação em `PLANEJADA|EM_EXECUCAO|CONCLUIDA|CANCELADA` e pesquisa com 2 a 160 caracteres sem controle. `q` é literal e insensível a maiúsculas.

### Resposta

- `items[]`: `activityId`, `title`, `projectId`, `projectTitle`, `projectStatus`, `planningId`, `status`, `priority`, `startOn`, `dueOn`, `createdById`, `primaryExecutorId`, `collaboratorIds`, `linkKinds`, `activeEvidenceCount`, `createdAt`, `completedAt`, `overdue`, `attentionRequired`.
- `linkKinds`: `CREATED`, `EXECUTOR`, `COLLABORATOR`. Quando `memberId` é informado, descreve os vínculos daquele integrante com a tarefa; sem `memberId`, descreve os tipos de vínculo presentes. Cada `activityId` aparece uma única vez; o executor é lido do período vigente canônico.
- `total`, `page`, `size` e `asOfDate` acompanham `summary`, calculado sobre todos os IDs que passaram nos filtros, independentemente da página.
- `activeEvidenceCount` conta registros de `activity_evidence` com `withdrawn_at is null`, sem expor conteúdo, arquivo, URL, autor ou chave de storage. Não existe vínculo canônico `activity ↔ document` no esquema atual, portanto documentos da biblioteca não entram nesta consulta e nenhuma ACL documental é ampliada.

## Critérios dos indicadores

| Indicador | Critério |
|---|---|
| `total` | Quantidade de IDs canônicos distintos após autorização e filtros; canceladas incluídas |
| `planned`, `inProgress`, `completed`, `cancelled` | Contagem por `activities.status` no conjunto filtrado |
| `pending` | `planned + inProgress` |
| `overdue` | `due_on < asOfDate` e situação `PLANEJADA` ou `EM_EXECUCAO` |
| `attentionRequired` | Mesmo critério de `overdue` e projeto independente ou com situação `ATIVO`; projetos `PAUSADO`, `PLANEJAMENTO` e `CONCLUIDO` não pedem ação operacional |
| `withEvidence` | Tarefas com pelo menos uma evidência não retirada |
| `completionDenominator` | `total - cancelled`; zero quando não houver tarefas não canceladas |
| `completionRate` | `completed / completionDenominator` em porcentagem com duas casas; zero quando o denominador é zero |

A data é `LocalDate.now(clock)` no fuso `America/Bahia`, o mesmo `Clock` usado pelas atividades. A consulta de resumo e a página usam o mesmo `WHERE` na mesma transação `readOnly` com isolamento `REPEATABLE_READ`, evitando indicadores de um conjunto diferente da listagem. Conclusão de tarefa não é validação de entrega nem indicador acadêmico.

## Validação executada

Comandos em `apps/api`, com PostgreSQL 17.11 via Testcontainers e 45 migrations aplicadas:

- `.\mvnw.cmd -Dtest=ActivityManagementTest test`: 6 testes aprovados, cobrindo vínculos e evidências sem duplicidade, filtros e resumo, autorização global/líder/gestor sem vínculo, planejamento e projeto pausado consistente com `Minhas Atividades`/`Meus Projetos`, paginação e exclusão permanente.
- `.\mvnw.cmd '-Dtest=ActivityPlanningTest,ActivityAuthorizationTest,ActivitySearchTest' test`: 22 testes aprovados, verificando que os contratos existentes de planejamento, autorização e busca permaneceram válidos após a inclusão da rota em `SecurityConfiguration`.

Estado RED verificado: o primeiro teste novo falhou com 403 porque a rota ainda não estava liberada no matcher de autenticação; após a inclusão da rota e a correção da chamada de liderança, os testes passaram. A primeira tentativa local sem elevação falhou antes de iniciar o contexto por restrição de rede ao resolver o parent POM do Maven; a execução com acesso à rede e ao Docker concluiu normalmente.

## Divergências das consultas analíticas anteriores

`AnalyticsRepository.activities` e `activityDashboardMetrics` filtram por `created_at` do período e identificam o integrante apenas pelo executor vigente (`x.member_id`). Assim, não representam criação, execução e colaboração como vínculos distintos, não deduplicam por `activityId` quando há múltiplos vínculos e não consideram evidências nem projetos pausados. O relatório `ATIVIDADES_ENTREGAS` também limita a origem a 1000 linhas e pagina em memória. A consulta 08.5A é uma projeção operacional separada, com filtros e indicadores no banco; o contrato analítico do Bloco 07 não foi alterado porque isso exigiria decisão de produto sobre o significado histórico dos relatórios.

## Pendências para a interface administrativa

- Escolher entre a visão global e a visão por projeto; o frontend deve enviar `memberId` quando quiser rótulos de vínculo da pessoa selecionada.
- Nenhum campo de “entrega formal” é retornado: fluxo de submissão/revisão depende de contrato funcional específico. A interface deve mostrar conclusão e evidências com os critérios acima.
- A contagem de evidências não autoriza abrir arquivos ou links: a leitura continua exclusivamente nos endpoints `/activities/{id}/evidence...`, com sua ACL própria.
- Paginação e filtros devem ser enviados ao servidor; `summary` já reflete o conjunto filtrado e não deve ser recalculado na interface.
