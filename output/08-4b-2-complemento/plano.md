# Complemento: criação e administração de projetos

Escopo aprovado: Novo projeto no catálogo; detalhe após criação; administração contextual de dados, situação, disponibilidade, liderança e equipe com versões/motivos. Sem novos contratos, migrations, dependências ou commit.

Decisão de implementação: rotas /projetos/novo e /projetos/[id]/administrar, componentes e estilos existentes. Autoridade global consultada em GET /me; gestão contextual em workspace. Estado inicial somente backend. Históricos existentes de situação, participação e liderança; edição preserva auditoria backend.

- [x] Testes de ações: autoridade efetiva, validação, versões, erros, revalidação e respostas mínimas.
- [x] Parsers/loaders dos contratos administrativos existentes, sem dados privados no catálogo.
- [x] Formulário de criação e área administrativa, links condicionais e estados completos.
- [x] Testes backend PostgreSQL: dois perfis globais, integrante negado, criação sem vínculo/líder, atualização/auditoria, transições, disponibilidade e concorrência.
- [x] Lint/typecheck/test/build e homologação autenticada local com capturas e persistência.
