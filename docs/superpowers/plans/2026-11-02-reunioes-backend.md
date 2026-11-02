# Reuniões Backend Implementation Plan

> Implementação inline da Etapa 2 a partir do contrato aprovado em `docs/auditorias/2026-11-02-reunioes-graph-contratos.md`.

**Objetivo:** implementar o domínio backend de reuniões Teams com OBO, Calendar API Graph v1.0, persistência Flyway, convites internos, notificações, autorização contextual e recuperação idempotente.

**Arquitetura:** novo módulo `meetings` isolado de Agenda/Frequência e B06; integração Microsoft por uma porta `MeetingProvider`, com adaptador real Graph e substituto apenas em testes. O API continua Resource Server; OBO troca o token validado da API por token Graph delegado usando MSAL4J e credencial confidencial injetada por ambiente.

**Stack:** Java 21, Spring Boot 4.1.1, PostgreSQL, Flyway, MSAL4J, `java.net.http.HttpClient` e testes JUnit/Testcontainers.

**Especificação:** `docs/auditorias/2026-11-02-reunioes-graph-contratos.md`, requisitos posteriores desta Etapa 2 e `docs/product/NITE_Connect_Especificacao_Funcional_Consolidada_v1.0.pdf`.

## Restrições globais

- Não alterar contratos, tabelas, migrações ou rotas de Agenda, B03, B04 e B06.
- Não gerar presença B04 nem evidência B06 a partir de reunião Teams.
- Todos os endpoints operacionais exigem JWT Entra validado e integrante `ATIVO`; permissões específicas dependem de organizador/convidado.
- O token recebido pela API nunca é enviado ao Graph; OBO usa credencial confidencial do registro da API.
- Permissão Graph inicial: `Calendars.ReadWrite` delegada. Relatórios ficam opt-in e usam permissões delegadas adicionais somente após consentimento.
- Estado de reunião criada só é confirmado após IDs e link oficial Microsoft persistidos; resultados incertos continuam recuperáveis.
- Duração imediata padrão é 60 minutos previstos; isso não encerra a chamada Teams.
- Instantes são persistidos em UTC e exibidos institucionalmente em `America/Bahia`.
- Segredos, tokens, e-mails e `joinUrl` não aparecem em logs ou erros públicos; `.env` e configurações institucionais não serão modificados.
- Não implementar frontend, nem executar commit, merge, reset ou push.

## Revisão de riscos a cobrir

1. Credencial OBO ausente, consentimento recusado ou escopo não consentido deixam operação pendente/indisponível sem sucesso fictício.
2. Retry da mesma chave mantém o mesmo `transactionId` e não duplica reunião.
3. Timeout após criação Graph conserva resultado indeterminado e reconciliação segura.
4. Organizador/convidado inativo ou usuário sem vínculo não acessa reuniões; convidado externo não vê dados privados.
5. Resposta NITE permanece distinta da resposta Outlook.
6. Atualização/cancelamento concorrente não sobrescreve versão ou mutação mais recente.
7. Duração prevista nunca preenche campos de duração ou comparecimento reais.
8. Migração não toca registros, tabelas ou contratos de Agenda/B04/B06.

## Arquivos e responsabilidades

- `docs/implementation/reunioes-backend.md`: estados, configuração, permissões, endpoints, respostas e semântica de retry.
- `apps/api/pom.xml`, `application.yml` e pacote `meetings.infrastructure`: dependência MSAL4J, configuração Graph e cliente OBO/HTTP v1.0.
- `apps/api/src/main/resources/Migrations/V24__meetings_module.sql` e `Migrations/README.md`: agregado, convidados, operações, histórico, notificações e preparação de presença.
- `apps/api/src/main/java/br/edu/unijorge/niteconnect/meetings/**`: contratos HTTP, regras, autorização, persistência e integração Graph.
- `members/application/MemberDirectory.java`: busca paginada de ativos e leitura explícita de dados institucionais para convidados Graph.
- `shared/security/SecurityConfiguration.java`: liberar somente métodos/rotas autenticadas de Reuniões.
- `apps/api/src/test/java/br/edu/unijorge/niteconnect/Meetings*Test.java`: migração, fronteiras, segurança, idempotência, concorrência, notificações e cliente HTTP substituível.

