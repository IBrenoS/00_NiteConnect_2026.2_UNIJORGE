# Bloco 08.4B-3 — Documentos dos projetos

Reutilizar MyFilesExplorer e TrashExplorer com contexto opcional, preservando os modos existentes. Rotas: workspace /documentos, /lixeira e /aprovacoes; legado /projetos/id/arquivos redireciona ao workspace.

- [ ] Explorer contextual: mesmas seleção/menus/pastas/upload/management, links/paginações locais e DOCX no editor existente.
- [ ] Loaders e proxies: listing/search/filter/sort/cursor/context, ancestrais sem ultrapassar raiz PROJECT; retorno e revalidação de ações; upload restrito ao destino contextual.
- [ ] Lixeira e aprovação: endpoints PROJECT existentes; capabilities; gestor solicita e administração decide; lista pendente filtrada e paginada pelo backend. Sem habilitar descarte operacional.
- [ ] Editor mantém WOPI/Collabora e oferece retorno seguro ao acervo de origem; só formatos suportados anunciados.
- [ ] Testes frontend/backend, lint/typecheck/build; backend PostgreSQL real; homologação institucional/storage/Collabora e capturas com limites explícitos.

Sem novas dependências, alteração de .env, commit, reconstrução do explorador ou mudança de regras/políticas. Main autorizada anteriormente, alterações locais preservadas.
