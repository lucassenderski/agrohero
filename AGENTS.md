# AGENTS.md — contexto do projeto AgroHero

Marketplace de produtos orgânicos que conecta agricultores familiares a consumidores.
Monorepo: `backend/` (Express + PostgreSQL) e `frontend/` (React + Vite).

## Como rodar

O Docker precisa estar no ar; em alguns ambientes o daemon cai entre sessões:

```bash
sudo dockerd > /tmp/dockerd.log 2>&1 &   # se necessário
cd /workspace/project && sudo docker compose up -d
```

Depois:

```bash
cd backend && npm run migrate && npm run seed && npm run dev   # porta 3001
cd frontend && npm run dev                                     # porta 5173
```

O PostgreSQL é publicado na **porta 5433** (não 5432) para não conflitar com instalações locais.

## Comandos

| Comando | Onde | O que faz |
|---|---|---|
| `npm run migrate` | backend | Aplica migrations pendentes (idempotente) |
| `npm run seed` | backend | Categorias + admin (idempotente) |
| `npm test` | backend | Testes de integração (recriam o schema do zero) |
| `npm run dev` | backend | API com reload |
| `npm run dev` / `build` | frontend | Vite |

## Ambiente descartável — atenção

O sandbox pode reiniciar entre sessões e **o banco perde os dados**. O código é a fonte de verdade: recrie o ambiente com `npm run migrate && npm run seed`. Nada é perdido, porque tudo vem de migration versionada.

## Convenções que não devem ser quebradas

**Idioma.** Tudo em português: nomes de tabelas, colunas, variáveis, funções, mensagens de erro e comentários. Comentários são escritos sem acento (e sem caracteres especiais) para evitar problemas de encoding; strings de interface e mensagens ao usuário usam acentuação normal.

**Comentários.** Comentar apenas o que é não óbvio: decisões de segurança, invariantes, por que uma alternativa foi descartada. Não narrar o código, não descrever histórico de mudanças.

**Validação.** Schemas Zod em `src/utils/validacao.js` (reutilizáveis) e por módulo. Controller lê `req.dadosValidados`, nunca `req.body`.

**Erros.** `AppError(mensagem, status, codigo)`. Erros de validação saem como `400` com `detalhes: [{ campo, mensagem }]`.

**SQL.** Sempre parametrizado. Ordenação por lista branca via `resolverOrdenacao()`.

**Autorização.** O proprietário de um recurso é sempre resolvido a partir do **token**, nunca do corpo ou do parâmetro da requisição. É a defesa central contra IDOR.

## Arquitetura

```
src/
├── config/       env.js (validado com Zod), logger.js
├── controllers/  recebem req/res, sem SQL
├── middlewares/  checkJwt, requireRole, validar, errorHandler, rateLimit
├── repositories/ SQL parametrizado (estende RepositorioBase)
├── routes/       rotas e ordem dos middlewares
├── services/     regras de negócio
├── database/     pool.js, migrations/, seeds/, run-migrations.js
├── docs/         openapi.js
└── utils/        AppError, validacao, paginacao, senha, resposta
```

Fluxo de uma requisição: `rota → middleware (auth → autorização → validação) → controller → service → repository → PostgreSQL`.

## Banco de dados

11 tabelas de negócio. Decisões que afetam o código:

- **`pedido_itens.status` é por item**, e `pedidos.status` é derivado por trigger. Um agricultor altera só os itens dele (`WHERE agricultor_id = ...`), que é a regra multi-agricultor.
- **`pedido_itens.agricultor_id` é denormalizado** de propósito, para a checagem de posse não depender de JOIN.
- **Preços congelados** em `pedido_itens.preco_unitario` e `carrinho_itens` **não guarda preço** — o valor oficial é lido de `produtos` no checkout.
- **`pedido.endereco_entrega` é JSONB** (snapshot), não FK.
- Constraints no banco são a última linha de defesa (preço > 0, subtotal coerente, etc.), mesmo que o service valide antes.
- `pagamentos` não tem nenhuma coluna de cartão, por decisão de segurança.

