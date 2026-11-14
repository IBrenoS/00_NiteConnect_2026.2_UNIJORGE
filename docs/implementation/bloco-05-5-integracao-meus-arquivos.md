# NITE Connect — Integração de Meus Arquivos

**Base:** `main`, alterações locais preservadas; nenhum commit criado.  
**Escopo:** correções incrementais de integração da rota `/documentos` com APIs documentais e sincronização dos contratos existentes.

## Resultado técnico

- A criação de pastas volta a ser acionável na interface usando a Server Action e o endpoint existentes; a listagem é refeita após a navegação de retorno.
- O campo de nome da pasta envia o campo `name` que a Server Action espera. Sem esse atributo, o diálogo aparentava aceitar o nome, mas submetia a criação sem valor.
- A navegação entre “Meus arquivos” e “Compartilhado comigo” está visível. Pesquisa, filtro de MIME e ordenação são enviados ao servidor, inclusive na visão compartilhada. A API pessoal já aplica pesquisa/ordenação à lista de arquivos e pastas.
- A interface usa `effectivePermission` retornada por item. Ela não deriva mais edição da query string. `VIEW` não exibe operações de criação/upload; `EDIT` recebido numa pasta permite os fluxos de adição que o backend já autoriza. A autorização do servidor continua sendo a decisão final.
- Breadcrumbs usam ancestrais consultados sob autorização e não atravessam a fronteira pessoal sanitizada. O painel de detalhes mostra o caminho completo que a consulta autorizada permite revelar.
- O seletor de destino de movimentação percorre a árvore pessoal disponível, bloqueia a própria pasta e descendentes e falha fechado quando não consegue carregar destinos. Reutiliza o endpoint de listagem e não cria API nova.
- `/me/shared-with-me` remove itens cobertos por grant de pasta ancestral, filtra e ordena no servidor e usa cursor keyset vinculado aos filtros/ordenação. O item mantém ID e objeto documental original.
- O limite de requisição multipart foi elevado para 35 MB no Spring e no limite `serverActions` do Next.js, dando margem ao lote permitido de 32 MiB. O limite individual de 8 MiB e o limite de 100 itens permanecem.
- A revogação de grant remove somente locks WOPI associados ao destinatário revogado. Locks existentes sem `actor_id` permanecem, pois não é possível atribuí-los com segurança a uma sessão específica.

## Contratos e alterações

### API e banco

- Nova migration aditiva `V31__track_wopi_lock_owner.sql`: associa opcionalmente locks WOPI ao integrante que os adquiriu. Locks legados ficam com `actor_id = null`.
- `GET /api/v1/me/library` e `GET /api/v1/library/folders/{id}` aceitam `search`, `mimeType`, `sortBy`, `direction`, `cursor` e `limit`; o payload de pastas e arquivos pode incluir `effectivePermission` (`VIEW`/`EDIT`/`null`). Campo opcional preserva clientes antigos.
- `GET /api/v1/me/shared-with-me` aceita os mesmos filtros e ordenações e retorna metadados compatíveis com os detalhes: `createdAt`, `mimeType`, `size`, `createdByName`, `modifiedByName`, além dos campos existentes. O cursor deve ser reutilizado com os mesmos filtros e ordenação.
- Os métodos SQL de locks WOPI agora incluem o ator nas renovações, aquisições e liberações; revogação e rebaixamento restringem a limpeza ao ator da concessão.
- A rota legada de grants de edição e os contratos de upload, download, versões e WOPI não foram removidos.

### Frontend

- `/documentos` conecta criação de pasta, navegação compartilhada, pesquisa e filtros/ordenação remotos. A criação e uploads mantêm os fluxos existentes e atualizam a listagem via navegação/refresh.
- Contratos TypeScript aceitam, validam e consomem a permissão efetiva e os campos adicionais de itens compartilhados.
- Painel de detalhes cruza detalhes do arquivo/pasta com atividade e mostra proprietário, criador, última alteração, tamanho, datas, revisão e caminho autorizado.
- A pesquisa é submetida explicitamente; a URL preserva pasta, visão, filtros e ordenação. Mudanças de pesquisa descartam implicitamente qualquer cursor da página anterior.

## Matriz de aderência

