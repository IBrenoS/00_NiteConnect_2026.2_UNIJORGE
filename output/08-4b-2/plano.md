# Bloco 08.4B-2 — Plano de integração

Objetivo: consumir V42/V43 mantendo a apresentação refinada e o backend como autoridade de permissões.

Arquitetura: Server Components carregam respostas validadas e passam somente projeções serializáveis. Server Actions autenticadas executam mutações e invalidam as perspectivas afetadas. Os componentes e handlers canônicos do Bloco 08.3 são reutilizados no contexto do projeto. Documentos permanece temporário, com avisos apenas nessa área.

- [ ] Transportes e parsers estritos: catálogo, workspace, equipe, pedidos e interesses; testes de payload inválido, acesso e concorrência.
- [ ] Extensões aditivas comprovadas de backend: resumo público por ID, interesses próprios, nomes autorizados de solicitantes, capacidades contextuais coerentes; testes em PostgreSQL efêmero real.
- [ ] Catálogo/apresentação e Meus Projetos: consultas, filtros, paginação, participação e acompanhamento reais sem mistura entre administração e vínculo.
- [ ] Visão geral/equipe: dados autorizados, indicadores reais, responsabilidades e decisões; nenhum objetivo/próximo passo inventado.
- [ ] Planejamentos/tasks: reutilizar workspace/editor/movimentação/exclusão existentes e manter IDs canônicos, expectedVersion e projectId.
- [ ] Validar lint, typecheck, testes frontend/backend e build; homologar sessão disponível com API/PostgreSQL locais e evidências de recarga/persistência. Distinguir JWT simulado dos testes e navegador autenticado real.

Restrições: sem commit; preservar alterações do 08.4B-1 e next-env.d.ts; sem mudanças documentais, credenciais, migrations ou infraestrutura. Nenhuma exclusão de dados reais para preparar a homologação.
