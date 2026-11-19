# NITE Connect — Bloco 08.4B-3 | Relatório de integração documental

## Implementação

- A aba Documentos do workspace reutiliza `MyFilesExplorer` e as rotas da biblioteca, com `projectId` no contexto das consultas e mutações. A rota legada `/projetos/{id}/arquivos` redireciona para a experiência do workspace.
- Listagem, árvore, busca, filtros, ordenação, criação de pasta e upload usam os contratos documentais já existentes. O proxy de upload verifica a pasta por meio da consulta contextual do projeto e exige a capacidade `canAddChild` antes de encaminhar o conteúdo.
- A Lixeira e Aprovações do projeto usam rotas próprias do workspace, verificam vínculo e capacidade antes de buscar dados e preservam as políticas do backend. O backend agora permite filtrar a fila administrativa por `projectId` e `offset`, aplicando o filtro antes da paginação; a autorização administrativa foi mantida.
- Pastas `CUSTOM` herdam o projeto pela árvore e podem ter `project_id = NULL`. A aplicação mantém o escopo usando os endpoints contextuais do projeto e não interpreta esse `NULL` como acervo pessoal.
- Destinos de cópia e movimentação em lote agora são consultados no projeto atual. A seleção de destinos continua baseada nas capacidades retornadas pelo serviço documental.
- O Collabora permanece anunciado somente para DOCX. PDF, PNG e JPEG continuam como ativos para visualização/download conforme as capacidades retornadas.
- As tabelas da biblioteca e da Lixeira usam cores semânticas somente no workspace do projeto, corrigindo contraste claro sem mudar a apresentação pessoal aprovada.

## Contratos reutilizados

- `GET /api/v1/projects/{projectId}/library` e `GET /api/v1/projects/{projectId}/library/tree` para acervo, árvore e capacidades contextuais.
- `GET /api/v1/projects/{projectId}/trash` para a Lixeira de projeto.
- `/api/library/folders/{folderId}/upload-tree?projectId={projectId}` para upload contextual.
- Operações existentes da biblioteca para pasta, cópia, movimentação, download, versões, lixeira e restauração.
- `POST /api/v1/library/project-action-requests` e rotas de consulta/decisão para pedidos de exclusão institucional. A lista pendente permanece administrativa; líderes acompanham o próprio pedido pelo identificador.
- WOPI/Collabora existente para edição DOCX.

Não foram adicionadas migrations ou novos domínios de armazenamento.

## Evidência autenticada local

- No Brave autenticado, o workspace `HOMOLOGAÇÃO 08.4B-2 — Workspace` exibiu três documentos na pasta `HOMOLOGAÇÃO 08.4B-3 — Acervo`. A consulta somente leitura ao PostgreSQL local confirmou seus metadados associados ao `context=PROJECT`; o usuário confirmou que os uploads já haviam sido feitos. Não alterei o conteúdo desses arquivos.
- A rota do DOCX abriu o Collabora Online Development Edition Writer incorporado. Não editei nem salvei o documento para preservar o conteúdo e o histórico existentes.
- A Lixeira do projeto abriu com sucesso e estava vazia. Portanto não havia item real seguro para validar restauração/aprovação manualmente; nenhum descarte definitivo foi executado.
- Foram capturadas telas em tema escuro, claro e viewport móvel. Em 390 px, o documento manteve a largura do viewport (375 px efetivos no Brave); a tabela de 1.582 px tem rolagem interna.
- Containers locais observados: API e PostgreSQL saudáveis; Collabora saudável; armazenamento de documentos ativo.

A persistência autenticada confirmada nesta sessão cobre a presença dos metadados e a abertura do editor. A leitura de bytes por download e a persistência de uma edição DOCX após salvar não foram verificadas nesta sessão.

## Testes automatizados

- Frontend: `npm run check` — lint, typecheck, 97 arquivos de teste / 461 testes aprovados e build Next.js aprovados.
- Backend: `mvn '-Dtest=ProjectDocumentWorkspaceTest,DocumentQueriesRequestsTest' test` — 10 testes aprovados. Testcontainers iniciou PostgreSQL 17.11 e validou/aplicou 43 migrations no banco isolado.
- Os testes backend simulam a dependência de armazenamento; não são uma homologação do armazenamento de objetos real. A homologação autenticada real acima é separada desses testes.
- `git diff --check` não encontrou erros de whitespace. O diff inclui alterações preexistentes dos blocos 08.4B-1/2, preservadas.

## Arquivos principais desta integração

- API: `DocumentProjectActionController.java`, `DocumentProjectActionService.java`, `ProjectDocumentWorkspaceTest.java`.
- Rotas web: páginas `meus-projetos/[id]/documentos`, `/lixeira`, `/aprovacoes`; proxy `api/library/listing`; proxy `api/library/folders/[folderId]/upload-tree`; rota legada `projetos/[id]/arquivos`.
- UI: `project-documents.tsx`, `my-files-explorer.tsx`, `trash-explorer.tsx`, `document-batch-dialog.tsx`, `collabora-frame.tsx`, `project-document-action-dialog.tsx`, `project-document-requests.tsx`.
- Serviços e testes: `lib/documents/library.ts`, `library-actions.ts`, `navigation.ts`, `lib/projects/document-requests.ts`, `document-request-actions.ts` e testes das rotas/componentes correspondentes.

Sem commit. As alterações locais anteriores foram preservadas.
