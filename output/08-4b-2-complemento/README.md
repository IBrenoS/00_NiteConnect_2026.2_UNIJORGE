# NITE Connect — 08.4B-2: criação e administração de projetos

Implementação local de 18/11/2026. Continuidade na main autorizada anteriormente; alterações locais preservadas, sem commit ou push. Este complemento não altera código de produção do backend, contratos, migrations, autenticação, dependências ou Documentos.

## Comportamento entregue

- Núcleo → Projetos oferece **Novo projeto** somente quando GET /api/v1/me confirma integrante ativo com COORDENADOR ou GESTOR_GERAL. A presença do papel na sessão não basta. A rota e a Server Action refazem a checagem; o POST continua autorizado pelo backend.
- /projetos/novo recebe título (200), descrição (10.000), datas opcionais e motivo (1.000). Valida campos, calendário e ordem das datas. O payload não aceita situação, disponibilidade, criador, vínculo ou liderança. Após resposta confirmada e validada, navega para /projetos/{id}.
- O backend preserva PLANEJAMENTO, ingresso fechado e ausência de participação/liderança na criação. A interface explica esses efeitos antes da confirmação.
- Detalhe e menu do workspace oferecem **Administrar projeto** conforme canManageMembers retornada pelo backend. Essa capacidade usa a mesma condição admin/liderança contextual de ProjectAccess.requireManage, que governa edição e equipe. A rota privada rejeita acesso antes de consultar históricos ou candidatos.
- /projetos/{id}/administrar reúne dados, situação, ingresso, liderança, equipe e históricos. Edição envia substituição integral dos campos, datas nulas explícitas, expectedVersion e motivo. Conflitos não são tratados como sucesso nem repetidos automaticamente; a interface oferece atualização dos dados.
- Situação requer administração global efetiva. As opções seguem ProjectStatus.canTransitionTo: planejamento→ativo; ativo→pausado/concluído; pausado→ativo/concluído; concluído→ativo. O backend revalida a transição.
- Disponibilidade reutiliza ProjectAvailability e seu contrato versionado. Abertura fica impedida sem liderança, em pausa ou conclusão; fechamento continua disponível quando configurada aberta.
- Administração da equipe permite pesquisar integrantes ativos por nome (mínimo 2, máximo 160 caracteres), incluir com responsabilidade e motivo e encerrar vínculo preservando histórico. A pesquisa é explícita, contextual e paginada; não foi criada uma listagem global de pessoas. O backend revalida elegibilidade.
- Designação/transferência ou vacância de liderança usa somente participantes vigentes e canTransferLeadership. A liderança precisa ser transferida/encerrada antes da saída do integrante que a exerce. Não há inclusão automática de membros ao definir liderança.
- Históricos de situações, participação e liderança são lidos pelos contratos existentes. **Alterações dos dados cadastrais são registradas na auditoria do backend**; o contrato existente /history retorna situações, não snapshots de edição. Não foi criada uma consulta global de auditoria no frontend nem ampliado acesso para líderes contextuais.
- Mutações revalidam catálogo, detalhe/área administrativa, Meus Projetos e layout do workspace contextual. O bearer permanece apenas no servidor. Estados de validação, carregamento, erro e ausência de autoridade são explícitos.
- Novos controles reutilizam tipografia, superfícies, botões e campos aprovados. O link administrativo compõe a faixa de identificação já existente no detalhe, sem acrescentar outra seção ao cabeçalho.

## Contratos utilizados

