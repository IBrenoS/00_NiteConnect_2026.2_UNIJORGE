# Meus Arquivos Redesign Implementation Plan

> Execução inline nesta sessão, conforme solicitação direta do usuário.

**Goal:** Redesenhar `/documentos` como explorador responsivo integrado aos contratos documentais atuais, inclusive visão compartilhada, ações, busca, upload, detalhes e compartilhamento interno.

**Architecture:** Server Components continuam carregando dados autenticados no servidor. A página passa parâmetros de navegação à listagem; interações pontuais usam componentes client e Route Handlers restritos para manter bearer no servidor e permitir upload com progresso. As rotas de projetos e biblioteca institucional mantêm seu explorador atual.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript estrito, Tailwind CSS 4 e APIs Spring existentes.

**Spec:** Solicitação do usuário em 2026-11-13; contratos `docs/implementation/bloco-05-2-api.md` e `bloco-05-4-compartilhamento.md`.

## Global Constraints

- Preservar shell autenticado, identidade institucional e temas claro/escuro.
- Manter bearer exclusivamente no servidor e refletir autorização retornada pela API.
- Upload individual: 8 MiB; lote hierárquico: 100 itens e 32 MiB por requisição.
- Não inventar tipos, ações ou metadados que o backend não fornece.
- Preservar alterações preexistentes no workspace.

## Review Focus

- Upload de pasta acima de um ou mais limites — rejeitar antes do envio, permitir lotes independentes e informar resultados parciais.
- Visão compartilhada sem caminho privado — mostrar apenas a raiz concedida e descendentes autorizados.
- API negando uma operação — feedback específico sem sugerir sucesso.
- Tela estreita/tema escuro/teclado — manter conteúdo alcançável, foco visível e nomes acessíveis.
- Resposta de API incompatível ou indisponível — estado explícito sem dado fictício.

## Arquivos

- Modificar `apps/web/src/lib/documents/library.ts` para tipos e consultas paginadas/compartilhadas.
- Modificar `apps/web/src/app/(authenticated)/documentos/page.tsx` para o shell amplo e carregamento por contexto.
- Criar `apps/web/src/components/documents/my-files-explorer.tsx` para listagem, toolbar, seleção, menus, diálogos e painel de detalhes.
- Criar Route Handlers restritos em `apps/web/src/app/api/library/` para leitura/gestão autorizada e upload com sessão do servidor.
- Adicionar testes direcionados para parser/limites/seleção conforme a forma final da implementação.

## Tasks

- [x] Modelar contratos para listagem cursor, compartilhados, detalhes e atividade; validar parsers com testes direcionados.
- [x] Atualizar rota `/documentos` para alternar visão, navegar breadcrumbs e fornecer filtros/ordenação/paginação reais.
- [x] Implementar explorador em lista detalhada, estados, ações autorizadas, diálogos, responsividade e detalhes.
- [x] Integrar compartilhamento interno e upload com limites/progresso/resultados usando Route Handlers autenticados no servidor.
- [x] Revisar o diff e executar lint, typecheck e testes web relevantes; build de produção validado. Inspeção visual em navegador autenticado não foi executada nesta sessão.
