# Bloco 08.3R-C3 — homologação final de Minhas Atividades

Data: 18/11/2026. Ambiente: Next.js local em localhost:3000 e API Docker local em localhost:8080, PostgreSQL 17 em nite-connect-db-1.

## Resultado

**Aprovado no ambiente disponível**, com os bloqueios de sessões e projetos explicitados na matriz abaixo. Nenhum cenário terminou com falha funcional conhecida após as correções. Homologação autenticada real não foi substituída por mocks: ela foi executada com a sessão de gestor geral disponível. Casos de outros papéis, projetos e terceiros foram aprovados em integração com PostgreSQL real, permanecendo bloqueados no navegador por falta de contas/projetos locais.

C1/C2 e alterações locais foram preservados. Mantida a main conforme autorização anterior. Sem commit, dependências novas, migrations novas ou mudanças de regras de negócio. Blocos 08.4 e 08.5 não foram iniciados.

## Histórico: causa comprovada e correção

A API e a tabela activity_events permitem motivo opcional: eventos CREATED, UPDATED e STATUS_CHANGED reais tinham reason nulo. O frontend exigia typeof reason === string em parseActivityHistoryEvent. Ao encontrar um desses eventos válidos, parsePage rejeitava a página inteira e o detalhe apresentava “Não foi possível carregar o histórico”. Não era falha de autorização nem ausência dos eventos.

Correção mínima em contracts.ts: ActivityHistoryEvent.reason agora é string | null, e o parser aceita explicitamente string ou null, rejeitando valores malformados. A apresentação existente já omite o parágrafo quando não há motivo. Nenhuma linha persistida foi reescrita e nenhuma autorização foi ampliada.

Evidências:

- A regressão de contrato falhou antes da correção: página mista com reason null e string resultava em null.
- Após a correção, a página mista é preservada integralmente e reason numérico continua rejeitado.
- ActivityHistoryCompatibilityTest valida persistência real, paginação, versões, motivos nulos e informados, permissões de integrante pessoal, líder de projeto, coordenador e gestor geral, além de negativas para terceiro, participante sem gestão e requisição sem autenticação.
- Na sessão real, o detalhe `2b3e9ce7-cf6c-4d69-bbef-f05938b76983` exibiu os sete eventos anteriormente indisponíveis, sem modificar sua contagem.

## Confirmação de exclusão refinada a pedido do usuário

Substituídos os window.confirm de exclusão de planejamento e de task no editor lateral pelo AlertDialog já existente no design system.

O diálogo apresenta o nome do registro, consequências específicas, irreversibilidade, botão Cancelar e confirmação destrutiva explícita. O planejamento informa que tarefas, histórico e evidências serão preservados; a tarefa informa a remoção permanente de seus dados vinculados. O foco inicial fica em Cancelar; processamento bloqueia ações repetidas e fechamento; erros permanecem visíveis para recuperação. Não foi adicionado motivo obrigatório nem aprovação administrativa.

Cancelamento da exclusão da task foi validado na sessão real e não apagou o registro. O menu do planejamento foi confirmado pelo novo diálogo e completou a exclusão sem popup JavaScript nativo. A rota legada mantém sua confirmação inline já existente.

## Matriz de cenários