| Contrato | Finalidade |
| --- | --- |
| GET /api/v1/me | Papéis globais efetivos e condição ativa |
| POST /api/v1/projects | Criação formal com motivo e padrões do backend |
| PATCH /api/v1/projects/{id} | Edição completa dos campos com expectedVersion e motivo |
| PATCH /api/v1/projects/{id}/status | Transição administrativa versionada |
| GET /api/v1/projects/{id}/workspace | Dados, versão e capacidades contextuais |
| PATCH /api/v1/projects/{id}/availability | Disponibilidade versionada existente |
| GET /api/v1/projects/{id}/member-candidates?query=... | Busca controlada de integrantes elegíveis |
| GET e POST /api/v1/projects/{id}/members | Equipe vigente e inclusão explícita |
| DELETE /api/v1/projects/{id}/members/{memberId} | Encerramento do período, com versão e motivo |
| POST /api/v1/projects/{id}/leadership-transfers | Designação, transferência ou vacância administrativa |
| GET /api/v1/projects/{id}/history | Histórico de situações |
| GET /api/v1/projects/{id}/members/history | Histórico de participações |
| GET /api/v1/projects/{id}/leadership/history | Histórico de liderança |

Nenhuma extensão de contrato foi necessária neste complemento. A auditoria de criação, edição, situação, equipe e liderança já é transacional no backend.

## Homologação real no navegador e PostgreSQL

Criado pela interface, com autorização de teste local já existente:

- ID: d298180f-939f-493b-9960-d4b2fd24d640.
- Título inicial: HOMOLOGAÇÃO 08.4B-2 — Cadastro pela interface.
- Após criação: PLANEJAMENTO, ingresso fechado, zero integrantes e liderança vacante; detalhe aberto automaticamente. Captura projeto-criado.jpg.
- Título atualizado: HOMOLOGAÇÃO 08.4B-2 — Cadastro editado, datas 18/11/2026 e 18/12/2026; recarga preservou dados e versão.
- Situações exercitadas: PLANEJAMENTO→ATIVO→PAUSADO→ATIVO. A pausa bloqueou a abertura do ingresso.
- Participação e liderança do integrante autenticado foram adicionadas por ações explícitas posteriores. Pesquisa de candidatos, responsabilidade, motivo e designação confirmados. A consulta SQL comprova membershipStartedAfterCreation=true; o histórico e a auditoria distinguem cadastro, inclusão e designação.
- Ingresso aberto, fechado e reaberto na interface. Estado final: ATIVO, versão 9, acceptingMembers=true, uma participação vigente e um período de liderança.
- Catálogo passou de 3 para 4 projetos e refletiu título, situação, liderança e datas reais. Os três registros anteriores foram preservados.
- Banco confirmou quatro eventos de situação e dez eventos de auditoria, incluindo PROJECT_CREATED e PROJECT_UPDATED. A consulta de evidência não extrai tokens, emails ou snapshots de cadastro pessoal.
- Doze medições de página sem overflow horizontal. Criação e administração verificadas em claro/escuro, desktop 1440×1000 e mobile 390×844. Detalhe final também conferido em desktop/mobile. Quatorze capturas locais; preferência Sistema e viewport original restauradas.
- Um warning de GET de candidatos sem pesquisa foi observado durante desenvolvimento. Causa identificada no contrato: pesquisa mínima obrigatória. A consulta inicial foi removida e substituída por busca explícita; após correção, nenhum novo warning ou erro de console apareceu nos fluxos exercitados.

O projeto identificado permanece no PostgreSQL local. Não foi usado helper de seed ou SQL de escrita; todas as mutações deste registro ocorreram pela interface integrada e seus endpoints reais.

## Validações

### Após os ajustes finais

- `npm run test -- src/components/projects/projects.test.tsx src/lib/projects/administration-actions.test.ts`: **2 arquivos, 27 testes aprovados**. Revalida posicionamento do controle e payload explícito da transição, além das regras de criação, autoridade, versões, erros e permissões.
- `npm run lint`: aprovado, zero warnings de ESLint.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado. Inclui /projetos/novo e /projetos/[id]/administrar.
- `git diff --check`: aprovado ao encerrar.

### Verificações anteriores mantidas