| Lacuna verificada | Resultado |
|---|---|
| Criar pasta desabilitado apesar de API existente | Corrigido; usa a action existente e apresenta retorno da navegação |
| Campo de nome do diálogo não era enviado à Server Action | Corrigido com `name="name"`; a action recebe o nome digitado |
| Acesso a “Compartilhado comigo” ausente na navegação | Corrigido com navegação visível entre as duas visões |
| Ações inferiam permissão por parâmetro de URL | Corrigido; usa `effectivePermission` retornada pela API e backend autoriza cada mutação |
| Pesquisa não acionável pela interface | Corrigido; campo conectado aos parâmetros de busca já suportados no backend |
| Pesquisa/ordenação de pastas e itens recebidos apenas parcial/local | Corrigido no servidor para busca, MIME e ordenação suportada; páginas recebidas usam keyset |
| Duplicatas na raiz compartilhada por grant aninhado | Corrigido; grant coberto por ancestral não gera segunda entrada raiz |
| Cursor não refletia o filtro/ordenação | Corrigido; cursor contém a assinatura da consulta e rejeita reuso incompatível |
| Breadcrumb incompleto / detalhes sem localização hierárquica | Corrigido usando ancestrais autorizados; ancestrais privados não são buscados/mostrados |
| Destinos de movimento incompletos | Corrigido para percorrer a árvore pessoal acessível e impedir movimento para descendentes |
| Multipart de 11 MB menor que lote de 32 MiB | Ajustado para 35 MB, mantendo limites de arquivo/lote atuais |
| Revogação WOPI podia remover lock de outro editor | Corrigido com associação opcional `actor_id`, migration V31 e exclusão escopada |
| Metadados do painel e contrato compartilhado divergiam | Compatibilizados por campos opcionais persistidos |
| Histórico de atividade vs histórico de versões | Atividade continua disponível e paginada. A interface mostra a revisão atual; não há contrato implementado aqui para listar, comparar, baixar ou restaurar versões. Isso é capacidade separada e requer decisão funcional antes de ampliar o produto. |

## Validação e limites

- `apps/api`: `.\mvnw.cmd --batch-mode verify` — BUILD SUCCESS; 339 testes, 0 falhas, 0 erros e 0 ignorados. Testcontainers usou PostgreSQL 17; Flyway validou/aplicou V31. `DocumentLibraryTest` passou com 23 casos, incluindo autorização, upload hierárquico, pesquisa/ordenação, grants e preservação de lock WOPI de outro editor. `DocumentS3IntegrationTest` passou com SeaweedFS em container.
- `apps/web`: `npm test` — 260 testes em 61 arquivos; `npm run lint` — sem erros; `npm run typecheck` — sem erros; `npm run build` — compilação otimizada e geração das rotas concluídas. Testes, lint, typecheck e build foram executados após a correção do campo `name`.
- `git diff --check` passou após a correção final.

Testes unitários/integração de aplicação não equivalem à homologação da instância S3 institucional, do proxy de produção ou de edição real no Collabora. O teste de multipart exercita upload hierárquico no endpoint com dados de teste, mas não envia um payload HTTP de 32 MiB através do proxy implantado.

## Pendências conhecidas

- Verificar o limite de corpo do proxy/reverse proxy real: nenhum limite de proxy aplicável foi localizado na configuração deste workspace. O limite configurado na aplicação não prevalece sobre um proxy com limite menor.
- Homologar upload no ambiente implantado, incluindo overhead multipart e lote próximo a 32 MiB.
- Homologar revogação durante edição real no Collabora. Testes de WOPI em MockMvc cobrem isolamento do lock, mas não ciclo de vida de sessão do Collabora.
- Locks legados com `actor_id = null` não são removidos automaticamente durante revogação, para evitar liberar lock de editor ainda autorizado. Expiram pelo mecanismo atual; não há atribuição retrospectiva segura.
- A listagem e o carregamento da árvore de destino pessoal ficam sujeitos ao teto de 2.000 nós no cliente. Para acervos acima disso, uma API paginada de destinos pode ser necessária.
- O relatório de auditoria frontend–backend mencionado no pedido não foi localizado como artefato dedicado neste checkout; as correções foram guiadas pelos contratos e código atuais e pelos documentos de implementação do bloco documental.

## Auditoria operacional da página em 2026-11-14

