# 08.4B-2 — Complemento de criação e administração

Implementado em 18/11/2026, sem commit. Núcleo → Projetos oferece criação a coordenadores/gestores gerais ativos confirmados em GET /me; a API mantém PLANEJAMENTO, ingresso fechado e nenhum vínculo/liderança automático. Após criação abre o detalhe. Administração contextual acessível no detalhe/workspace integra edição, situação, ingresso, equipe e liderança, com versões, motivos e revalidação das consultas.

São reutilizados POST/PATCH /projects, PATCH /status e /availability, busca /member-candidates com query explícita, /members, /leadership-transfers e os três históricos existentes. Nenhum contrato, serviço de produção, migration ou dependência foi alterado neste complemento. Os dados cadastrais editados continuam auditados no backend; a tela consulta históricos de situações, participações e liderança, sem ampliar leitura da auditoria global.

Validação: lint/typecheck/build aprovados após ajustes finais; 27 testes direcionados finais. Suíte anterior de 417 testes frontend mantida para o código não afetado. Backend: 21 testes aprovados inicialmente e um teste novo corrigido e aprovado isoladamente, total de 22 cenários distintos. PostgreSQL real via Testcontainers; identidades/JWT de teste. Homologação adicional com sessão institucional de Gestão Geral, API Docker e PostgreSQL local: cadastro, edição, datas, pausa/retomada, participação e liderança explícitas, abertura/fechamento e persistência. Duas telas novas em claro/escuro e desktop/mobile sem overflow de página nas medições.

O registro identificado de teste permanece local: d298180f-939f-493b-9960-d4b2fd24d640, ATIVO, versão 9, ingresso aberto. Perfis distintos e negativas foram homologados automaticamente; não houve troca manual para coordenador/integrante comum.

[Relatório detalhado, comandos e limitações](../../output/08-4b-2-complemento/README.md) · [Capturas](../../output/08-4b-2-complemento/capturas.html) · [Arquivos alterados](../../output/08-4b-2-complemento/arquivos.txt) · [Persistência e auditoria](../../output/08-4b-2-complemento/persistencia-postgres.json)