- `npm run test`: **87 arquivos, 417 testes aprovados**. Depois dessa execução houve somente reposicionamento do link de administração na faixa existente e substituição de spread por payload explícito na transição. Os 27 testes diretamente relacionados foram repetidos; não se declara reexecução integral no estado final.
- `npm run test -- 'src/app/(authenticated)/projetos' src/lib/projects src/components/projects`: **12 arquivos, 77 testes aprovados**, incluídos na suíte ampla. Cobrem autorização das rotas, papéis revogados, carregamento de candidatos somente após pesquisa, parsers, históricos, validação e ações contextuais.

### Backend com PostgreSQL real

Comandos na raiz:

1. `mvn -f apps/api/pom.xml '-Dtest=ProjectAdministrationIntegrationTest,ProjectsBoundaryTest,ProjectDiscoveryParticipationTest' test -q`.
2. `mvn -f apps/api/pom.xml '-Dtest=ProjectAdministrationIntegrationTest#editingTransitionsAvailabilityAndAuditPersistWithOptimisticVersions' test -q`.

A primeira execução aprovou **21 de 22 testes**. Um teste novo esperava indevidamente abrir ingresso sem liderança e recebeu 409, conforme a regra existente. O teste foi corrigido para verificar essa negativa, incluir/designar liderança explicitamente e então confirmar abertura. **O caso corrigido passou na reexecução isolada**, sem falhas/erros/skips. Os outros 21 permaneceram válidos: sua implementação e os serviços de produção não foram alterados após a execução. Total: 22 cenários distintos validados, sem afirmar nova execução integral das três classes no estado final.

Cobertura: coordenador e gestor geral ativos; integrante comum e administrador afastado negados; criação independente sem membros/líder; leitura após escrita; edição com datas, versão e auditoria; concorrência por versão antiga; transições; ingresso condicionado à liderança; escopo contextual, liderança e histórico. Spring Boot/serviços/transações/Flyway e PostgreSQL 17 via Testcontainers reais; MockMvc e JWT de teste simulam o transporte/identidades. Nenhum dado da aplicação local foi alterado por esses testes.

O warning existente do Vitest sobre ESM/configLoader e os avisos usuais de instrumentação JVM não foram alterados.

## Limitações reais

- A sessão institucional disponível é de Gestão Geral. Coordenador, integrante comum, administrador afastado e revogação foram verificados por testes, não por troca manual de contas institucionais.
- O encerramento de participação, a vacância, a conclusão e a reabertura após conclusão têm cobertura automatizada. Não foram todos repetidos manualmente no navegador neste complemento.
- Histórico de alterações dos dados cadastrais permanece na auditoria persistida existente; a tela mostra os três históricos contextuais disponíveis na API. Expor snapshots de edição exigiria contrato específico, fora desta integração.
- Não foi executada a suíte inteira do backend. Não houve mudança de esquema ou de serviços de produção neste complemento. Os testes de atividades/documentos não foram repetidos isoladamente: a suíte frontend ampla os inclui, e esses domínios não foram alterados.

## Arquivos e evidências

A lista específica deste complemento está em arquivos.txt. Principais grupos: duas rotas administrativas e testes; ProjectAdministration/ProjectDetailsForm; parsers e Server Actions administrativos; loaders de autoridade/candidatos/históricos; integração dos controles no catálogo, detalhe e menu do workspace; CSS local; testes PostgreSQL de administração.

- capturas.html: galeria e detalhe final.
- persistencia-postgres.json e verificar-persistencia.sql: estado e auditoria reais, leitura somente.
- responsive.json: medições de largura e identificação das telas.
- backend-tests.log e backend-recheck.log: execução inicial e caso corrigido.
- plano.md: decisões e tarefas deste complemento.

Alterações preexistentes, incluindo next-env.d.ts, preservadas. Next regenerou referências durante a validação; as referências preexistentes de desenvolvimento foram restauradas ao encerrar, sem outras alterações no arquivo. Nenhuma alteração em .env, credenciais ou documentação histórica.
