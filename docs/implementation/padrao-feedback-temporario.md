# Feedback temporário de operações

Os retornos informativos existentes de ações usam `TransientFeedback`, em `apps/web/src/components/ui/transient-feedback.tsx`. Não foram criadas notificações para fluxos que não tinham retorno visual.

## Comportamento comum

- Sucesso, erro e aviso de resultado: seis segundos visíveis e saída suave de 250 ms, reduzindo opacidade e recolhendo o espaço ocupado.
- Mouse sobre o aviso ou foco dentro dele pausa a contagem restante para leitura. Ao sair, a contagem continua.
- A preferência `prefers-reduced-motion` remove a animação.
- O conteúdo e a semântica acessível originais são preservados. Durante a saída, o aviso deixa de ser anunciado e de aceitar interação.
- O ciclo é cancelado ao desmontar. Nenhum registro de negócio é alterado pelo desaparecimento da mensagem.
- Para flash vindo da URL, `queryParam` remove somente o parâmetro cujo valor ainda corresponde à mensagem. Outros filtros, paginação e hash são preservados; não é feito refresh.
- `onDismiss` permite limpar estado local para mensagens repetidas; `occurrenceKey` recebe um objeto estável da resposta/props de servidor ou resultado de ação quando uma nova operação pode retornar o mesmo texto. Não se usa a identidade de JSX recém-criado para reiniciar o contador.

Estados estruturais continuam visíveis enquanto necessários: carregamento/progresso, indisponibilidade da consulta/página, ausência de acesso ou registros, instruções de câmera e validação de campo ainda inválido. Confirmações de exclusão não são fechadas automaticamente.

## Cobertura

Aplicado aos feedbacks existentes em atividades/planejamentos, editor de tasks, Meus Arquivos/Lixeira e seus formulários/diálogos, biblioteca, reuniões, frequência/presença/QR, erro de entrada institucional e retornos interativos do laboratório de componentes. Componentes de estados de consulta e exemplos estáticos do catálogo continuam representando estados persistentes.

O mesmo erro do editor de tarefa é renderizado apenas no contexto ativo (editor ou diálogo de exclusão), impedindo que um timer oculto apague a mensagem que o usuário está lendo no modal. Confirmar presença continua mantendo o estado de operação concluída após o aviso desaparecer; a expiração não reabilita submissão duplicada.

## Validação

- Testes do ciclo com timers controlados cobrem duração mínima, saída, pausa por mouse/foco, desmontagem, mensagens repetidas, estabilidade durante renders do pai e limpeza seletiva da URL.
- Testes direcionados dos módulos foram executados; a suíte ampla do frontend passou com 74 arquivos e 329 testes.
- Após o ajuste final dos resultados de confirmação de presença, foram executados os testes direcionados pertinentes e typecheck/build novamente. Os demais resultados permanecem válidos, pois a mudança final só passa a identidade do resultado ao componente compartilhado.
- Lint e `git diff --check` aprovados.
- Na sessão autenticada real, os feedbacks existentes de sucesso e erro foram exercitados por seus códigos de URL em Minhas Atividades, sem executar exclusões ou simular falha do backend. Ambos desapareceram automaticamente, preservando `page=0`. Após recarregar, o aviso expirado não reapareceu.
- Não foram repetidos testes backend ou migrations: a mudança é exclusivamente de apresentação/lifecycle no frontend.

Alterações locais anteriores foram preservadas; sem dependências novas ou commit.
