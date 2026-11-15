# Bloco 05.8 — Homologação integrada de Meus Arquivos

**Data:** 15/11/2026 (America/Bahia)  
**Parecer:** **BLOQUEADO para homologação ponta a ponta e uso real.** Foram executadas verificações automatizadas e parte de um percurso autenticado no Brave, mas faltam cenários de integração com vários perfis, arquivo real no Collabora e eventos completos de automação.

## 1. Ambiente utilizado

| Componente | Verificação | Resultado |
|---|---|---|
| Next.js | `GET http://localhost:3000` | Disponível, HTTP 200 |
| Spring API | `GET http://localhost:8080/actuator/health` | Disponível, HTTP 200 |
| PostgreSQL 17 | Container `nite-connect-db-1`, saudável, porta host 5433 | Disponível; schema `nite_connect` contém tabelas documentais |
| Flyway | Consulta somente leitura em `nite_connect.flyway_schema_history` (histórico em `public`) | V39; V35–V39 com sucesso |
| SeaweedFS S3 | Container saudável, porta host 8333 | Disponível; GET sem autenticação ao endpoint raiz retornou 403. Operação autenticada de objeto não testada |
| Collabora CODE | Container saudável; `/hosting/discovery` retornou HTTP 200 em 9980 | Discovery disponível; sessão WOPI não testada |
| Microsoft Entra / Brave | Sessão autenticada existente, usuário integrante (identificado na UI como BC) | Percurso autenticado realizado; não foram localizadas sessões dos outros perfis |
| Worker | Não há serviço worker separado na composição ativa | Documentação do Bloco 05.7D descreve polling agendado pela própria API; processamento real não comprovado nesta etapa |

O PostgreSQL efêmero usado por `mvnw verify` foi criado pelo Testcontainers, separado do banco local. A suíte validou e aplicou as 39 migrations nesse banco isolado.

## 2. Matriz de cenários

| Área / cenário | Resultado | Evidência / limite |
|---|---|---|
| Suíte web | **Aprovado** | `npm test`: 65 arquivos e 281 testes passaram |
| Typecheck web | **Aprovado** | `npm run typecheck` concluiu geração de tipos e `tsc --noEmit` |
| Lint web | **Aprovado** | `npm run lint` concluiu sem erro; execução encadeada avançou ao build |
| Build web | **Aprovado** | `npm run build` compilou e gerou as páginas estáticas/rotas |
| API | **Aprovado** | `mvnw verify`; 73 relatórios Surefire, 389 testes, 0 falhas, 0 erros, 0 ignorados. Testes com PostgreSQL Testcontainers |
| Migrations | **Aprovado** | Banco local em V39 por consulta somente leitura; Testcontainers confirmou aplicação das 39 migrations |
| Criar pasta e subpasta vazia | **Aprovado** | Brave autenticado criou `HOMOLOGACAO-B058-20261115` e `Subpasta-verificada`; listagens refletiram os registros após navegação/atualização |
| Persistência, cor e favorito | **Aprovado** | DB confirmou pasta `ff80c46f-1c42-48f8-8428-4e1b372b0544`, subpasta `ff1c0156-8a82-4ae0-b94d-72ed7a2aa989`, cor da subpasta `#107C10`; UI mudou ação para “Remover ... dos favoritos” |
| Renomeação | **Aprovado** | UI atualizou o nome para `Subpasta-verificada`; consulta SQL confirmou o mesmo nome persistido |
| Abrir/listar Meus Arquivos e árvore vazia | **Aprovado** | Navegação autenticada até a pasta e apresentação do estado vazio antes de criar a subpasta |
| Criar/ativar regra `NEW_FILE_IN_FOLDER` | **Aprovado parcialmente** | Painel exibiu regra ativa para a pasta monitorada. Sem upload, não foi produzido nem observado evento/notificação |
| Desativar regra de automação criada para o teste | **Aprovado** | Após retomar o Brave, a regra `bb30e713-ac82-46c5-9843-4c20161c5084` ficou desativada (confirmado no PostgreSQL). A regra ainda existe; remoção segue pendente |
| Lixeira e restauração | **Aprovado** | Subpasta sintética enviada à Lixeira, listada com caminho original e restaurada pela UI. A página confirmou restauração concluída e ficou vazia |
| Perspectivas compartilhadas | **Parcial** | “Com você” e “Por você” abriram e mostraram estado vazio. Pesquisa avançada retornou pasta com proprietário `UNKNOWN`/origem `LEGACY_UNKNOWN`; a rota direta mostrou listagem vazia, mas havia ação “Carregar arquivos”. Anomalia requer confirmação das capacidades da API |
| Upload simples/múltiplo/diretório, formatos e persistência S3 | **Bloqueado** | Não foi usado arquivo sintético de upload nesta execução |
| Renomear, mover, copiar, duplicar; cor pós edição | **Parcial** | Renomear e cor inicial verificados; mover/copiar/duplicar e alteração posterior de cor não executados |
| Lote, pesquisa, filtros, ordenação, paginação, detalhes, atividade, versões | **Bloqueado** | Percursos não realizados |
| Download individual/ZIP | **Bloqueado** | Percursos não realizados |
| Grants VIEW/EDIT, herança, revogação e links | **Bloqueado** | Sem identidade destinatária de teste separada; mudança de acesso entre pessoas não foi realizada |
| Conflito de restauração e descarte definitivo | **Bloqueado** | Restauração sem conflito aprovada; conflito e prévia de descarte não testados. Descarte físico institucional permaneceu desativado |
| Propriedade, hold, indeterminado e perfis de gestão | **Bloqueado** | Só foi observado perfil integrante; sem contas de gestor de projeto, coordenador e gestor geral |
| WOPI/CODE: abrir, visualizar, editar, salvar, concorrência, lock e revogação | **Bloqueado** | Discovery está disponível, sem sessão autenticada para DOCX de teste |
| Gatilhos de automação de upload de solicitação e grant direto | **Bloqueado** | Nenhum cenário com usuários separados; sem evento, processamento, notificação, retentativa, reinício ou idempotência observado |
| Desempenho, paginação sob volume, falha de rede e consistência PostgreSQL/S3 | **Não executado** | Sem massa representativa ou ensaio de interrupção |