A rota autenticada foi inspecionada no Brave nas visões pessoais, de pasta e “Compartilhado comigo”. A inspeção foi somente de leitura; nenhum item real foi criado, alterado, compartilhado ou arquivado durante a navegação.

| Capacidade visível | Integração e resultado |
|---|---|
| Navegar por Meus arquivos e Compartilhado comigo | `GET /api/v1/me/library`, `GET /api/v1/me/shared-with-me` e `GET /api/v1/library/folders/{id}`; breadcrumbs usam ancestrais autorizados |
| Criar pasta, carregar arquivos/pasta e copiar modelo | Server Actions e upload hierárquico existentes; API valida autorização, formatos, tamanho e colisões |
| Pesquisar, filtrar, ordenar, paginar e escolher layout | Pesquisa, MIME, ordenação e cursor são enviados ao servidor; layout é preferência local de apresentação |
| Abrir/baixar e editar DOCX | Download autenticado e WOPI/Collabora existentes; `VIEW` não abre edição e `EDIT` segue revalidado pela API |
| Consultar detalhes e atividade | Detalhe de arquivo, listagem da pasta e atividade paginada em endpoints autorizados; atividade e versões permanecem contratos distintos |
| Renomear e mover | Server Actions chamam os endpoints atuais; lista de destinos pessoais e validações de hierarquia permanecem ativas |
| Compartilhar, alterar e revogar acessos | Grants internos `VIEW`/`EDIT`; destinatários e descendentes continuam sujeitos à autorização existente |
| Copiar link | Implementado como URL interna autenticada de pasta ou download. O link não concede acesso e não altera permissões |
| Arquivar item | A barra e o menu contextual agora chamam as Server Actions existentes. A interface expõe a ação em Meus Arquivos somente a `COORDENADOR` e `GESTOR_GERAL`; integrante comum e itens recebidos não recebem a ação. A API continua sendo a autoridade. Arquivar pasta confirma e inclui seus descendentes; o arquivamento é lógico e restaurável na Biblioteca do NITE |
| Feedback de mutações | Sucesso das Server Actions redireciona com `saved=1`, que agora é apresentado na página; conflitos e negações continuam com estado de erro |
| Excel/PowerPoint, links públicos, solicitar arquivos, favoritos, cópia genérica/duplicação, download ZIP de pastas e automações | Permanecem indisponíveis. Excel/PowerPoint estão fora dos formatos aceitos atuais. Links públicos não fazem parte da regra de compartilhamento; os demais controles não têm contrato/regra funcional aprovados. Não foram criados endpoints ou tabelas apenas para habilitar placeholders |

### Validação incremental desta auditoria

- `apps/api`: `.\mvnw.cmd --batch-mode -Dtest=DocumentLibraryTest test` — BUILD SUCCESS; 24 testes passaram em PostgreSQL 17 via Testcontainers, Flyway aplicou V31 no banco efêmero. Inclui cenário novo negando arquivamento de arquivo e pasta por integrante.
- `apps/web`: `npm test -- src/components/documents/my-files-explorer.test.tsx src/lib/documents/library-actions.test.ts` — 14 testes passaram; `npm run test` — 268 testes em 62 arquivos passaram; `npm run lint` — passou; `npm run typecheck` — passou; `npm run build` — compilação otimizada, typecheck interno e geração das rotas concluídos.
- A navegação real no Brave confirmou que a rota autenticada carregou a listagem local e que “Compartilhado comigo” respondeu sem dados compartilhados. As Server Actions foram verificadas com mocks e o backend com Testcontainers; nenhum fluxo mutável foi executado contra os dados locais do navegador nesta auditoria.
- Não houve alteração de endpoint backend ou migration nesta etapa. As lacunas encontradas eram ligação de UI, feedback de sucesso, UX de link interno e cobertura de autorização já implementada no serviço.

### Pendências após a auditoria

- O backend não oferece download ZIP de pastas nem seleção em lote para arquivamento/organização. A página limita essas ações a item único onde aplicável.
- Favoritos, cópia documental genérica, pedidos de envio de arquivos e automações exigem decisões funcionais e contratos próprios; continuam desabilitados.
- Upload através do proxy implantado, S3 institucional e edição/revogação em sessão real do Collabora ainda dependem de homologação externa descrita acima.
