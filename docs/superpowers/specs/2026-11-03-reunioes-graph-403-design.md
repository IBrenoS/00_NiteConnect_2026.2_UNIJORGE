# Reuniões — página 403 para autorização Microsoft Graph

## Intenção

Exibir uma página institucional fiel à referência quando o NITE Connect confirmar `403 OBO_CONSENT_REQUIRED`. A mesma condição encaminha para essa página as ações Iniciar reunião, Agendar, Entrar no Teams e Compartilhar pelo WhatsApp. O objetivo é deixar claro que essas ações estão suspensas até a autorização institucional ser validada.

## Objetivos

- Construir a interface com HTML, CSS e SVG vetorial; não usar a captura de referência como arte de fundo.
- Reutilizar a sessão autenticada, a ação de capabilities e o endpoint Graph já existentes.
- Mostrar `Código: 403 · OBO_CONSENT_REQUIRED` apenas quando esse código vier da API.
- Fazer “Verificar novamente” consultar capabilities sem reutilizar o cache de cinco minutos, atualizar o cache e distinguir autorização pendente, sucesso confirmado e indisponibilidade.
- Retornar a `/reunioes` sem iniciar a criação automaticamente.
- Preservar o comportamento real dos demais erros e das ações não listadas.
- Implementar temas claro/escuro, acessibilidade, redução de movimento e layout responsivo.

## Abordagens consideradas

1. **Rota isolada autenticada (`/reunioes/erro-403`) — recomendada.** Fora do layout que inclui a navegação, mas protegida pelo mesmo `requireAuthenticatedNiteSession()` e envolvida pelo `ThemeProvider` raiz. Atende à composição sem sidebar e evita alterações no shell compartilhado.
2. **Rota dentro do shell com ocultação condicional da navegação.** Reutiliza o grupo autenticado, mas acopla o shell a uma rota de erro e altera um layout compartilhado para resolver uma página específica.
3. **Modal sobre Reuniões.** Evita uma rota dedicada, mas não reproduz a página sem sidebar e conflita com o retorno explícito para `/reunioes`.

A primeira abordagem é a única que preserva ao mesmo tempo a sessão atual, a composição visual e o contrato de navegação definidos no pedido.

## Escopo decidido

- A decisão mais recente do usuário substitui, para `Entrar no Teams` e `Compartilhar pelo WhatsApp`, o requisito anterior que mandava manter essas ações sempre independentes da autorização Graph.
- A API atual de join usa uma URL Teams persistida e a de share produz uma URL interna; ambas são independentes de Graph/OBO. Mesmo assim, enquanto capabilities confirmar exatamente `OBO_CONSENT_REQUIRED`, essas duas ações serão bloqueadas no frontend e encaminhadas à página. Isso é uma trava de produto deliberada e também impede temporariamente o acesso a links históricos válidos.
- `OBO_ADMIN_APPROVAL_REQUIRED`, outros códigos 403, HTTP 200 com capabilities indisponíveis, respostas inválidas, timeout e falhas de rede não serão rotulados como `OBO_CONSENT_REQUIRED`.
- Falhas reais de join ou share continuarão mostrando o erro correspondente; a página 403 não será fallback genérico.
- Não alterar permissões/credenciais Entra, backend Graph/OBO, esquema, infraestrutura nem contratos de persistência.

## Integração e estados

- Capacidades são consultadas pelo endpoint autenticado existente. O bearer permanece no servidor.
- Ao abrir `/reunioes/erro-403`, executar uma consulta autenticada de capabilities e só apresentar o erro 403/código se a resposta atual for exatamente `403 OBO_CONSENT_REQUIRED`. Essa também é a proteção para acesso direto à URL; não confiar em query string como prova do erro. A chamada extra ao entrar na rota é uma escolha de implementação para preservar a veracidade da identificação.
- Cache de disponibilidade continua por sessão e com validade máxima de cinco minutos. O recheck explícito ignora o cache e grava a resposta nova.
- Somente o código exato `OBO_CONSENT_REQUIRED` aciona a página a partir das quatro ações de Reuniões.
- A resposta só indica Graph disponível quando o contrato da API for válido e `supportsTeamsForBusiness` for `true`.
- Se o recheck confirmar disponibilidade, atualizar o cache e navegar para `/reunioes`. Não abrir formulário ou criar encontro automaticamente.
- Se o recheck retornar o mesmo 403, permanecer na página com “A autorização institucional ainda está pendente.”
- Se retornar indisponibilidade, erro de configuração, sessão expirada ou resposta inválida, exibir o estado específico; não confundir com falta de autorização.
- Desabilitar o botão durante o recheck, usar o timeout existente e expor carregamento/feedback com semântica acessível.

## Direção visual

- Canvas centralizado de tela inteira, sem sidebar, dashboard ou cartão envolvendo o conteúdo.
- Gradientes marinho discretos no tema escuro e equivalente claro; elementos curvos suaves nos cantos.
- Marca NITE Connect no alto à esquerda; tipografia Sora/Geist existente.
- Ilustração SVG com câmera, linha interrompida e X luminoso moderado, e globo com marca Microsoft. O SVG mantém leitura e proporção em desktop e mobile.
- Título, texto, identificador técnico, botões e nota inferior seguem a hierarquia e o conteúdo aprovados. Botões ficam lado a lado quando houver espaço e empilham no mobile.
- Sem animação decorativa; indicador de recheck respeita `prefers-reduced-motion`.

## Conteúdo aprovado

- Identificação: **Erro 403**.
- Título: **A conexão com o Microsoft 365 ainda não foi autorizada**.
- Descrição: “A criação e o gerenciamento automáticos das reuniões dependem de autorização institucional. Enquanto isso, você ainda pode consultar convites, histórico e detalhes já disponíveis no NITE Connect.”
- Código técnico: **Código: 403 · OBO_CONSENT_REQUIRED**, somente após resposta atual com status 403 e esse código.
- Nota complementar: “Quando a autorização for concedida, o fluxo completo de Reuniões poderá ser habilitado após a validação da integração.”
- Ações: **Voltar para Reuniões** e **Verificar novamente**.

## Validação prevista

- Testes direcionados para contrato de capabilities, código OBO exato, cache/refresh, navegação dos quatro CTAs, recheck indisponível/disponível e ausência de criação durante o recheck.
- Cobrir navegação histórica válida quando não houver estado conhecido `OBO_CONSENT_REQUIRED`, além de erros reais de join/share.
- Lint, typecheck, suíte web solicitada e build conforme aplicabilidade do estado final.
- Capturas em 320, 360, 768, 1024 e 1440 px, em Light e Dark; comparar composição com a referência.
- Testes sintéticos não serão descritos como prova do tenant Microsoft real.

## Riscos e decisões deixadas à implementação

- A trava de produto para join/share bloqueia caminhos que o backend consegue executar sem Graph; quando a autorização for regularizada, uma nova verificação deve atualizar o estado e restaurar esses CTAs.
- A página e o status precisam transportar o código real da API sem confiar apenas em texto ou status HTTP genérico.
- Implementação deve encaixar-se no estado de trabalho preexistente e preservar alterações já presentes no repositório.
- Detalhes internos de SVG, pontos de quebra e mensagens para condições técnicas além do texto aprovado ficam a cargo do implementador, desde que não alterem contratos nem inventem causas.
