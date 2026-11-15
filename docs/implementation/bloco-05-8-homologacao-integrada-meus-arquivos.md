# Bloco 05.8 — Homologação integrada de Meus Arquivos

**Data da inspeção:** 15/11/2026
**Resultado geral:** **BLOQUEADO para homologação ponta a ponta; NÃO APTO para parecer de uso real.**
**Escopo executado:** inspeção do ambiente local, percurso autenticado somente de leitura, chamadas HTTP seguras, consultas SQL somente de leitura e suítes automatizadas.

## Parecer executivo

A interface autenticada, a API, o PostgreSQL, o CODE local e o serviço SeaweedFS estavam acessíveis. O banco local já contém dados persistidos e apenas um integrante ativo, associado a `GESTOR_GERAL`; não é um ambiente isolado com contas e conteúdo de teste. A instância do navegador usava uma sessão existente, não uma identidade de homologação identificada.

Por esse motivo, nenhuma operação que alterasse arquivos, grants, lixeira, regras ou notificações foi executada nessa biblioteca. Não houve descarte físico no volume local ou em serviço institucional; a única remoção de bytes ocorreu no teste de integração de purge, em SeaweedFS/PostgreSQL descartáveis. Não houve alteração da política de 30 dias, mudança de configuração de Entra, uso de armazenamento institucional, commit ou alteração de código de produto. As suítes automatizadas passaram, mas não substituem os fluxos reais que ficaram bloqueados.

Não foi reproduzido defeito funcional no percurso real porque o percurso ficou restrito à leitura. Isso não equivale a aprovação funcional: os fluxos de arquivo, autorização entre perfis, compartilhamento, restauração, WOPI e gatilhos reais de automação continuam sem homologação integrada.

## 1. Ambiente e evidências observadas

| Componente | Evidência observada | Avaliação |
|---|---|---|
| Frontend | Next.js 16.4.3 em `http://localhost:3000`; `GET /documentos` respondeu HTTP 200. No Brave, a página autenticada tinha título “Meus arquivos | NITE Connect”, listagem carregada e links para Meus arquivos, Com você, Por você e Lixeira. | **Aprovado como smoke de leitura.** Não foram acionados botões de mutação. |
| Backend | Container Spring Boot ativo em `127.0.0.1:8080`; `/actuator/health` respondeu HTTP 200. `ENTRA_ENABLED` e `DOCUMENTS_ENABLED` estavam habilitados no container; o endpoint S3 apontava ao serviço local em `host.docker.internal:8333`. | **Aprovado como disponibilidade local.** Health não expõe detalhes e não comprova operações documentais. |
| PostgreSQL | PostgreSQL 17, container saudável, porta local 5433. Consulta em transação `READ ONLY`: última migration bem-sucedida V39, zero linhas Flyway com falha. | **Aprovado para versão de esquema.** O volume é persistente e contém dados anteriores. |
| Dados locais | Antes e depois das verificações: 1 integrante ativo, 1 atribuição `GESTOR_GERAL`, 4 documentos, 10 pastas, 7 versões, 2 linhas de regras de automação (0 ativas), 0 entregas e 0 notificações. A ativação de descarte no banco estava `false`. | **Não isolado.** Os totais permaneceram iguais; as consultas SQL foram agregadas e não foram abertos nem baixados conteúdos de arquivos. |
| Armazenamento | Container local `chrislusf/seaweedfs:latest` ativo em `127.0.0.1:8333`; `GET /status` respondeu HTTP 200 sem corpo. | **Disponível como processo local; S3 não homologado.** Não foi feito `HeadBucket`, upload, leitura, versionamento ou reconciliação no volume persistente. |
| Collabora CODE | Container local `collabora/code:latest`, health `healthy`; `/hosting/discovery` respondeu HTTP 200 com 42.592 bytes. A imagem usa tag móvel `latest`. | **Aprovada somente a disponibilidade e descoberta local.** Não houve sessão WOPI nem edição de documento. |
| Microsoft Entra | A página foi aberta na sessão autenticada já existente do Brave. Auth.js tinha configuração presente em `apps/web/.env.local` e a API estava habilitada para Entra. | **Sessão atual aceita; login novo e tenant de teste não verificados.** Não foram exibidos valores de credenciais ou identificadores. |
| Worker e retenção | O polling de automações é `@Scheduled` dentro do processo Spring (`@EnableScheduling`; padrão de 10 s), sem container de worker separado. Não havia regra ativa nem entrega pendente no banco. A ativação de purge estava desligada. | **Agendador presente no código; processamento real não comprovado.** Nenhuma configuração da política de 30 dias foi alterada. |