| Cenário | Sessão real | Integração / frontend | Evidência e resultado |
| --- | --- | --- | --- |
| Histórico de eventos com e sem motivo | **APROVADO** | **APROVADO** | Sete eventos C2 exibidos; parser e renderização cobertos; banco preservado |
| Paginação e autorização do histórico | **BLOQUEADO** para múltiplos papéis e múltiplas páginas reais | **APROVADO** | Teste PostgreSQL com size=1, versões 1/0, negativas 401/403/404 conforme contexto |
| Criar planejamento independente e navegar | **APROVADO** | **APROVADO** | Criado planejamento C3 524683fc-6b50-4216-9098-92f843b9b6ae e aberto workspace pelo ID retornado |
| Criar planejamento em projeto autorizado | **BLOQUEADO** | **APROVADO** | Banco local possui zero projetos; testes criam projeto e validam escopo e autorização reais no PostgreSQL |
| Criar task, atribuir ao próprio integrante e editar | **APROVADO** | **APROVADO** | Task C3 5d6cdeb8-ed3a-4d31-9adb-0fedb9a787f8; título, descrição, executor, prioridade e situação persistidos |
| Atribuir a terceiros, colaboradores e promover colaborador | **BLOQUEADO** | **APROVADO** | Só uma identidade ativa vinculada no ambiente real; testes atômicos validam executor, colaboradores e períodos |
| Movimentos sucessivos e reversíveis de situação/prioridade | **APROVADO** | **APROVADO** | PLANEJADA/MEDIA → EM_EXECUCAO/BAIXA → PLANEJADA/MEDIA → EM_EXECUCAO/ALTA; versão 7 antes da exclusão do planejamento |
| Conflito de versão e rollback de mutação parcial | **BLOQUEADO** para concorrência autenticada de sessões distintas | **APROVADO** | Testes comprovam 409 e rollback de propriedades, atribuições, eventos e versão |
| Kanban, tabela, detalhe e indicadores | **APROVADO** | **APROVADO** | Mesma task e propriedades; tabela exibiu Em andamento/Alta e resumo 1 task, 1 em andamento, 1 de alta prioridade |
| Persistência após recarregamento | **APROVADO** | **APROVADO** | Navegação completa para tabela recarregou propriedades do backend |
| Cancelar a confirmação de excluir task | **APROVADO** | **APROVADO** | Registro continuou existente; teste assegura que onDelete não executa na abertura nem no cancelamento |
| Excluir planejamento preservando task | **APROVADO** | **APROVADO** | Planejamento C3 count=0; task permaneceu com mesmo ID, planning_id nulo, EM_EXECUCAO/ALTA, versão 8 |
| Preservar histórico após excluir planejamento | **APROVADO** | **APROVADO** | Nove eventos da task, incluindo PLANNING_DETACHED versão 8, exibidos no detalhe legado |
| Preservar evidências de terceiros ao desvincular | **BLOQUEADO** no navegador | **APROVADO** | Task de homologação real não tinha evidências; ActivityPlanningTest cobre evidência de terceiro preservada na desassociação |
| Acesso a task legada sem planejamento | **APROVADO** | **APROVADO** | Task C3 apareceu em /atividades?view=legacy após desvinculação e abriu o mesmo ID |
| Excluir task permanentemente por autoria | **APROVADO** | **APROVADO** | Confirmação inline legada; feedback “Atividade excluída”; task C3 count=0 |
| Negar exclusão por não autor / versão antiga | **BLOQUEADO** no navegador | **APROVADO** | ActivityPermanentDeletionTest, ActivityPlanningTest e capacidades mantêm autoria e versionamento |
| Isolamento pessoal para administradores | **APROVADO** para navegação da sessão disponível; comparação entre contas **BLOQUEADA** | **APROVADO** | ActivityPersonalIsolationTest cobre filtro pessoal, EXISTS/deduplicação, projeto e consulta administrativa separada |
| Integrante, líder, coordenador e gestor geral: permitir/negar conforme matriz | **BLOQUEADO** exceto gestor geral | **APROVADO** | Testes de autorização, capacidades, histórico e isolamento com principais JWT de teste e banco real |
| Modal no padrão visual e manutenção do redesign | **APROVADO** em desktop dark | **APROVADO** | AlertDialog reutilizado, screenshot real; detector Impeccable retornou [] |
| Inspeção visual completa em mobile e light | **BLOQUEADO / não executado** | Não equivalente a homologação visual | Não há alegação de regressão visual completa fora do viewport e tema observados |

## Evidências reais e exclusões autorizadas

O usuário autorizou explicitamente excluir apenas o planejamento e a task C3, após comprovar a preservação da task. A autorização foi reiterada no pedido de refinar a confirmação.

Sequência observada:

1. Criado planejamento independente de teste e sua task.
2. Task movimentada sucessivamente com versões atualizadas e propriedades consistentes.
3. Nova confirmação da task aberta e cancelada; nada excluído.
4. Tabela e indicadores conferidos após navegação completa.
5. Planejamento excluído pelo novo AlertDialog. Consulta confirmou planejamento ausente e task preservada/desvinculada, versão 8.
6. /atividades?view=legacy listou a task; seu detalhe exibiu descrição, responsável, prioridade Alta, Em execução e nove eventos, incluindo a desassociação.
7. Task excluída pela confirmação inline da rota legada; feedback visual e consulta ao banco confirmaram a exclusão.
8. Planejamento C1 permanece existente e os sete eventos da task C2 permanecem intactos.

Arquivos visuais em `C:/Users/breno/.codex/visualizations/2026/11/18/01a1ecf8-9894-7963-a7ed-74a21cdaf5ad/`:

- c3-historico.jpg — histórico C2 acessível após a correção.
- c3-confirmacao-tarefa.jpg — novo diálogo de exclusão da task.
- c3-confirmacao-planejamento.jpg — novo diálogo com preservação das tasks.
- c3-task-desvinculada.jpg — detalhe após excluir o planejamento.
- c3-exclusao-concluida.jpg — feedback final da exclusão permanente.

## Validação técnica final

### Frontend

`npm run check` executado novamente após a correção do histórico e a substituição das confirmações:

- `npm run lint`: **APROVADO**.
- `npm run typecheck`: **APROVADO**.
- `npm run test`: **APROVADO**, 73 arquivos / 318 testes, sem falhas.
- `npm run build`: **APROVADO**, compilação e geração de rotas concluídas.

Os testes de frontend usam mocks de transporte ou renderização/harness React conforme o arquivo. Foram complementados pela homologação autenticada descrita acima. O teste da confirmação falhou antes da implementação por ausência do diálogo interno e passou após a alteração.

### Backend e PostgreSQL

Comando executado após a correção de leitura do histórico:

```powershell
docker compose --env-file .env -f infra/compose.yaml --profile test run --rm api-tests mvn --batch-mode -q '-Dtest=ActivityHistoryCompatibilityTest,ActivityPersonalIsolationTest,ActivityPlanningTaskMutationTest,ActivityPlanningTest,ActivitiesBoundaryTest,ActivityAuthorizationTest,ActivityDeadlinesTest,ActivityPermanentDeletionTest,ActivityCapabilitiesTest,ActivitySimplifiedManagementTest,ActivitySearchTest' test
```

**APROVADO: 69 testes, zero falhas, erros ou skips.**

| Classe | Testes |
| --- | ---: |
| ActivitiesBoundaryTest | 9 |
| ActivityAuthorizationTest | 10 |
| ActivityDeadlinesTest | 3 |
| ActivityPersonalIsolationTest | 5 |
| ActivityPlanningTaskMutationTest | 7 |
| ActivityPlanningTest | 10 |
| ActivityPermanentDeletionTest | 8 |
| ActivityCapabilitiesTest | 5 |
| ActivitySimplifiedManagementTest | 8 |
| ActivitySearchTest | 2 |
| ActivityHistoryCompatibilityTest | 2 |

Spring/MockMvc executa com principal JWT de teste e PostgreSQL 17 real via Testcontainers. Esses resultados continuam válidos após a alteração exclusivamente visual das confirmações: nenhum código de produção do backend, schema, autenticação ou contrato HTTP foi alterado por essa mudança. Não foi repetida a mesma regressão de backend sem impacto novo. Não foi executada a suíte inteira da API fora dessas classes relevantes.

### Migrations e integridade

- Testcontainers aplicou e validou o conjunto de migrations no PostgreSQL real.
- Banco local: V43, checksum 630061813, success=true. Sem migration nova, repair ou atualização manual de histórico.
- Consultas finais: planejamento C3 count=0; task C3 count=0; planejamento C1 count=1; histórico da task C2 count=7.
- `git diff --check`: **APROVADO**.
- Detector visual mecânico nos dois componentes de confirmação: **APROVADO**, saída [].

## Arquivos modificados no C3

- `apps/web/src/lib/activities/contracts.ts` e `.test.ts`: motivo opcional no contrato de histórico e regressão de página mista.
- `apps/web/src/components/activities/activity-detail.test.tsx`: apresentação de histórico com motivo nulo.
- `apps/api/src/test/java/br/edu/unijorge/niteconnect/ActivityHistoryCompatibilityTest.java`: persistência, paginação, integridade e autorização reais.
- `apps/web/src/components/activities/planning-delete-menu.tsx`: confirmação interna de exclusão de planejamento.
- `apps/web/src/components/activity-planning-preview/activity-planning-preview.tsx`: confirmação interna da task no editor lateral.
- `apps/web/src/components/activities/activity-planning-workspace-interactions.test.tsx`: confirmação, cancelamento e disparo explícito da exclusão.
- Este relatório.

## Pendências de homologação

Não há falha funcional conhecida pendente nos cenários disponíveis. Permanecem bloqueadas no navegador as verificações que exigem projeto autorizado, outras identidades/papéis e evidências de terceiros; a integração automatizada correspondente passou. Para eliminá-las, é necessário disponibilizar os contextos e sessões reais, sem alterar papéis nem criar projetos fora do escopo. Inspeção visual completa em tema light e viewport mobile não foi executada.
