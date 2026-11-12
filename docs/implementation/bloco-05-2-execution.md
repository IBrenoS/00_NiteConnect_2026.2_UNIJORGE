# Entrega 05.2 — registro de execução e homologação

## Estado

**Implementação de código concluída para revisão e testes no ambiente do desenvolvedor; homologação funcional da Entrega 05.2 ainda pendente.** A fundação 05.1 foi testada previamente pelo usuário, mas não se deve interpretar isso como validação dos novos fluxos desta entrega.

## Implementação

1. Migração aditiva `V28__document_library.sql`, preservando V1–V27, documentos existentes e suas versões S3/WOPI.
2. Serviço e endpoints de biblioteca única, autorizações pessoais, administrativas e contextuais de projeto, nomes únicos por pasta, árvore de pastas, cores, movimentação, arquivamento/restauração.
3. Upload DOCX, PDF, PNG e JPEG; metadados de proprietário, autoria, última edição, compartilhamento via modelo e última abertura WOPI; proxy autenticado para download.
4. Modelos oficiais DOCX com versões preservadas, cópias independentes por destinatário e provisionamento automático na aceitação de convites; sincronização administrativa dos integrantes existentes.
5. Interface de `Meus arquivos`, `Biblioteca do NITE`, arquivos de projeto e `Meus projetos`, preservando a navegação e os módulos existentes; cenários de regressão incluídos em `DocumentLibraryTest`.

## Verificações neste ambiente

- **Executadas:** parser Java 21 dos arquivos alterados, parser TypeScript/TSX dos componentes alterados, verificação de integridade Git e `git diff --check`.
- **Não executadas:** `mvnw.cmd --batch-mode verify`, `npm run check`, inicialização PostgreSQL/Testcontainers, migração V28 efetivamente aplicada, integração HTTP completa e edição de ponta a ponta no Collabora. O ambiente de geração não possui Docker, e as dependências Maven/Node não estavam disponíveis para instalação offline. Não há declaração de `BUILD SUCCESS` nesta entrega.

## Homologação recomendada no ambiente local

1. Certificar que o pacote foi extraído preservando `.git`, conferir branch de trabalho e diff. Fazer backup do PostgreSQL antes da primeira migração em banco não descartável.
2. Com PostgreSQL e S3 privados acessíveis, iniciar o backend e executar `apps/api\\mvnw.cmd --batch-mode verify` (Windows) ou `cd apps/api && ./mvnw --batch-mode verify` (Linux). Confirmar aplicação **V28**.
3. Em `apps/web`, executar `npm ci` e `npm run check`, respeitando a versão Node exigida pelo repositório.
4. Com identidade de integrante e administração: importar DOCX, editar e reabrir no Collabora, verificar mesmo UUID em ambas as perspectivas; confirmar que integrante não acessa outra pasta nem arquiva arquivos.
5. Criar/renomear/recolorir/mover pastas; testar colisão de nomes (inclusive diferenças de caixa/espaços), mover para um descendente, arquivar com confirmação e restaurar conteúdo.
6. Criar modelo DOCX e distribuir para dois integrantes; confirmar documentos independentes, não duplicação na redistribuição e preservação de versões anteriores após publicação de novo modelo.
7. Ingressar integrante via convite real e conferir pasta provisionada. Usar a sincronização administrativa para membros anteriores sem gerar documentos duplicados.
8. Para um projeto com gestor e integrante: upload/consulta, edição permitida somente após concessão, revogação de sessão WOPI e vedação de acesso à pasta pessoal de outros participantes.
9. Validar PDF/imagens em download sem WOPI e os metadados de abertura/modificação; inspecionar os logs em caso de erros e executar `git diff --check`.

## Observações operacionais

- O pacote do projeto pode incluir `.env` herdado da origem. Não publique o arquivo integralmente em repositório público nem compartilhe segredos.
- O S3 permanece privado. Objetos gravados antes de um eventual rollback da transação PostgreSQL exigem reconciliação/limpeza de órfãos, assim como na fundação 05.1.
- A listagem de arquivos de uma pasta está atualmente limitada a 500 itens; acrescentar paginação quando o volume real justificar.
- Nenhum commit, push, merge nem mudança na `main` foram realizados pela implementação local.