### Por que o ambiente ficou bloqueado

As portas locais já estavam ocupadas pelos serviços do projeto e apontavam para volumes existentes, criados antes desta homologação. O banco continha dados e a sessão autenticada representava a conta operacional atual. Não havia contas ativas separadas para integrante, gestor de projeto e coordenador, nem confirmação de que a configuração Entra pertence a tenant de teste. O S3 e o CODE disponíveis eram containers locais de desenvolvimento, não endpoints institucionais identificados como homologação.

Criar dados ou conceder acesso nesse ambiente contrariaria a exigência de isolamento e poderia alterar conteúdo do usuário. Por isso, o bloqueio foi registrado sem interromper a investigação nem substituir as integrações reais por mocks.

## 2. Matriz de cenários

| Funcionalidade/perfil | Cenário | Resultado | Evidência ou motivo |
|---|---|---|---|
| Meus Arquivos — sessão atual | Abrir a rota autenticada e carregar a listagem e a navegação das perspectivas. | **Aprovado — smoke de leitura** | Página e listagem visíveis no Brave; console do navegador sem erros ou avisos. Não foram incluídos nomes de usuário ou arquivos neste relatório. |
| Meus Arquivos | Criar pasta/subpasta; upload simples, múltiplo e de diretório; pasta vazia; renomear, mover, copiar, duplicar, alterar cor, favoritar e operar em lote. | **Bloqueado** | Exigiria mutações em uma biblioteca persistente sem identificação de dados descartáveis ou conta de teste. |
| Meus Arquivos | Download de arquivo e ZIP; pesquisa, filtros, ordenação, paginação, detalhes, metadados, atividade, versões, recarga e nova sessão. | **Bloqueado** | Não foram abertos nem baixados recursos da conta atual; volume de 4 documentos não é representativo. |
| Perfis e autorização | Integrante, gestor de projeto, coordenador e gestor geral; propriedade mista, hold, `UNKNOWN`, grants `VIEW`/`EDIT`, isolamento entre pessoas/projetos e tentativas proibidas autenticadas. | **Bloqueado** | Só há um integrante ativo e uma atribuição `GESTOR_GERAL`; faltam identidades de teste para comparação. |
| API protegida | `GET /api/v1/me/document-automations` e `GET /api/v1/me/trash` sem bearer. | **Aprovado — negativo** | Ambos responderam HTTP 401. Não foi enviado token inválido nem feita chamada de mutação. |
| Compartilhamento | “Com você”/“Por você”, concessão, mudança, revogação, herança, gestão de acesso e link interno; confirmar bloqueio pós-revogação e não exposição de terceiros. | **Bloqueado** | Nenhuma concessão ou revogação foi feita; não se inspecionaram recursos compartilhados da conta existente. |
| Lixeira | Enviar à Lixeira, listar, restaurar, conflito de nome e recursão; preservar ID, versão, autoria e objetos; prévias de descarte. | **Bloqueado** | Não houve operação sobre o conteúdo existente. A ativação de descarte no banco estava desligada. |
| Descarte físico | Prévia, esvaziamento e estado indisponível. | **Bloqueado / não executado** | Não foi ativado purge nem chamado endpoint destrutivo. O teste automatizado de purge usa infraestrutura descartável própria e não alterou o volume local. |
| CODE/WOPI | Abrir DOCX, VIEW, editar/salvar/fechar/reabrir, preservar tabelas/imagens, dois editores, revogação, lock/conflito e arquivo na Lixeira. | **Bloqueado** | Discovery local respondeu HTTP 200, mas faltaram documento e usuários de teste isolados para criar uma sessão WOPI real. |
| PDF e formatos | Distinguir download/prévia de PDF de edição web; validar outros formatos aceitos. | **Bloqueado** | Nenhum arquivo foi aberto. O contrato documental atual descreve DOCX para WOPI; PDF e imagens são anexos para leitura/download, sem edição WOPI. |
| Automações | Criar, ativar, desativar e remover regras; testar os três gatilhos, leitura, retry, reinício, idempotência e revogação antes da entrega. | **Parcial — testes automatizados aprovados; fluxo real bloqueado** | Cinco testes de `DocumentAutomationTest` passaram em infraestrutura de teste. No banco local havia 0 regras ativas, 0 entregas e 0 notificações. Não houve reinício do processo local nem evento real. |
| Desempenho e confiabilidade | Volume representativo, N+1, latência de capabilities, estabilidade de paginação, limites de upload, ZIP, falhas de rede e consistência PostgreSQL/S3. | **Bloqueado para medição** | O volume local é pequeno e não foi modificado. Não se injetaram falhas nem se mediram latências de listagem ou p95. |

