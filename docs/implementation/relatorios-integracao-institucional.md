# Relatórios — integração institucional

## Auditoria e decisão contratual

A consulta V44 (`GET /api/v1/library/members/{memberId}/documents`) identifica vínculos institucionais por ACL direta/herdada ou `created_for`. Não havia classificação que diferenciasse relatório de outro arquivo institucional. Nome do arquivo, compartilhamento, autoria e propriedade não são usados como classificação implícita.

V45 adiciona `documents.classification = GENERAL | REPORT`, com **GENERAL para todos os documentos existentes** e índice parcial para relatórios ativos fora do espaço pessoal. Nenhum documento, pasta, grant, versão ou objeto é criado ou copiado. V1–V44 permanecem inalteradas.

A gestão classifica explicitamente cada documento na Biblioteca, em **Classificação para Relatórios → Usar em Relatórios / Retirar de Relatórios**. Essa operação atualiza metadados/autoria da modificação e grava `DOCUMENT_CLASSIFIED`, sem alterar ACL. Repetir a mesma classificação não duplica eventos. Classificar um documento não concede acesso nem o vincula automaticamente a integrante.

## Contratos e autorização

- `PUT /api/v1/library/documents/{id}/classification`, corpo `{classification:"REPORT"}` ou `{classification:"GENERAL"}`: somente COORDENADOR/GESTOR_GERAL ativos; recurso ativo INSTITUTION/PROJECT e fora do espaço pessoal. Documento pessoal é rejeitado, inclusive para administrador. A linha é bloqueada antes da alteração.
- A consulta V44 ganha `reportsOnly=true`, mantendo `false` como padrão compatível. Com esse filtro, exige classificação REPORT, vínculo com o integrante, propriedade institucional/de projeto e ausência de espaço pessoal. Nem mesmo um registro INSTITUTION situado no espaço pessoal é incluído.
- Pastas retornadas são pastas existentes, vinculadas ao integrante e contendo relatórios elegíveis. Sem `parentId`, a consulta apresenta o primeiro nível dessa perspectiva; com `parentId`, navega pelos filhos elegíveis. Pastas sem relatório não são criadas nem exibidas como conteúdo.
- `limit` (1–100), `offset`, `parentId` e `type` existentes permanecem disponíveis. As entradas recebem `mimeType` e `capabilities` efetivas, avaliadas no backend. O tamanho de pasta nessa perspectiva soma versões atuais de documentos classificados como relatório.
- O diretório usa `GET /api/v1/library/recipients`, existente e administrativo. A autorização é consultada novamente no backend, mesmo que a sessão ainda contenha um papel antigo. Integrantes comuns não conseguem acessar a consulta nem classificar, mesmo com grant EDIT no documento.

## Rotas reais e reaproveitamento

- `/relatorios`: integrantes ativos reais, apresentados como pastas virtuais; pesquisa por nome, inclusive sem distinguir acentos. Não consulta preenchimento, não inventa contagens e não cria pastas por integrante.
- `/relatorios/[memberId]?folder=...&offset=...`: documentos classificados, navegação de pastas, paginação, estados vazio/erro/carregamento e as colunas **Nome, Modificado, Modificado por, Tamanho, Compartilhamento**.
- O menu institucional liga a rota somente no grupo administrativo, preservando as demais áreas. O acesso direto continua dependente do backend.
- A superfície `DocumentDataGrid` e o ícone de pasta foram extraídos do explorador existente e compartilhados com Meus arquivos, sem alterar suas operações. Tokens, bordas, tipografia e temas existentes foram preservados. Em tela pequena, a tabela mantém cinco colunas em área com rolagem horizontal e foco por teclado, sem transbordar a página.
- DOCX abre a rota documental/Collabora existente, com retorno local validado para Relatórios. A capacidade `canEdit` diferencia edição e somente leitura. Outros formatos usam o download autenticado existente, conforme `canDownload`; não foi criado um visualizador paralelo. Sem `canView`, não há link de abertura.
- Nenhum bearer é enviado em props de cliente. Nenhuma dependência, aprovação, armazenamento ou autenticação demonstrativa foi adicionada. Os dados de exemplo usados na inspeção visual existem somente em artefatos de teste isolados, nunca nas rotas da aplicação.

## Principais arquivos

API: `InstitutionalLibraryController`, `InstitutionalLibraryService`, `InstitutionalLibraryRepository` e `V45__document_report_classification.sql`. Testes: `InstitutionalLibraryTest`, `InstitutionalLibraryMigrationTest` e os três testes com versão atual de Flyway fixa, ajustados para V45.