## Documentação

- `/api/v1/docs` — Swagger UI. Em produção vem desativada (`ENABLE_API_DOCS`).
- A especificação documenta **apenas rotas implementadas**, e há teste que garante isso.
- Ao implementar uma rota, adicione-a em `src/docs/openapi.js`, no README do backend e na tabela de API do README da raiz.

## Testes

Sempre com banco real — sem mocks. `tests/helpers/banco.js` recria o schema e cria cenários. Cobrir caminhos negativos (IDOR, permissão, valores inválidos), não só o caso feliz.

## Segurança — checklist por fase

- IDOR: proprietário vem do token
- Role: `requireRole` em toda rota sensível
- Preço/quantidade/estoque recalculados no servidor
- SQL parametrizado
- Nada de segredo no código; `.env` fora do Git
- Log não registra senha, token ou dados de cartão

## Estado

Fases 0–13 concluídas (estrutura, banco, backend base, usuários, autenticação JWT, agricultores, categorias, produtos, busca e filtros, carrinho, endereços, checkout transacional, pedidos com transição de status e a regra multi-agricultor, webhooks de pagamento com assinatura HMAC e estorno no cancelamento). Próxima: FASE 14 (avaliações).
Divergências encontradas no ambiente (ex.: container de banco caído) foram diagnosticadas e resolvidas, não contornadas.
Suíte de testes: 464 testes, 15 suítes, todos passando.

## Armadilhas já encontradas (não repetir)

**Zod descarta campo não declarado, em silêncio.** Um campo ausente do schema é removido sem erro. Foi a causa de um bug: `perfilAgricultorSchema` não declarava `cidade`/`estado`, então o perfil do produtor era gravado sem localização. Ao adicionar campo a um objeto aninhado, conferir se o schema o declara.

**Teste que passa por motivo errado.** O teste do bug acima passava porque o payload duplicava `cidade` no nível de cima, e o fallback do service mascarava o campo perdido. Um teste só tem valor depois de verificado que FALHA sem a correção. Ao corrigir bug, rodar o teste com a correção revertida e confirmar que ele quebra.

**`npx jest` direto não carrega a config ESM.** Usar `npm test` (script do projeto), que aplica `NODE_ENV=test` e a config de `package.json`.

**`kill` sem permissão não encerra o processo.** Um servidor antigo na 3001 fez um teste manual usar código desatualizado e parecer que a correção não funcionou. Conferir `ps aux | grep server.js` antes de concluir que uma correção falhou.

**`prepararSchema()` é obrigatório em suíte de integração nova.** Sem ele a suíte roda contra schema ausente ou desatualizado.

**Docker/PostgreSQL caem quando o sandbox reinicia.** Subir com `sudo -n dockerd` e `docker compose up -d`; recriar `agrohero_test` se faltar.

**O driver `pg` devolve `bigint` e `numeric` como string.** `count(*)` chega como `"0"`, não `0`, e `total === 0` é falso. Converter na view (`::int`, `::float`) resolve para todos os consumidores de uma vez. Vale para qualquer coluna agregada nova.

**`CREATE OR REPLACE VIEW` não muda o tipo de uma coluna existente.** O PostgreSQL responde `cannot change data type of view column`. Quando o tipo muda, a migration precisa de `DROP VIEW` antes do `CREATE`.

**`git checkout <arquivo>` nao restaura arquivo NOVO (untracked).** Ao testar "o teste pega este bug?" revertendo uma correcao, use `cp` para um backup antes e restaure com `cp`. O `git checkout` so funciona em arquivo ja versionado - e falha em silencio para untracked, deixando a modificacao de teste no codigo. Isso ja causou duas falhas na suite completa que nao apareciam na suite isolada.

**Falha que aparece so na suite completa indica estado residual.** Se um teste passa isolado e falha no `npm test` inteiro, a causa quase sempre e uma modificacao de codigo que nao foi restaurada - nao interferencia entre suites.