## 3. Validação automatizada

| Verificação | Resultado final | Escopo e limites |
|---|---|---|
| `.\mvnw.cmd -B verify` em `apps/api` | **Passou:** 389 testes, 73 suítes, 0 falhas, 0 erros, 0 skips; BUILD SUCCESS. | Pelo harness das classes, 299 testes usam infraestrutura de integração/contexto Spring e 90 são unitários; o Maven reporta o agregado, e essa separação foi classificada pela fonte de cada teste. Dos testes documentais, 81 em 14 suítes passaram (70 de integração e 11 unitários). |
| Integração S3 em teste | **Passou:** `DocumentS3IntegrationTest` (1 teste) e `DocumentPurgeExecutionIntegrationTest` (1 teste). | SeaweedFS/PostgreSQL em containers temporários. O purge de bytes ocorre somente no armazenamento descartável do teste; isso não valida o volume configurado da aplicação nem autoriza purge institucional. |
| Automações em teste | **Passou:** 5 testes. | Cobrem evento direto de pasta, solicitação, compartilhamento/revogação, repetição idempotente e retry. A classe usa PostgreSQL temporário e provider de armazenamento de teste; não é execução contra o worker e os usuários de homologação reais. |
| Testes Collabora | **Passou:** 2 testes de descoberta. | Não cobrem edição WOPI em navegador, locks ou fidelidade DOCX. |
| `npm test` em `apps/web` | **Passou:** 65 arquivos, 281 testes. | Vitest de componentes e bibliotecas; não equivale a E2E no Brave. O Vitest emitiu aviso de compatibilidade futura do carregador de configuração. |
| `npm run typecheck` | **Passou.** | Executado em cópia temporária da fonte para não escrever em `.next` do Next dev que atendia o navegador. |
| `npm run lint` | **Passou**, sem avisos ESLint. | Executado na mesma cópia temporária. |
| `npm run build` | **Passou:** compilação, TypeScript e geração das rotas. | Executado após `npm ci` na cópia temporária, conforme `package-lock.json`. A primeira tentativa com junction de `node_modules` foi recusada pelo Turbopack por estar fora da raiz; a validação foi refeita com dependências instaladas localmente na cópia e passou. A instalação temporária emitiu aviso de versão do ESLint sem suporte. |
| `git diff --check` e verificação deste relatório | **Passou.** | Diff rastreado sem erro e scan de trailing whitespace no relatório novo sem ocorrência; a alteração preexistente em `apps/web/next-env.d.ts` foi preservada. |