Web: páginas em `src/app/(authenticated)/relatorios`, componentes em `src/components/reports`, contratos/dados em `src/lib/reports`, `document-data-grid.tsx`, ações e organização da Biblioteca, menu autenticado e retorno do editor/Collabora. `next-env.d.ts` foi regenerado pelo Next durante o build, apontando para os tipos de produção.

## Validação executada

Na API, PostgreSQL 17 real via Testcontainers:

```powershell
mvn -q '-Dtest=InstitutionalLibraryTest,InstitutionalLibraryMigrationTest,Block04FrequencyMigrationTest,Block04RetirementMigrationTest,DocumentPurgeInfrastructureMigrationTest,DocumentCapabilityTest,DocumentFoundationTest,ProjectDocumentWorkspaceTest' test
```

**27 testes aprovados, zero falhas/erros/ignorados, exit code 0.** Incluem classificação explícita, coordenador e gestor geral, negação a integrante mesmo com EDIT, classificação idempotente/auditada, navegação hierárquica, integrante sem relatório, exclusão de arquivos pessoais mesmo quando marcados REPORT/INSTITUTION, compatibilidade do contrato V44, restauração, expurgo institucional e protocolo WOPI. O upgrade preservou documento/grant antigos e confirmou classificação GENERAL. No início, o teste novo falhou porque a consulta ignorava reportsOnly e retornava materiais genéricos; a evolução corrigiu essa falha demonstrada.

No web:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npx vitest run src/lib/reports src/components/reports src/components/shell/authenticated-navigation.test.ts src/components/shell/authenticated-shell.test.tsx src/lib/documents/library-actions.test.ts src/components/documents/my-files-explorer.test.tsx src/lib/documents/navigation.test.ts src/components/documents/collabora-frame.test.tsx
npx vitest run src/lib/reports/pages.test.tsx
```

- Lint e typecheck completos aprovados. Reexecutados no conjunto final antes do último ajuste de normalização da pesquisa.
- A execução ampla de `npm run test` teve **481 aprovados e uma falha** na expectativa antiga do menu, que não incluía `/relatorios`. A expectativa foi atualizada; não se repetiu a suíte inteira, conforme AGENTS.md.
- A execução direcionada final teve **48 testes aprovados em dez arquivos**, incluindo páginas, contratos, consulta com reportsOnly obrigatório, capacidades de abertura, vazio, retorno contextual, classificação na Biblioteca, menu e regressão de Meus arquivos/Collabora.
- Depois, a pesquisa foi normalizada para parâmetros repetidos (`search` como array), sem erro de renderização. Os quatro testes de páginas foram reexecutados e aprovados; os outros 44 continuam válidos, pois esse ajuste não os afeta. O build e seu TypeScript foram executados novamente após esse ajuste.
- O build de produção aprovou as rotas `/relatorios` e `/relatorios/[memberId]`. Não se declara a suíte completa verde no estado final a partir da execução ampla que teve uma falha.
- Uma inspeção temporária gerou artefatos dos componentes reais com CSS compilado em `.private/reports-review`; o arquivo temporário de geração foi removido. A inspeção de desktop (1280 px), mobile (390 px), tema claro/escuro, foco e abertura dos acessos confirmou ausência de transbordamento da página e rolagem horizontal do grid. Esses artefatos são cenários de teste, não evidência de uma sessão Entra autenticada.
- A rota real foi consultada sem sessão e retornou **307 para `/login`**. Não se falsificou autenticação para a revisão visual. Navegação e permissões autenticadas foram verificadas por testes de páginas e pela API com PostgreSQL, não por uma sessão Entra no navegador.
- `git diff --check` aprovado. Sem commit, alterações em `.env` ou credenciais.

## Pendências e limites reais

- Herdado da V44: homologação visual integrada com Entra e servidor Collabora real. O protocolo WOPI e o retorno do editor estão cobertos por testes; não houve edição real no CODE pelo navegador nesta etapa.
- Herdado da V44: política/ativação operacional e worker são pré-requisitos de expurgo em produção; não foram habilitados por esta tarefa. Não se repetiram testes de transporte S3 sem mudança no object store. A origem de itens anteriores à V44 continua limitada à árvore disponível na migração.
- O diretório reutilizado lista integrantes ativos; a API V44 mantém consulta administrativa histórica por UUID para integrantes inativos, mas a interface não adiciona um diretório histórico novo.
- Paginação por offset reflete alterações concorrentes; não é um snapshot de exportação. Classificações existentes não são inferidas retroativamente: a gestão precisa designar os relatórios na Biblioteca.
- Atividades e Entregas continuam dependendo de vínculo explícito com UUID/versão documental, autorização contextual e referência de preservação antes do expurgo; esta integração não cria esse vínculo.