**Modificador `router.use()` no agregador erra o prefixo.** Montar um router que declara `'/'` e `'/:id'` em `/admin` registra `/admin/:id`, e nao `/admin/categorias/:id`. Quando o modulo tem nome proprio, o agregador deve montar em `/admin/<nome>` e o router do modulo usa caminhos relativos. Conferir as rotas registradas com um script que percorre `app._router.stack` antes de escrever os testes - o 404 que aparece depois e mais dificil de diagnosticar.

**Rota publica e rota administrativa precisam de schemas de query DIFERENTES.** Como o Zod descarta campo nao declarado, usar por engano o schema do admin numa rota publica abre a brecha em silencio: o parametro passa a valer e o visitante ve dado que deveria estar oculto. O teste da Fase 7 que envia `?incluir_inativa=true` para a rota publica existe exatamente para travar isso.

**`z.enum().optional().transform()` sem `.default()` devolve `false` para ausente.** `undefined === 'true'` e `false`, e o parametro perde o efeito para quem nao o envia. Quando o padrao importa (ex.: admin que deve ver inativas), declarar `.default('true')` ANTES do transform.

**A mesma regra de visibilidade precisa valer em toda leitura publica (FASE 6).** A listagem filtrava `agricultores.ativo` E `usuarios.ativo`, mas o detalhe checava so o primeiro - um produtor com login bloqueado sumia da lista e continuava acessivel por URL direta. Centralizado em `estaVisivelPublicamente`. Na FASE 7 o mesmo vale para produtos: `VISIVEL_PUBLICO` inclui `c.ativo = TRUE`, senao desativar uma categoria nao tiraria os produtos dela do marketplace. Toda consulta publica nova deve reusar a constante, nao reescrever a condicao.

**Toda consulta com `count(*)` precisa dos MESMOS JOINs da consulta de itens.** Na FASE 7 o `count` da vitrine nao tinha o `JOIN categorias` que a condicao de visibilidade passou a exigir, e a query quebrava com "column c.ativo does not exist". Sempre que adicionar uma condicao que referencia um alias, conferir se a query de contagem tambem faz o JOIN correspondente.

**O service precisa TRADUZIR os filtros da query (snake_case) para o repositorio (camelCase).** Na FASE 8 eu passei `...filtros` direto para `produtoRepository.listarPublicos`. Como o repositorio desestrutura `categoriaId`/`precoMin`, os nomes `categoria_id`/`preco_min` viravam `undefined`, a condicao SQL nao era adicionada e a API devolvia a lista inteira como se nenhum filtro tivesse sido pedido - sem erro, sem log, sem sintoma. Falha silenciosa: o teste que so checa "retorna 200" nao pega. Por isso existe um teste por filtro, cada um esperando um total DIFERENTE do total sem filtro. O `agricultorService` ja fazia esse mapeamento; ao criar um modulo novo, copiar o padrao em vez de passar o objeto direto.

**Tipos de retorno do banco sao uma decisao do projeto, nao um detalhe.** `pool.js` registra um parser que converte NUMERIC em `Number` (comentado no arquivo). Escrevi `expect(preco).toBe('4.50')` supondo string e o teste falhou - o valor era `4.5`. Antes de escrever assercao sobre coluna NUMERIC/date, conferir o parser em `src/database/pool.js`.

**Rota literal precisa ser declarada ANTES da rota com parametro.** `GET /produtos/meus` tem de vir antes de `GET /produtos/:id`, senao "meus" e capturado como id, falha na validacao de inteiro e devolve 400 - erro que parece bug de validacao quando e ordem de declaracao. Vale para qualquer rota literal sob um prefixo que tambem tem `/:id`.

**Numero do placeholder `$n` e posicional e deve ser derivado do tamanho da lista de parametros.** Montar filtros dinamicos com `parametros.push(valor); filtros.push(\`col = $${parametros.length}\`)` mantem os dois sempre alinhados. Concatenar SQL com valores interpolados e o caminho para injecao; valores so entram via array de parametros.