Os testes automatizados usam PostgreSQL 17 descartável por Testcontainers. O teste S3 usa SeaweedFS temporário; isso é integração real com um servidor compatível dentro da infraestrutura de teste, mas não é o S3 configurado no ambiente local nem um serviço institucional. Os testes de autorização em backend usam JWTs sintéticos. Nenhum teste executa um login novo em Entra ou uma sessão real no CODE.

**Cópias temporárias de validação:** permaneceram em `%TEMP%` porque a política da execução bloqueou sua exclusão recursiva. A cópia de typecheck/lint é `nite-connect-b058-web-verify-fbaec0faec0e452da56de7d25882c987` e contém um junction `node_modules` para as dependências já instaladas no workspace; a cópia do build é `nite-connect-b058-web-build-25c478f22d194567923724441ad5809f` e contém dependências instaladas pelo lockfile. Nenhuma delas contém `apps/web/.env.local`; ambas estão fora do repositório.

## 4. Evidência HTTP, banco, navegador e logs

| Origem | Checagem | Resultado |
|---|---|---|
| Brave | `http://localhost:3000/documentos` | Página autenticada carregada; perspectivas e conteúdo listados. Snapshot de acessibilidade consultado; nenhum nome de pessoa/arquivo é reproduzido aqui. |
| Brave | Console `error`/`warn` da aba | 0 mensagens. |
| API | `GET /actuator/health` | HTTP 200, 49 bytes; detalhes de saúde não expostos pelo endpoint. |
| API | GETs protegidos sem bearer | HTTP 401 para automações e Lixeira. |
| Collabora | `GET /hosting/discovery` | HTTP 200, 42.592 bytes. |
| SeaweedFS | `GET /status` | HTTP 200, corpo vazio; não é prova de bucket ou CRUD S3. |
| PostgreSQL | Consulta `READ ONLY` em `public.flyway_schema_history` e tabelas documentais | Banco local em V39, 0 falhas; contagens acima iguais nas leituras antes/depois e nenhuma migration aplicada nele. A suíte `verify` validou/aplicou migrations em PostgreSQLs descartáveis. |
| Logs API | `docker logs --since 60m nite-connect-api-1` | 48 linhas observadas, 0 `ERROR`, 0 `WARN`; não houve linhas com referências a automação/WOPI/S3. O serviço não tem log de acesso que permita inferir ausência de chamadas a partir disso. |
| Docker | `docker compose ... ps -a` antes/depois dos testes | API, DB, CODE e SeaweedFS continuaram ativos; DB/CODE saudáveis. Containers Testcontainers foram descartáveis e encerrados ao final de `verify`. |

## 5. Defeitos, riscos e limitações

### Defeitos reproduzidos

**Nenhum defeito funcional foi reproduzido** no produto. Os fluxos de gravação não foram exercitados no ambiente persistente, então isso não é evidência de ausência de defeitos.

### Riscos estáticos e operacionais