## 3. Evidência do percurso Brave e persistência

1. A sessão abriu `http://localhost:3000/documentos` autenticada como integrante. A interface expôs as perspectivas Meus arquivos, Com você e Por você, além de Solicitações e Automações.
2. A pasta sintética foi criada pela interface e persistiu no PostgreSQL com ID `ff80c46f-1c42-48f8-8428-4e1b372b0544`, dentro da pasta pessoal existente `11467e62-310f-45b0-b0c4-54c17a3c06d1`.
3. A subpasta vazia persistiu com ID `ff1c0156-8a82-4ae0-b94d-72ed7a2aa989` e cor verde `#107C10`. A UI mostrou confirmação “Alteração concluída e listagem atualizada.”
4. Favoritar alterou o rótulo da ação para “Remover Subpasta-verificada dos favoritos”. A renomeação foi refletida na tabela e no PostgreSQL.
5. Foi configurada uma automação de pasta. No primeiro turno, a confirmação JavaScript não teve retorno confiável. Ao retomar a sessão, a regra apareceu desativada e a consulta somente leitura confirmou `enabled=false`. Ela não foi removida.
6. A subpasta foi enviada à Lixeira e restaurada. PostgreSQL confirmou os IDs originais ativos, com `deleted_at` nulo; a subpasta preservou cor `#107C10` e o favorito.
7. A pesquisa avançada mostrou `d8d590f9-1cdb-4913-ac96-5489c129ba7f` como `UNKNOWN`/`LEGACY_UNKNOWN`. A rota via “Com você” exibiu breadcrumb e listagem vazia, mas botão “Carregar arquivos”. Nenhum arquivo foi enviado. A combinação ainda precisa ser avaliada contra as capacidades autorizadas da API.

As consultas ao PostgreSQL foram somente leitura. A aplicação criou os dados de teste através da interface. A pasta, subpasta restaurada e regra desativada permanecem no ambiente local. A remoção da regra ainda está pendente.

