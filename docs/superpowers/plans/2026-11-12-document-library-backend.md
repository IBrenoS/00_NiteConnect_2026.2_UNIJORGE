# Consolidação do Backend de Meus Arquivos — Plano

> Execução nativa nesta sessão, conforme pedido explícito do usuário para implementar no workspace atual.

**Goal:** completar as operações e consultas documentais necessárias à interface Meus Arquivos, preservando autorização contextual, IDs, versões e objetos atuais.

**Architecture:** evoluir o módulo `documents` e suas tabelas/repositórios existentes. Usar migração Flyway aditiva para documentos legados, validação no serviço, operações SQL paginadas e endpoints novos aditivos. Compensar objetos S3 quando persistência falhar.

**Tech Stack:** Java 21, Spring Boot, PostgreSQL, Flyway, S3 compatível, MockMvc/Testcontainers, Collabora/WOPI existente.

**Spec:** pedido do usuário; `docs/implementation/bloco-05-2-api.md`; especificação funcional consolidada v1.0.

## Restrições globais

- Não modificar V1–V28 nem UUIDs/versões documentais históricos.
- A autorização deve ocorrer no backend e respeitar integrante, administrador e projeto.
- Preservar DOCX/PDF/PNG/JPEG e máximo de 8 MiB por arquivo.
- Não expor links públicos de S3, nem inventar visibilidade compartilhada.
- Manter compatibilidade aditiva com contratos existentes.

## Foco de revisão

- Movimento explícito para raiz não pode mudar PERSONAL/PROJECT/ADMINISTRATIVE; teste HTTP de conflito.
- Integrante pode organizar somente suas pastas/documentos e nunca arquivar; teste de isolamento cruzado.
- Migração deve manter documentos de integrantes inativos e metadados; teste de migração.
- Ordenação/cursor deve ser estável em empates e filtros não podem furar autorização; testes HTTP.
- Falha parcial de upload não pode persistir registro inconsistente nem deixar objeto órfão sem tentativa de compensação; teste do fluxo de erro.

## Fases

1. Regressões de autorização/movimentação e permissões pessoais, com testes antes do código.
2. Migração V29 para provisionamento histórico e provisionamento em lotes idempotentes.
3. Listagem paginada com busca/filtros/ordenação determinística e metadados compatíveis.
4. Detalhe e histórico autorizados para pastas/documentos.
5. Upload hierárquico/múltiplo com limites existentes e compensação de falhas PostgreSQL/S3.
6. Documentação de contratos/matriz de aderência; validação de API, migração e estado final do workspace.

## Situação inicial verificada

- Workspace limpo em `main`, `c2161cc`; não há alterações da branch `feature/bloco-05-2-biblioteca` no working tree.
- V28 provisiona pastas pessoais apenas para `status='ATIVO'`.
- `files(folder)` aplica `LIMIT 500`; metadados da listagem não incluem criação, autor UUID, modificador UUID nem pasta pai.
- Eventos de documento/pasta já existem e são imutáveis, mas não têm endpoint de leitura.
- Upload unitário já preserva validação de formatos e máximo de 8 MiB.