1. **Alto — falta de isolamento e de perfis:** esta é a barreira principal à homologação. A base local contém conteúdo persistente e só um integrante ativo; não permite validar fronteiras reais entre quatro perfis.
2. **Alto — WOPI não homologado:** CODE local responde discovery, mas edição, salvamento, locks e revogação em sessão não foram verificados. A tag `latest` também impede reproduzir a mesma versão apenas pelo nome da imagem.
3. **Alto — S3 do ambiente não comprovado:** `/status` não verifica credenciais, bucket, versionamento, PUT/GET, falhas parciais ou objetos órfãos. A integração S3 aprovada foi apenas no SeaweedFS descartável de teste.
4. **Médio — risco de amplificação de consultas:** `DocumentLibraryService.listing` usa página por cursor e busca permissões em lote, mas a projeção de cada arquivo chama `documents.require` e calcula capabilities por item; a projeção de pastas também calcula capabilities individualmente. Isso é um candidato a N+1, não um defeito medido. A consulta de filhos de pasta não recebe limite/paginação. Revisar com volume representativo e contagem de queries antes de alterar.
5. **Médio — limites de upload não comparados em execução:** actions da web rejeitam arquivos acima de 8 MiB, Spring configura 10 MB por arquivo e Next 35 MB por requisição. Não foram testados limites, upload de diretório ou falhas no meio do envio.
6. **Limite conhecido — automações:** histórico/listagens retornam no máximo 100 registros; `NEW_FILE_IN_FOLDER` observa arquivo criado diretamente na pasta, sem varredura recursiva. São limites documentados, não defeitos reproduzidos nesta execução.
7. **Limitação de evidência:** não houve medição p50/p95, teste de carga, falha de rede, restauração de backup, reconciliação de S3 nem restart do API para comprovar retomada persistente do worker.

## 6. Plano priorizado para concluir a homologação

| Prioridade | Ação necessária | Critério de saída |
|---|---|---|
| P0 | Provisionar ambiente de homologação separado: PostgreSQL/volume novos, bucket S3 exclusivo, CODE de homologação com versão identificada, API e web em portas/origens próprias e configuração de descarte isolada. | Nenhum serviço ou volume de produção/dev compartilhado; confirmação de que o S3 e o tenant são não produtivos. Manter a política de 30 dias e purge institucional desligado. |
| P0 | Disponibilizar identidades Entra de teste correspondentes a integrante, gestor de projeto, coordenador e gestor geral, com dados sintéticos e sem arquivos pessoais reais. | Login real no tenant de teste e autorização de cada perfil confirmados sem credencial fictícia ou token manual. |
| P1 | Executar a matriz de Meus Arquivos, compartilhamento e Lixeira com verificações UI + HTTP + PostgreSQL/S3 após cada operação. | CRUD, views, herança/revogação, conflitos, restauração, preservação de versões e bloqueios de capacidade registrados por perfil. |
| P1 | Usar DOCX sintético com tabelas/imagens no CODE real: VIEW, edição/salvamento/reabertura, concorrência, revogação, locks e recursos na Lixeira. | Evidência da sessão e dos callbacks WOPI; comparar hash/versão e verificar que `VIEW` não salva. PDF deve ser avaliado como download/visualização, nunca presumido editável. |
| P1 | Ativar regras de teste para os três gatilhos; testar leitura de notificação, idempotência, retries, restart do API, desativação/remoção e revogação antes da entrega. | Uma única entrega por recurso, estado persistido e nenhuma exposição após perda de acesso. |
| P2 | Medir listagem/capabilities, paginação, arquivos próximos aos limites, ZIP, falhas de rede e consistência/reconciliação PostgreSQL/S3 com volume aprovado. | Latências e contagens de consultas registradas; falhas recuperáveis sem divergência ou objeto órfão não identificado. |

## Conclusão

O estado disponível comprova que a interface local autenticada abre, a API e o banco estão ativos, V39 está aplicada, CODE responde à descoberta e as suítes automatizadas estão verdes. **Não comprova o funcionamento integrado de Meus Arquivos em ambiente de homologação real.** O parecer permanece **NÃO APTO para utilização real** até os gates P0 e os percursos P1 serem executados e evidenciados no ambiente isolado.

Referências funcionais: especificação consolidada v1.0 (em especial pp. 10–13 e 15, com validação institucional pendente em pontos indicados); contrato documental atualizado em `bloco-05-6-0-contrato-funcional-documental.md`; contrato operacional de automações em `bloco-05-7d-automacoes-documentais.md`; catálogo de migrations em `apps/api/src/main/resources/Migrations/README.md`. Decisões aprovadas posteriores prevalecem sobre o PDF histórico.