**Helper duplicado entre repositorios divergem.** `escaparTermoBusca` existia dentro de `agricultorRepository` e eu precisei dela em `produtoRepository`. Copiar teria criado duas versoes da mesma regra de escape. Extraida para `src/utils/sql.js` e importada nos dois.

**A melhor defesa e nao ter o campo, nao validar o campo.** No carrinho eu poderia ter aceitado `preco` no schema e conferido contra o banco. Em vez disso o schema NAO declara preco, e a tabela `carrinho_itens` NAO tem coluna de preco - so `quantidade`. O Zod descarta o campo e o preco so pode sair de `produtos.preco`. Manipulacao de preco deixa de ser um caso a tratar e vira impossibilidade do modelo. Ao desenhar um modulo que recebe dados do cliente, a pergunta util e "como este dado poderia nem existir?" antes de "como validar este dado?".

**Quando o recurso e sempre "o do token", nao coloque id na rota.** Nenhuma rota do carrinho tem `carrinho_id`: o carrinho e derivado do usuario autenticado. Sem parametro de id nao existe IDOR de carrinho - nao ha o que forjar. Antes de escrever um teste de "usuario A nao acessa o carrinho de B", vale conferir se o id precisa aparecer na URL.

**Soma no banco, nao na aplicacao.** `adicionarItem` usa `INSERT ... ON CONFLICT DO UPDATE SET quantidade = carrinho_itens.quantidade + EXCLUDED.quantidade`. Um SELECT seguido de UPDATE na aplicacao abriria janela para dois cliques rapidos somarem so uma vez. Pelo mesmo motivo `obterOuCriar` do carrinho usa `ON CONFLICT DO NOTHING` + SELECT: duas abas abrindo o carrinho ao mesmo tempo nao devem produzir violacao de UNIQUE para o usuario.

**Validar o TOTAL resultante, nao so o que foi enviado.** Adicionar 5 itens a um carrinho que ja tem 8, com estoque 10, precisa ser recusado. Validar apenas os 5 enviados passaria e deixaria o carrinho invalido. A checagem correta e `quantidade_existente + quantidade_enviada <= estoque`.

**Arredondar dinheiro em ponto flutuante.** `0.1 * 3` em JavaScript da `0.30000000000000004`. Todo subtotal e total passa por `Number(x.toFixed(2))` antes de sair. Sem isso, o total do carrinho aparece com cauda de float na tela.

**BIGINT do pg chega como string; NUMERIC chega como Number (parser do projeto).** Teste do carrinho falhou esperando `1` e recebendo `"1"` em `produto_id`. Antes de assertar, conferir o tipo da coluna: id e BIGINT (string), preco e NUMERIC (Number, por causa do parser em `pool.js`).

**Preco do cliente nao existe no schema; no checkout isso vale para o pedido inteiro.** O corpo do `POST /checkout` aceita so `endereco_id` e `metodo_pagamento`. Nao ha `valor_total`, `valor_frete` nem `preco`. Se houvesse, o cliente mandaria 0.01 e a API gravaria o pedido por 0.01. A defesa e a ausencia do campo, nao a validacao dele.

**Adicionar ao carrinho valida estoque; isso muda como se escreve teste de checkout.** Varios testes falharam por baixar o estoque ANTES de montar o carrinho - a propria adicao recusava. O cenario que se quer testar e "o carrinho foi montado quando havia estoque, e o estoque caiu depois". Ordem: encher o carrinho, depois ajustar o estoque por SQL.

**A revalidacao dentro da transacao ganha da baixa condicional.** Um checkout com estoque insuficiente devolve 422 ITENS_INDISPONIVEIS, e nao 409 ESTOQUE_INSUFICIENTE: a leitura dentro da transacao ja ve o estoque zerado. O 409 fica para a corrida entre a leitura e o `UPDATE ... WHERE estoque >= $2`. Ao testar, conferir qual caminho o cenario realmente exercita.