## Plano de execução

### Tarefa 1 — Contrato e configuração Graph/OBO

- [ ] Formalizar o contrato backend e configuração por ambiente, incluindo resposta pendente, falhas seguras, consentimento e ausência de segredo local.
- [ ] Escrever teste do adaptador para provar que o token Graph vem de OBO, que o bearer recebido não é encaminhado e que erros/redação são seguros.
- [ ] Executar o teste antes do adaptador e registrar a falha esperada.
- [ ] Implementar porta `MeetingProvider`, `MeetingsGraphProperties`, aquisição OBO MSAL4J e Calendar API Graph real.
- [ ] Executar testes direcionados e verificar cache/expiração via MSAL.

### Tarefa 2 — Esquema e leitura de integrantes ativos

- [ ] Escrever teste Testcontainers de migração V24 e busca literal/paginada por nome de integrantes `ATIVO`.
- [ ] Confirmar falha antes da migração/contrato de busca.
- [ ] Adicionar V24 append-only e contrato explícito em `MemberDirectory`; atualizar catálogo.
- [ ] Executar os testes direcionados e validar FKs, unicidade e índices no PostgreSQL real de teste.

### Tarefa 3 — Criar e reconciliar reuniões

- [ ] Escrever testes de `IMMEDIATE` (início de servidor, duração padrão 60), `SCHEDULED`, convidado inativo, idempotência e falha do provedor.
- [ ] Confirmar falhas antes da implementação.
- [ ] Implementar reserva transacional, `transactionId` persistido, criação Graph, estado pendente/indeterminado e consulta da operação.
- [ ] Confirmar que `201` só ocorre após evento/link válidos persistidos.

### Tarefa 4 — Consulta, atualização, cancelamento e entrada

- [ ] Escrever testes de isolamento de organizador/convidado, `expectedVersion`, concorrência e falha parcial.
- [ ] Confirmar falhas antes da implementação.
- [ ] Implementar listas futuras/anteriores, detalhe, PATCH/CANCEL Graph-first com reconciliação, respostas internas e redirect protegido Teams.
- [ ] Executar testes direcionados sem alterar Agenda/B04/B06.

### Tarefa 5 — Notificações e histórico real opcional

- [ ] Escrever testes de notificação por destinatário, leitura individual e separação de estado Outlook/NITE.
- [ ] Escrever teste para relatórios não autorizados/disponíveis com campos reais nulos.
- [ ] Implementar inbox persistida e endpoint de presença Graph delegado apenas sob configuração opt-in.
- [ ] Confirmar que ausência/permissão recusada não estima tempos nem declara presença.

### Tarefa 6 — Revisão e validação

- [ ] Executar todos os testes direcionados das novas funcionalidades e `mvn verify` do backend com PostgreSQL/Testcontainers.
- [ ] Executar `git diff --check`, revisar migração, contratos e regressões dos módulos preservados.
- [ ] Tentar prova Graph real somente se credencial OBO, consentimento e conta segura de teste estiverem configurados; senão registrar como pendência institucional sem expor dados.
- [ ] Revisar o estado Git e listar alterações; não criar commit.

## Registro de decisões

- **Ruling:** manter Calendar API como caminho padrão de ambos os modos, conforme auditoria aprovada; `onlineMeeting` independente fica fora da implementação padrão até a prova no tenant mostrar necessidade. Custo se a hipótese falhar: o modo imediato exigirá um segundo adaptador Graph, preservando o mesmo agregado NITE.
- **Ruling:** usar MSAL4J com cache em memória do próprio `ConfidentialClientApplication`, sem persistir tokens. Custo: reinício do backend perde o cache local, mas a próxima chamada OBO readquire token a partir do bearer ainda válido.
- **Ruling:** sem segredo Graph no ambiente atual, o Graph real responderá indisponível e a prova real permanecerá pendente; os testes injetarão adaptador fake apenas para validar o domínio.