## 4. Defeitos e riscos reproduzidos

- **Falha operacional de automação de navegador — gravidade moderada:** extensão Brave não respondeu durante a primeira confirmação JavaScript para remover a regra. Após retomar, ela apareceu desativada e o banco confirmou `enabled=false`; a remoção final não foi repetida.
- **Anomalia de recurso legado — gravidade a determinar:** pesquisa avançada lista recurso `UNKNOWN`/`LEGACY_UNKNOWN`, embora “Com você” apareça vazia. A rota direta mostra listagem vazia, mas mantém ação de upload. Sem resposta/capacidades HTTP, isso é indício para investigar, não prova de acesso indevido.
- Nenhum outro defeito funcional foi reproduzido. Os fluxos não exercitados permanecem bloqueados/não executados, não aprovados.
- HTTP 403 no endpoint raiz do SeaweedFS sem credenciais demonstra rota não pública; não comprova defeito da integração S3.
- A regra ativa residual é um risco operacional limitado à pasta sintética indicada. Deve ser removida pela interface e confirmada pela listagem antes de criar arquivos nesse destino.

## 5. Desempenho e segurança

Não foi feita medição de desempenho nem teste de consultas N+1. A suíte automatizada aprovou regras e persistência cobertas por testes existentes, mas não substitui testes de acesso entre perfis reais. A API e o PostgreSQL locais estavam disponíveis, e a sessão autenticada permitiu CRUD limitado ao espaço pessoal. Autorização cruzada, conteúdo de propriedade da gestão, grants e holds aguardam contas sintéticas distintas. A anomalia do recurso legado requer verificação de capacidades antes de concluir risco de exposição.

Os limites documentados para automações permanecem: até 100 resultados e monitoramento direto da pasta, sem recursão. Não foram exercitados. Nenhum descarte físico foi habilitado; política institucional de 30 dias não foi alterada.

## 6. Comandos e validações

- `docker compose --env-file .env -f infra/compose.yaml ps`
- `docker compose --env-file .env -f infra/compose.documents.yaml ps`
- Requisições locais a `:3000`, `:8080/actuator/health`, `:8333` e `:9980/hosting/discovery`
- `SELECT version, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 5` e consultas read-only a tabelas documentais/regra de automação
- `apps/web`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` — todos aprovados
- `apps/api`: `./mvnw verify` — aprovado; 389 testes reportados em 73 XMLs Surefire
- `git diff --check` — aprovado antes da atualização final deste relatório; executado novamente ao final desta revisão

## 7. Parecer e plano priorizado

**Prontidão para uso real: não homologada.** A disponibilidade local, V39, suíte automatizada e operações básicas em um perfil estão comprovadas. A operação integrada com S3, WOPI/CODE, outros perfis, lixeira, compartilhamento e entrega de notificações ainda depende de execução real.

1. Investigar a pasta `UNKNOWN`/`LEGACY_UNKNOWN` por capacidades e HTTP; confirmar se upload deve estar desabilitado e se deve constar em “Com você”.
2. Remover pela UI a regra sintética desativada e confirmar que não consta mais na lista.
3. Preparar quatro identidades descartáveis Entra e projetos/dados não produtivos isolados.
4. Executar uploads sintéticos; validar resposta HTTP, objeto S3, metadados, ZIP/download e persistência após nova sessão.
5. Validar conflito de restauração, IDs/versões/histórico; deixar descarte físico institucional desativado.
6. Com contas distintas, testar propriedade, VIEW/EDIT, herança, links, revogação e tentativas proibidas via API.
7. Abrir DOCX sintético no CODE e testar salvar/reabrir, edição simultânea, locks, conflito e revogação WOPI.
8. Exercitar os três gatilhos documentados e observar entregas persistidas, notificações, tentativas, reinício, idempotência e revogação antes da entrega.
9. Rodar volume e falhas em ambiente efêmero e registrar métricas/risco de objetos órfãos.

Sem esses passos, manter o bloco como bloqueado; não inferir aprovação a partir de testes unitários ou da disponibilidade de serviços.