**Transacao testada so por "nada foi gravado" nao esta testada.** Desligar BEGIN/ROLLBACK nao fez os testes de atomicidade falharem, porque a revalidacao barrava tudo antes da primeira escrita. Foi preciso um teste que baixa o estoque de verdade e lanca erro depois, exercitando `emTransacao` diretamente. Vale desconfiar de cobertura de rollback que passa sem nunca ter escrito nada.

**Falha de gateway de pagamento nao desfaz o pedido.** O pedido, os itens e a baixa de estoque acontecem na transacao; a chamada ao gateway acontece DEPOIS do commit. Segurar uma transacao aberta esperando rede de terceiro prenderia locks de estoque e conexao do pool. Se o gateway falhar, o pedido fica com pagamento PENDENTE e o cliente tenta de novo.

**Identificador do gateway precisa ser GRAVADO, nao so devolvido.** Bug real encontrado na validacao manual: o checkout devolvia o id da transacao na resposta, mas o UPDATE so persistia status e resumo. Sem ele, `buscarPagamentoPorIdentificador` nao acharia nada e um webhook de PIX nao teria como reconciliar - o pedido ficaria pendente para sempre. Vale conferir, campo a campo, se todo dado devolvido na resposta tambem foi persistido.

**Gateway simulado deve ser deterministico, nao aleatorio.** O `gatewayFake` decide por regra (valor terminando em ,13 recusado, ,99 pendente, resto aprovado). Um resultado aleatorio tornaria os testes instaveis - o mesmo teste passaria e falharia sem mudanca de codigo.

**Em producao, o gateway simulado e recusado explicitamente.** `paymentService` lanca erro se `PAYMENT_GATEWAY=fake` com NODE_ENV=production. Um erro de configuracao silencioso geraria pedidos entregues sem dinheiro nenhum ter entrado.

**Status do pedido é derivado dos itens, por trigger no banco.** `pedidos.status` não é escrito pela aplicação. A função `sincronizar_status_pedido()` (migration 004) recalcula a cada mudança de item, com precedência: todos cancelados → CANCELADO; todos entregues → ENTREGUE; todos enviados/entregues → ENVIADO; algum em andamento → PROCESSANDO; senão PENDENTE. Escrever o status na aplicação criaria dois lugares decidindo o mesmo estado, e um deles esqueceria.

**A visão do agricultor precisa REMOVER campos, não só acrescentar os dele.** Bug real: o `GET /pedidos/:id` devolvia `valor_total` (67.95) para o produtor A, revelando quanto o produtor B vendeu no mesmo pedido. A correção desestrutura o pedido e descarta `valor_produtos`, `valor_frete` e `valor_total`, devolvendo só `valor_dos_meus_itens`. Enviar os dois valores seria pior: o frontend teria o número errado disponível e bastaria uma tela usar o campo errado para vazar.

**Ordem de rotas com `/:id` e caminho literal é armadilha silenciosa.** `GET /pedidos/agricultor` precisa ser declarada antes de `GET /pedidos/:id`, senão "agricultor" é interpretado como id e a resposta vira 400 de validação — um erro que parece bug de validação quando é ordem de declaração. Há teste de regressão para isso.

**IDOR entre produtores devolve 404, não 403.** O item é localizado por `(itemId, agricultor_id do token)`. Quando o produtor A manda o id de um item do produtor B, o `WHERE` não acha linha e a resposta é 404. Um 403 confirmaria que aquele item existe e é de alguém.

**Cancelamento precisa devolver estoque, e o teste precisa provar isso.** O estoque foi baixado no checkout; se o cancelamento não devolver, o produto some da vitrine para sempre. Os testes conferem o valor exato antes e depois (ex.: 93 → 100) e que cancelar duas vezes não devolve em dobro (o segundo cancelamento falha antes de tocar no estoque).

**Cancelamento parcial não é suportado, e recusar é melhor que aceitar pela metade.** Pedido multi-produtor com um item já ENVIADO: cancelar só o resto deixaria o cliente com um pedido pela metade e o produtor com produto despachado sem cobrança clara. A API recusa com `CANCELAMENTO_PARCIAL_NAO_SUPORTADO`.

**`pedido_itens.status` tem valor default e trigger `AFTER UPDATE OF status`.** Ao escrever teste que altera status por SQL direto, lembrar que o trigger roda e sincroniza `pedidos.status` — isso é o comportamento desejado, mas surpreende quem espera só a linha do item mudar.

**Rate limit de login é 10 por 15 minutos e atrapalha validação manual em sequência.** Scripts que fazem vários logins seguidos recebem `MUITAS_TENTATIVAS` (429). Para validar manualmente, gerar o token direto com `gerarToken` a partir do banco em vez de logar a cada passo.

**Frete precisa ser calculado antes do total, nunca depois.** O banco exige `valor_total = valor_produtos + valor_frete`, e o frete gratis depende do valor dos PRODUTOS. Calcular o frete a partir do total seria circular.

**Validar assinatura não é o mesmo que confiar no conteúdo.** O webhook tem assinatura HMAC válida e mesmo assim o status do corpo é IGNORADO: o servidor chama `paymentService.consultar()` e aplica a resposta do gateway. Sem isso, um webhook antigo reenviado (assinatura válida, evento superado) reverteria um estorno. A assinatura prova a ORIGEM; a reconciliação prova o ESTADO.

**Gateway fake que ecoa o status local torna a reconciliação inútil.** A primeira versão de `gatewayFake.consultar()` devolvia o `statusAtual` que o banco informava — um espelho que nunca discorda. Um fake que sempre concorda esconde exatamente o bug que a reconciliação existe para pegar. A correção foi um ledger em memória, com `_simularPagamentoConfirmado`/`_registrarStatus` representando um evento externo (o pagador concluiu o PIX no banco dele). O teste que provava o contrário falha ao trocar a consulta pelo corpo.

**A assinatura cobre os BYTES, não o JSON equivalente.** `JSON.stringify(obj, null, 2)` e `JSON.stringify(obj)` são o mesmo objeto e strings diferentes: a assinatura de uma não vale para a outra. Por isso `express.json({ verify })` guarda `req.rawBody` — re-serializar o objeto parseado muda espaços, ordem de chaves e formato de número, e corromperia a verificação.

**Comparar assinaturas com `===` vaza o segredo pelo tempo de resposta.** O comparador para no primeiro byte diferente, então medir o tempo revela a assinatura byte a byte. Usar `crypto.timingSafeEqual`, com guarda de tamanho antes (a função lança se os buffers tiverem tamanhos diferentes, e isso viraria 500).

**Webhook sem segredo configurado deve ser RECUSADO, não aceito.** `verificarAssinatura` lança 500 quando `PAYMENT_WEBHOOK_SECRET` está vazio. Aceitar sem verificar transformaria um erro de configuração numa porta aberta para marcar pedidos como pagos. Falhar fechado.

**Webhook responde 200 mesmo quando ignora o evento.** 404 faria o gateway reenviar para sempre um evento que nunca vai casar (de outro ambiente, ou de pagamento antigo). A exceção são erros reais: 403 para assinatura inválida e 422 para falha de reconciliação, onde o reenvio É desejado.

**Estorno roda FORA da transação de cancelamento.** É chamada HTTP externa que pode levar segundos; dentro da transação, seguraria uma conexão do pool e uma linha travada durante toda a espera — alguns cancelamentos simultâneos esgotariam o pool. Consequência aceita: o estorno pode falhar depois do cancelamento confirmado. Nesse caso o cancelamento NÃO é desfeito (devolver dinheiro é obrigação, não condição) e a resposta traz `estorno_pendente: true` para a operação agir.

**`env.PAYMENT_GATEWAY` é mutável em runtime, e os testes dependem disso.** O teste de falha de estorno troca o gateway por um inexistente dentro de um `try/finally`. `config/env.js` exporta o objeto `env`, e não valores congelados — o `finally` restaura.
