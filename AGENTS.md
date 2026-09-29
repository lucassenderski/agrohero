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
| `npm run seed:catalogo` | backend | Catalogo demonstrativo: 3 produtores e 12 produtos (idempotente, nunca em producao) |
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

Fases 0–24 implementadas. Ver o `README.md` para a tabela de fases e o estado atual de cada uma.
Suíte de testes: 630 no backend (25 suítes) e 62 no frontend (11 suítes), todos passando.

**Produção.** `agrohero-api` no Render e `agrohero-web` no Vercel, servidos a partir deste repositório. A versão em produção é o merge do PR #2 (`13f7843`). O ponto de rollback é a tag `v1.0.0-producao` (`c2a97a3`) — mas, depois da migration `008`, voltar o código exige restaurar também o schema do Neon. A API pública é `agrohero.onrender.com` (não `agrohero-api.onrender.com`) e o frontend de produção é `agrohero-six.vercel.app` (é essa a origem que o CORS libera). Conferência de qual commit está servido e o passo a passo do rollback estão na seção 9 de `docs/DEPLOY.md`.

## Armadilhas já encontradas (não repetir)

**O painel do Render diz o deploy disparado, não o que está no ar.** Um deploy que falha não derruba o anterior: a versão antiga continua servindo, e o painel ainda exibe o commit novo como mais recente. A conferência confiável é o artefato - o Vite nomeia os arquivos por hash de conteúdo, então reconstruir o commit candidato com o mesmo `VITE_API_URL` de produção e comparar os nomes de `dist/assets` com os que o site serve prova qual commit está publicado. Pelo mesmo motivo, rollback não é ajustar código: é **Redeploy** do commit bom no painel, ou `git revert` (não `reset --hard`, que exigiria `--force` e apagaria o commit do servidor).

**`sync: false` no `render.yaml` significa "valor só no painel", e o painel pode guardar o espaço reservado.** O `CORS_ORIGINS` foi criado com o `https://exemplo.com` que a própria seção 3 do `docs/DEPLOY.md` manda usar na primeira implantação, e nunca voltou a ser corrigido. Resultado: a API rejeitava com `403 CORS_BLOQUEADO` até a origem do próprio frontend, e a vitrine publicada ficava em "Não foi possível falar com o servidor" - um erro de configuração, não de código, que nenhum teste local pega (o `.env` local tem a origem certa). Ao publicar, revisar todas as variáveis `sync: false`.

**Casamento de ingrediente por `includes` casava dentro de outra palavra.** A receita compara o termo do ingrediente com o nome do produto, e o termo `mel` casava em "Frutas Ver**mel**has" - a receita de sopa oferecia uma geleia no lugar do mel. Como `casarIngredientes` devolve o **primeiro** produto que casa, um falso positivo ainda esconde o produto certo. A comparacao e por palavra inteira (regex com `\b`), em `frontend/src/dados/receitas.js`. Cuidado com termos curtos (mel, ovo, sal) em nome de produto.

**Migration de DDL que troca constraint não roda sobre dados do vocabulário antigo.** A `008` troca as constraints de `pagamentos` para `metodo IN ('PIX','CARTAO','DINHEIRO')` e `status IN ('PENDENTE','PAGO','CANCELADO')`. O `ADD CONSTRAINT` valida as linhas **existentes**, então **qualquer** linha antiga (um `BOLETO`/`APROVADO` que sobreviveu de um teste de produção) faz a migration falhar e o deploy abortar:
```
check constraint "pagamentos_metodo_valido" of relation "pagamentos" is violated by some row
```
Em transação própria, então nada é aplicado pela metade - o banco fica intacto e a versão antiga continua no ar. O comentário no topo da `008` diz "os bancos estão com ZERO linhas", mas isso foi verificado só em **dev e teste**; a produção (Neon) não é alcançável daqui. Antes de publicar uma migration de constraint, normalizar os dados na origem. Ver `docs/DEPLOY.md` seção 9.

**Código antigo e migration reversa não andam juntos.** Fazer Redeploy de `c2a97a3` depois de aplicar a `008` volta o código, mas não o schema: o código antigo grava `identificador_externo`/`resumo_gateway`, que a `008` apagou. O rollback de verdade exige o backup do banco (restore point/branch do Neon). Rollback de aplicação e de schema são decisões separadas.

**A `009` (logo) não tem pré-condição de dados e é idempotente.** Ela só faz `ADD COLUMN IF NOT EXISTS` em `agricultores` e recria duas constraints (`DROP CONSTRAINT IF EXISTS` + `ADD`). Nenhuma constraint nova é validada contra dados existentes de forma perigosa: as colunas nascem NULL em todas as linhas, e a `CHECK` aceita `NULL/NULL`. O risco que a `008` tinha - constraint nova avaliando linhas antigas de vocabulário obsoleto - **não existe aqui**. Rodar no Neon não exige preparar dados antes. A `010` (avatar) segue exatamente o mesmo padrão em `usuarios`.

**Rota de imagem autenticada não pode ser o `src` de um `<img>`.** A rota do avatar (e a da logo privada) exige o cabeçalho `Authorization`, e o navegador **não** envia cabeçalhos customizados ao buscar o `src` de uma imagem - ele faz a requisição simples. Apontar `<img src="/api/v1/usuarios/avatar">` produz 401 e ícone de imagem quebrada. O caminho correto (implementado em `frontend/src/services/avatar.js` + `hooks/useAvatar.js`) é buscar os bytes com `fetch` + token e montar um `URL.createObjectURL`. Token na query string e rota pública por id foram descartados (vazam credencial / expõem a foto alheia). **A foto é buscada uma vez no `AuthContext`** e compartilhada por cabeçalho e perfil; se cada tela buscasse por conta própria, trocar a foto não refletiria na outra sem reload.

**O jsdom não implementa `URL.createObjectURL`** (confirmado: é `undefined`), e o `fetch` do ambiente não reconhece o `FormData` do jsdom como multipart - envia a string `"[object FormData]"`. Os testes de avatar em `frontend/src/testes/avatar.teste.jsx` trocam `fetch`/`FormData` pelo undici e `File` pelo `node:buffer`, e adicionam um polyfill de `createObjectURL`. A troca é **restrita a esse arquivo** porque os testes rodam em paralelo: mexer no `fetch` global faria os outros usarem o pool do undici e falharem de forma intermitente.

**A mesma foto aparece em dois `<img>` na tela, e `findBy*` falha com "Found multiple elements".** A prévia do upload e o avatar do cabeçalho compartilham o mesmo object URL, então asserções por `alt` precisam de `getAllByAltText` e checar a contagem. A dupla presença é o que prova que o contexto compartilha a busca.

**A suite do backend apaga o schema do banco de teste, e a suite do frontend depende dele.** `npm test` no backend recria o schema do zero e reaplica as migrations, o que **esvazia `categorias`**. Os testes do frontend nao mockam a API: eles criam produtos de verdade, e `criarProduto` usa `categorias[0].id`. Rodar o backend e depois o frontend sem re-semear dá 19 falhas em cascata, todas com `Cannot read properties of undefined (reading 'id')` em `ajudantes.js` - parece regressao de interface, mas e o banco sem categorias. A ordem que funciona:
```bash
cd backend && npm test                                  # recria o schema
cd backend && node src/database/run-seeds.js            # devolve categorias
cd frontend && npx vitest run                           # 62 testes
```
O `run-seeds.js` le `DATABASE_URL` do `.env`; para o banco de teste, passe `DATABASE_URL=postgresql://agrohero:agrohero_dev@localhost:5433/agrohero_test` na chamada.

**A "falha intermitente" da suite do frontend eram tres corridas de teste, nao uma.** Elas somem quando o arquivo roda sozinho, o que engana: `npx vitest run` roda os arquivos em paralelo contra um unico backend, e a carga muda o tempo relativo das respostas. Cada uma tinha causa propria e concreta, corrigida no arquivo de teste (nao no `configuracao.js`):

- **`painelAgricultor.teste.jsx` montava a pagina SEM o guard.** O `renderizarComoTipo` renderizava `<PainelAgricultor />` direto, e nao sob `<RotaPorTipo>`. A pagina assume `usuario` carregado; sem o guard, o fetch do painel podia terminar antes do `AuthContext.buscarPerfil` e a pagina ler `usuario.nome` de um `null` - `TypeError` que desmonta a arvore. Em producao a pagina vive sob o guard, entao nunca foi bug de producao: era o teste violando a convencao documentada em `perfil.teste.jsx`. Corrigido montando a rota com o mesmo `<RotaPorTipo>` do `App`. E a licao geral: **teste de pagina protegida usa o guard do `App`, nao a pagina solta.**
- **`home.teste.jsx` usava `findBy*` onde devia usar `getBy*`.** Os placeholders entram no PRIMEIRO render (sincrono); com `findBy`, a espera dava tempo de a API responder e substituir os placeholders pelas categorias reais, e o teste nao achava mais o texto. `getByRole` le exatamente o render atual.
- **`painelConsumidor.teste.jsx` usava `getBy*` onde devia usar `findBy*`.** Logo apos promover o endereco, o componente faz `await carregar()` e a lista some enquanto a API responde; um `getByText` sincrono rodava nesse intervalo. `findByText` espera a lista voltar. **Regra: `getBy*` so quando o elemento ja esta no DOM; qualquer coisa que dependa de uma resposta da API usa `findBy*`/`waitFor`.**

Confirmado apos as correcoes: 10 rodadas seguidas de 55/55 (62/62 apos o rodape e a pagina Sobre). O `asyncUtilTimeout` do `configuracao.js` continua em 6s, mas como teto para telas legitimamente lentas - nao era a causa destas falhas, e elevar o tempo escondia o bug real por mais tempo em vez de corrigi-lo.

**Zod descarta campo não declarado, em silêncio.** Um campo ausente do schema é removido sem erro. Foi a causa de um bug: `perfilAgricultorSchema` não declarava `cidade`/`estado`, então o perfil do produtor era gravado sem localização. Ao adicionar campo a um objeto aninhado, conferir se o schema o declara.

**Teste que passa por motivo errado.** O teste do bug acima passava porque o payload duplicava `cidade` no nível de cima, e o fallback do service mascarava o campo perdido. Um teste só tem valor depois de verificado que FALHA sem a correção. Ao corrigir bug, rodar o teste com a correção revertida e confirmar que ele quebra.

**Variável exportada no shell da sessão quebra a suíte inteira.** Testei o backend em `NODE_ENV=production` com `export CORS_ORIGINS=...` e a variável ficou viva na sessão; o `npm test` seguinte rodou com a configuração de produção e falhou um teste de CORS por motivo que não tinha nada a ver com o código. Ao testar configuração de produção, prefixar o comando (`VAR=x npm test`) em vez de `export`, ou limpar com `unset` antes da suíte.

**`api.put` devolve `null` em 204, e ler `.dados` quebra a chamada.** O `api.js` trata 204 corretamente (sem corpo, retorna `null`), mas o serviço que consome precisa saber disso. `trocarSenha` acessava `resposta.dados` e estourava `TypeError`, que a tela mostrava como "Ocorreu um erro." genérico. Ao consumir um endpoint que responde 204, usar `resposta?.dados ?? null`.

**Função local com o mesmo nome do serviço importado vira recursão infinita.** Em `Perfil.jsx`, o handler do formulário se chamava `trocarSenha` — igual ao import de `services/auth.js` — e a chamada dentro dele chamava a si mesma. O pedido nunca saía do navegador e não havia erro visível. `no-unused-vars` do ESLint pegou o import "não usado"; o sintoma só apareceu no teste de integração. Prefixos como `salvar`/`enviar` nos handlers evitam a colisão.

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

**`count(*)` sem alias `AS total` faz a paginacao mentir (FASE 14).** O helper `contar()` le `linha.total`. Sem o alias, a coluna se chama `count`, `linha.total` e `undefined` e o total vira **0 sempre** - enquanto a lista de itens volta correta. A paginacao parece funcionar: a primeira pagina mostra tudo, e so o campo `paginacao.total` esta errado. Ficou meses no codigo porque nenhum teste olhava esse campo. Achei na validacao manual, comparando a resposta real com o que eu esperava. Ao escrever consulta de contagem nova, sempre `count(*)::int AS total`, e sempre um teste que verifica `paginacao.total` com valor diferente de zero.

**Update parcial precisa distinguir "campo ausente" de "valor nulo".** `nota` e NOT NULL: mandar `undefined` no SET grava NULL e o banco recusa com 23502. Resolvido com `COALESCE($1, nota)`. Mas `comentario` e anulavel, e ali o COALESCE inverteria a intencao - o cliente enviaria `null` para apagar e o valor antigo voltaria. Por isso o repositorio recebe um flag `comentarioEnviado` (`Object.hasOwn(dados, 'comentario')`) e usa `CASE WHEN $2 THEN $3 ELSE comentario END`. Regra geral: campo NOT NULL aceita COALESCE, campo anulavel precisa do flag de presenca.

**Autorizacao deve ficar na clausula WHERE, nao numa checagem separada.** `buscarItemEntregue(consumidorId, pedidoId, produtoId)` filtra os tres por `WHERE`. Se a checagem do dono ficasse depois, no service, existiria um caminho de codigo onde ela pode ser esquecida. Mesma ideia em `atualizar`/`remover`, que levam `AND consumidor_id = $n` no SQL.

**404 e nao 403 para recurso de outro usuario.** Um 403 confirma que o recurso existe, permitindo enumerar ids e descobrir quem avaliou o que. O 404 nao distingue "nao existe" de "nao e seu", que e o comportamento correto para recurso privado.

**Status por ITEM, nao pelo pedido, quando o efeito e por item (FASE 14).** Avaliar exige `pi.status = 'ENTREGUE'`. Usar `pedidos.status` travaria a avaliacao do tomate que chegou por causa do morango que ainda nao chegou - o pedido inteiro so vira ENTREGUE quando todos os itens sao entregues. Sempre que a regra for "este produto ja foi recebido", olhar o item.

**Constraint UNIQUE no banco e a garantia; a consulta previa e so a mensagem.** Entre o `SELECT` "ja existe?" e o `INSERT` cabe outra requisicao. A defesa real e `avaliacoes_uma_por_produto_por_pedido`, e o repository traduz o `23505` no mesmo 409. Nao confiar na checagem previa como garantia.

**Teste de fixture que falha por motivo alheio esconde o alvo.** O teste de IDOR em avaliacoes quebrava porque o "outro consumidor" usava o endereco do primeiro, e o checkout recusa entregar em endereco de terceiro. O 404 que aparecia era da criacao do pedido, nao da avaliacao - eu estaria medindo a coisa errada e chamando de aprovado. Cada ator do teste precisa das proprias fixtures.

**Convencao do projeto vence a expectativa do autor do teste.** Escrevi "limite acima do maximo e reduzido" porque me pareceu razoavel. O projeto recusa com 400 desde a FASE 8 (`/produtos`, `/agricultores`), e o teste estava errado, nao o codigo. Antes de testar comportamento novo, conferir como os modulos existentes ja resolvem o mesmo caso.

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

**O pagamento acontece no local; o checkout nao cobra nada.** Nao existe gateway, webhook nem estorno. O `POST /checkout` cria o pedido e registra quanto CADA produtor tem a receber na retirada, com status PENDENTE. Quem confirma o recebimento e o produtor, pelo painel dele (`PATCH /pedidos/:id/pagamento/confirmar`). Isso significa que "pagamento aprovado" nao e um estado possivel na criacao - so PENDENTE, PAGO ou CANCELADO.

**O pagamento e por PRODUTOR, nao por pedido.** Um pedido pode ter itens de varios produtores, e cada um recebe o seu na retirada. Com uma linha por pedido, "quem confirma o recebimento?" nao teria resposta, e um produtor confirmaria o pagamento do produto de outro. A posse e o eixo da seguranca: o agricultor vem do TOKEN, e a consulta e por `(pedidoId, agricultorId)`. Mandar o id de um pedido alheio devolve 404, porque a linha consultada nao existe para ele.

**Quem tenta confirmar recebe codigos diferentes conforme o motivo.** Sao duas barreiras em sequencia, e vale saber qual esta respondendo: um CLIENTE (ou admin) esbarra primeiro no `requireRole('agricultor')` da rota e recebe **403 SEM_PERMISSAO**; um OUTRO AGRICULTOR passa pelo role e para na consulta por posse, recebendo **404 NAO_ENCONTRADO**. Um 404 aqui e o comportamento desejado - um 403 confirmaria que aquele pedido existe e que tem pagamento para alguem.

**A ordem das checagens em `confirmarPagamento` importa.** Primeiro "tem pagamento meu neste pedido?" (404 se nao), e so depois as regras de estado. Invertendo, um produtor de fora receberia "pagamento ja confirmado" a respeito de um pedido que nao e dele - informacao que nao precisa sair daqui.

**Confirmar duas vezes nao e erro.** O `UPDATE ... WHERE status = 'PENDENTE'` e condicional. Se ele nao encontra a linha, outra requisicao confirmou no meio: relemos o pagamento e respondemos o estado real com `ja_estava_pago: true`, em vez de dar baixa duas vezes.

**Pedido cancelado nao aceita confirmacao de pagamento.** Recusar explicitamente (`PEDIDO_CANCELADO`) e melhor que dar baixa num pedido que nao vai ser entregue. O cancelamento, por sua vez, marca como CANCELADO apenas os pagamentos ainda PENDENTE - um pagamento ja PAGO nao vira CANCELADO por um UPDATE em massa.

**Status do pedido é derivado dos itens, por trigger no banco.** `pedidos.status` não é escrito pela aplicação. A função `sincronizar_status_pedido()` (migration 004) recalcula a cada mudança de item, com precedência: todos cancelados → CANCELADO; todos entregues → ENTREGUE; todos enviados/entregues → ENVIADO; algum em andamento → PROCESSANDO; senão PENDENTE. Escrever o status na aplicação criaria dois lugares decidindo o mesmo estado, e um deles esqueceria.

**A visão do agricultor precisa REMOVER campos, não só acrescentar os dele.** Bug real: o `GET /pedidos/:id` devolvia `valor_total` (67.95) para o produtor A, revelando quanto o produtor B vendeu no mesmo pedido. A correção desestrutura o pedido e descarta `valor_produtos`, `valor_frete` e `valor_total`, devolvendo só `valor_dos_meus_itens`. Enviar os dois valores seria pior: o frontend teria o número errado disponível e bastaria uma tela usar o campo errado para vazar.

**Ordem de rotas com `/:id` e caminho literal é armadilha silenciosa.** `GET /pedidos/agricultor` precisa ser declarada antes de `GET /pedidos/:id`, senão "agricultor" é interpretado como id e a resposta vira 400 de validação — um erro que parece bug de validação quando é ordem de declaração. Há teste de regressão para isso.

**IDOR entre produtores devolve 404, não 403.** O item é localizado por `(itemId, agricultor_id do token)`. Quando o produtor A manda o id de um item do produtor B, o `WHERE` não acha linha e a resposta é 404. Um 403 confirmaria que aquele item existe e é de alguém.

**Cancelamento precisa devolver estoque, e o teste precisa provar isso.** O estoque foi baixado no checkout; se o cancelamento não devolver, o produto some da vitrine para sempre. Os testes conferem o valor exato antes e depois (ex.: 93 → 100) e que cancelar duas vezes não devolve em dobro (o segundo cancelamento falha antes de tocar no estoque).

**Cancelamento parcial não é suportado, e recusar é melhor que aceitar pela metade.** Pedido multi-produtor com um item já ENVIADO: cancelar só o resto deixaria o cliente com um pedido pela metade e o produtor com produto despachado sem cobrança clara. A API recusa com `CANCELAMENTO_PARCIAL_NAO_SUPORTADO`.

**`pedido_itens.status` tem valor default e trigger `AFTER UPDATE OF status`.** Ao escrever teste que altera status por SQL direto, lembrar que o trigger roda e sincroniza `pedidos.status` — isso é o comportamento desejado, mas surpreende quem espera só a linha do item mudar.

**Rate limit de login é 10 por 15 minutos e atrapalha validação manual em sequência.** Scripts que fazem vários logins seguidos recebem `MUITAS_TENTATIVAS` (429). Para validar manualmente, gerar o token direto com `gerarToken` a partir do banco em vez de logar a cada passo.

**Frete precisa ser calculado antes do total, nunca depois.** O banco exige `valor_total = valor_produtos + valor_frete`, e o frete gratis depende do valor dos PRODUTOS. Calcular o frete a partir do total seria circular.

**A notificacao por e-mail sai FORA da transacao e nunca derruba o pedido.** `notificarPedidoCriado` roda depois do commit e engole a propria falha (log + segue). Uma falha de SMTP nao pode desfazer um pedido ja gravado, com estoque ja baixado: o pedido existe no banco e o cliente o ve no historico, que e a fonte de verdade. E-mail e informacao acessoria.

**Os dois e-mails do checkout tem publicos diferentes.** `enviarEmailPedidoConfirmado` vai para o CLIENTE (o pedido existe e quanto vai pagar na retirada); `enviarEmailNovoPedidoProdutor` vai para CADA produtor com itens no pedido, com o valor que ele tem a receber. Confirmar o recebimento no painel, por sua vez, nao dispara e-mail - o produtor acabou de fazer a acao e ja ve o resultado na tela.

---

## Frontend (FASES 15 a 19)

**O `/health` fica FORA do versionamento, e o cliente `api.js` não o alcança.** A rota responde em `/health`, não em `/api/v1/health`, porque é infraestrutura (o health check do Render usa exatamente esse caminho). Como `VITE_API_URL` já inclui o prefixo `/api/v1`, chamar `/health` pelo cliente resultaria em `/api/v1/health` e 404. O status do rodapé (`services/saude.js`) deriva a raiz com `URL_BASE.replace(/\/api\/v\d+\/?$/, '')`. Antes de consumir qualquer endpoint de infraestrutura, conferir onde ele está montado em `app.js`.

**Status de infraestrutura no rodapé nunca pode virar erro visível.** O `SaudeRodape` engole a falha de propósito (o rodapé apenas some com a linha de status) e não faz polling — é uma consulta por montagem do layout. Um `/health` fora do ar não é problema do usuário. O 503 do `/health` ainda traz `dados` úteis (`api: ok`, `banco: indisponivel`), então o serviço lê o corpo antes de decidir pelo status.

**Dados de infraestrutura vão no rodapé, não na front page.** A home já exibiu API/PostgreSQL/ambiente/latência dentro do bloco "Escolha por categoria" — informação que não interessa ao visitante e ocupa o lugar mais visível do site. Passaram para o rodapé, que é o lugar de dado acessório. Há teste dos dois lados: o rodapé exibe, e a home garante que **não** exibe (`home.teste.jsx`), para que o bloco não volte.

**Botão sobre o hero verde não pode usar a variante clara.** `botao--destaque` (amarelo) e `botao--contorno` (borda) existem para contraste sobre fundo escuro e vivem em `components/ui.css`, junto das outras variantes. Estavam declaradas na `Home.css`; moveram-se quando a página `Sobre` passou a montar o mesmo hero — deixá-las na `Home.css` faria a página nova depender do CSS de outra página. A regra geral: variante de botão reutilizável vai em `ui.css`, não na página onde apareceu primeiro.

**`a` global é escuro, e some sobre a barra verde-escura do cabeçalho.** O link "Sobre a iniciativa" na barra superior precisou de `color: inherit` em `.header__barra-links a` — sem isso herda `--cor-primaria-600` do `a` global e fica quase ilegível sobre `--cor-primaria-900`. Vale para qualquer link novo nessa barra.

**`ErroApi` precisa expor `.mensagem`, e não só `.message`.** Bug real encontrado pelos testes de integração: `ErroApi extends Error` guarda o texto em `.message`, mas TODA a interface lê `falha.mensagem || 'mensagem padrão'` (mesmo nome do campo no envelope de erro da API). O resultado era que nenhum motivo real chegava ao usuário — `ULTIMO_ENDERECO`, `ENDERECO_PRINCIPAL`, `ESTOQUE_INSUFICIENTE` caíam todos no texto genérico. A correção foi um alias `this.mensagem = mensagem` no construtor. Vale desconfiar de qualquer erro que sempre mostra a mesma mensagem.

**Os testes do frontend são de integração de verdade, sem mock de `fetch`.** O padrão da casa é não mockar: o teste chama a API real e verifica o estado no banco depois. Isso pega bugs que um mock esconderia — o caso do `ErroApi` acima só apareceu porque a API respondeu 422 de verdade.

**Teste de frontend exige backend em modo `test`, não o de desenvolvimento.** O login e o cadastro têm limitador estrito (10 por 15 min). Uma suíte que cria vários usuários estoura o limite e falha com `MUITAS_TENTATIVAS` — um falso negativo que parece bug de teste. Rodar um servidor com `NODE_ENV=test PORT=3002` e `DATABASE_URL_TEST` apontando para `agrohero_test`: nesse modo `env.ehTeste` desliga o rate limit.

**Nunca chamar `/auth/login` no helper de teste quando `/auth/register` já devolve token.** O cadastro responde `{ usuario, token }`, então logar em seguida é um round-trip extra que consome o limitador sem necessidade.

**Remover endereço tem duas regras, e as duas são 422.** `ULTIMO_ENDERECO` (o cliente precisa manter ao menos um para poder comprar) e `ENDERECO_PRINCIPAL` (não se remove o principal enquanto houver outro — é preciso promover outro antes). O teste de remoção com sucesso exige dois endereços e a promoção prévia.

**O primeiro endereço cadastrado vira principal automaticamente.** O backend decide isso; o frontend nunca tenta adivinhar. Por isso `MeusEnderecos` recarrega a lista do servidor após cada escrita em vez de remendar o estado local.

**Nome de dado de teste colidindo com rótulo da interface quebra o teste.** `nome_destinatario: 'Principal'` fazia `getByText('Principal')` achar tanto o nome quanto o selo "Principal" do endereço principal. Usar nomes que não aparecem como rótulo na tela.

**Chave de lista nao pode ser um campo que os placeholders deixam nulo.** A home mostra tres categorias de exemplo (`{ id: null, nome }`) enquanto a API de categorias nao responde. Com `key={categoria.id}` as tres chaves viravam `null`, e o React avisava "Encountered two children with the same key" e deixava os itens indefinidos. O detalhe que engana: os placeholders entram no PRIMEIRO render, antes de qualquer resposta - entao o aviso aparece mesmo com o banco cheio de categorias, e nao e um caso de "banco vazio". Corrigido com `key={categoria.id ?? categoria.nome}` e coberto por `home.teste.jsx`, que espiona `console.error` (contar links nao provaria nada: com chave repetida o React ainda renderiza os itens).

**`window.confirm` precisa de `vi.spyOn` no jsdom.** O diálogo não existe e a remoção fica sem autorização. Lembrar de `mockRestore()` no fim.

**O `fetch` do jsdom nao envia o `FormData` do jsdom como multipart.** Ele cai no caminho generico e manda a STRING `"[object FormData]"` com `Content-Type: text/plain`; o servidor responde "nenhum arquivo foi enviado". Um teste de upload passa a acusar a aplicacao por um defeito do ambiente. A correcao e trocar `fetch`/`FormData` pelas pecas do Node (`undici`) e `File` pelo `node:buffer`, que falam o mesmo protocolo entre si.

**Essa troca de `fetch` tem que ficar no arquivo que faz upload, nao no setup compartilhado.** Aplicada em `configuracao.js`, ela contamina a suite inteira: o undici mantem um pool de conexoes proprio, e os testes - que rodam em paralelo contra o mesmo backend - passam a competir por um recurso que o ambiente nao compartilha com o resto. O sintoma e falha intermitente em testes SEM relacao com upload, que somem quando o arquivo roda sozinho. O vitest isola os globals por arquivo, entao o escopo local resolve.

**`fetch` global do Node nao consome o `FormData` do pacote `undici`.** Sao implementacoes distintas: o `FormData` do `undici` so funciona com o `fetch` do proprio `undici`. Trocar so um dos dois (o caso "minimo" que parece suficiente) falha do mesmo jeito que o jsdom.

---

## Segurança (FASE 20)

**Comprimento mínimo de segredo não impede usar o valor de exemplo.** Lacuna real encontrada na auditoria: o schema exigia `JWT_SECRET` com 32+ caracteres, mas o placeholder do `.env.example` tem 46. Copiar o arquivo para produção sem trocar nada passava na validação, e a API subiria assinando tokens com um segredo versionado no repositório — qualquer pessoa poderia forjar um token de administrador. A guarda de produção em `config/env.js` recusa valores que contenham `troque`, `placeholder`, `changeme`, `sua_chave` ou `example`, e também recusa `CORS_ORIGINS` com `*` ou `http://`. Falha fechada: derruba o processo na subida.

**Testar a guarda de configuração exige rodar o módulo em subprocesso.** `env.js` chama `process.exit(1)`, o que mataria o próprio Jest. A validação foi feita com `node -e "import('./src/config/env.js')"` sob `NODE_ENV=production`, em três casos: placeholder (falha), segredo real com https (sobe) e http em produção (falha).

**A validação da rota barra antes do banco, e o código de erro revela isso.** `GET /produtos/1 OR 1=1` responde 400 `DADOS_INVALIDOS` (Zod), não o `ID_INVALIDO` que o PostgreSQL produziria via `22P02`. Esperar o código errado no teste faria parecer que a proteção não existe — ela existe, só está numa camada anterior.

**Rotas de escrita de categoria ficam em `/admin/categorias`, não em `/categorias`.** `/categorias` é somente leitura (GET). Um teste de autorização que use `POST /categorias` recebe 404, não 403, e passa a testar a coisa errada. Vale conferir o arquivo de rotas antes de escrever o teste de permissão.

**`PUT /enderecos/:id` usa o schema COMPLETO do cadastro.** Corpo parcial para na validação com 400 e nunca chega na checagem de propriedade. Testar IDOR com corpo parcial dá um falso negativo: o teste passa (400 está na lista aceita) sem exercitar a autorização.

**O status do item só aceita PROCESSANDO, ENVIADO e ENTREGUE para o agricultor.** `CANCELADO` não está no enum (`STATUS_ITEM_AGRICULTOR`); cancelamento de item é um DELETE próprio. Enviar CANCELADO no PATCH dá 400, o que mascararia o 404 esperado de um IDOR.

**Contar pedidos não prova atomicidade quando o cenário já tem pedido.** O cenário multi-agricultor cria um pedido para o cliente. O teste de rollback do checkout precisou comparar a contagem antes e depois — assumir zero daria falha falsa. O que prova a transação é o número NÃO ter mudado.

**`unidade` é obrigatória na criação de produto.** Esquecer no corpo do teste dá 400 por validação, não 201. A lista de unidades é fechada (`unidade`, `kg`, `g`, `litro`, ...), então "quilo" também é recusado.

**Escalação de privilégio já é barrada em duas camadas.** O enum `TIPOS_AUTOCADASTRO` rejeita `tipo: 'administrador'` com 400, e o service força o tipo a partir dessa lista caso o schema seja afrouxado. No PUT de perfil o campo `tipo` simplesmente não existe no schema, então o Zod o descarta — a requisição pode ser aceita, mas o papel no banco não muda. Há teste para os dois caminhos, e para `agricultor_id` no corpo da criação de produto (o dono vem sempre do token).

---

## Testes completos (FASE 21)

**`jest --coverage` derruba a suíte se o banco não estiver no ar.** O relatório de cobertura roda todo mundo; sem o PostgreSQL, as 16 suítes de integração falham com `ECONNREFUSED` e o resumo mostra "509 failed" — um número que parece problema de código e é só o container parado. Checar `docker compose ps` antes de interpretar qualquer falha em massa.

**O daemon do Docker não sobe sozinho no ambiente.** `docker ps` responde `dial unix /var/run/docker.sock: no such file or directory`. A correção é `sudo dockerd > /tmp/docker.log 2>&1 &` e depois `sudo docker ...` (sem `sudo`, o socket recém-criado ainda dá permissão negada).

**A guarda de produção não era testável enquanto vivia dentro de `env.js`.** Módulo que chama `process.exit(1)` na importação mata o Jest. Movida para `config/verificacaoProducao.js` como função pura que devolve a lista de problemas, ganhou 11 testes. O `env.js` ficou só com a decisão de encerrar — a regra saiu de um lugar onde só podia ser verificada por `node -e` em subprocesso.

**O envelope de resposta descarta `detalhes` que não seja lista.** `respostaErro` só inclui a chave quando é array não vazio. Um service que passe um objeto solto (`{ tabela: 'usuarios' }`) não vaza nada nem em desenvolvimento — o teste precisou de array para exercitar o caminho, e o objeto virou um caso à parte, documentando essa segunda barreira.

**Item do carrinho aninha o produto: `item.produto.id`, não `item.produto_id` no topo.** O `produto_id` existe em outros pontos do service (na validação de checkout, por exemplo), mas o mapper devolve `produto: {...}`. Uma asserção em `itens[0].produto_id` recebe `undefined` e falha por motivo errado.

**Desativar produto tem rota própria: `PATCH /produtos/:id/disponibilidade`.** `ativo` não entra no PATCH geral — de propósito, porque o efeito é outro (some do marketplace na hora). Usar o PATCH geral dá 400 e o teste mede a coisa errada.

**Os ajudantes gravam o token de quem acabou de ser criado no localStorage.** Num teste que cria produtor e depois cliente, o token que fica salvo é o do cliente. Renderizar o painel do produtor sem regravar o token monta a tela como cliente, que não acha nada e falha por autorização, não por métrica. Resolver com um `renderizarComoTipo(token)` que restaura o token antes do `render`.

**Rótulo de métrica colide com título de seção.** `getByText('Estoque baixo')` acha tanto a métrica quanto o `<h2>` da seção de estoque baixo, e o teste morre com "multiple elements". Escopar a busca pela região (`within(getByRole('region', { name: 'Indicadores' }))`) resolve e ainda expressa a intenção.

**A validação do cadastro mostra uma mensagem por campo.** Um matcher genérico (`/informe|obrigatorio/i`) encontra vários elementos de uma vez. Asserir os textos exatos (`'Informe o nome.'`, `'Informe o e-mail.'`, `'Informe a senha.'`) é estável e documenta o comportamento real.

**`requireDono` não é usado por nenhuma rota.** É um middleware pronto e testado, mas a checagem de propriedade acontece dentro dos services, que já carregaram o recurso e comparam o dono sem consulta extra. Vale saber disso antes de "consertar" o que parece código morto: ele fica como utilitário, e o teste de unidade garante que não apodreça.

---

## Documentação (FASE 22)

**"Qualquer coisa menos 404" não prova que uma rota existe.** O teste antigo de sincronia do OpenAPI fazia a requisição e aceitava 400/401/403 como evidência de que a rota era real. Isso tinha um furo: routers protegidos montam `checkJwt` no router INTEIRO, e o middleware roda ANTES do handler de 404. Uma rota fictícia sob `/api/v1/carrinho/` responde 401 e passava no teste — ou seja, o teste aprovava documentação de rota inexistente, exatamente o que devia impedir. A prova só apareceu ao mutar a spec e ver o teste continuar verde. A fonte da verdade passou a ser a pilha de routers (`app._router.stack`), onde ou o caminho está, ou não está.

**A pilha de routers do Express tem os prefixos já resolvidos.** Para saber o que o app realmente expõe, caminhar `app._router.stack` é mais fiel do que ler o texto dos arquivos de rota: montagens aninhadas (`/api/v1` → `/carrinho` → `/itens`) aparecem compostas, e um `router.use` novo entra no resultado sem precisar de manutenção no teste. Express guarda o prefixo como regexp (`'/api/v1/?(?=/|$)'`), então extrai-se a parte literal cortando em `?(?=`.

**Rotas montadas em sub-router aparecem com barra dupla.** `coletarRotas` concatena prefixo + `route.path` e produz `/api/v1/carrinho//itens`. Normalizar (`\/+` → `/`, remover barra final) antes de comparar evita 58 falsos positivos.

**Express usa `:id`, OpenAPI usa `{id}`.** Sem reduzir os dois a um marcador comum, toda rota com parâmetro aparece como divergente nos dois sentidos. Normalizar para `{}` resolve.

**`/health` e `/api/v1/docs` ficam fora do contrato de negócio.** São infraestrutura; o `/health` existe justamente fora do versionamento porque é o caminho que o health check das plataformas usa. Excluí-los explicitamente do confronto evita "consertar" o que está certo.

**Documentar nos dois sentidos é o que mantém a spec honesta.** Spec → app pega rota fictícia (`$ref` para endpoint que não existe). App → spec pega o que apodrece em silêncio: rota nova entra em produção e ninguém lembra de documentar. A API continua funcionando, então nada quebra — só a documentação passa a mentir por omissão. Validei os dois sentidos mutando a spec de propósito.

---

## Deploy (FASE 23)

**O PostgreSQL gratuito do Render expira em 30 dias e leva os dados.** Não há opção de congelar: depois de 14 dias de carência, o banco é apagado. Isso invalida o caminho óbvio de criar os três serviços no Render. O banco fica no Neon, que tem plano gratuito permanente (0,5 GB, 100 h de processamento/mês).

**`preDeployCommand` e Shell/SSH são exclusivos de planos pagos do Render.** Os dois são exatamente o que um deploy de backend precisa — rodar migrations e criar o administrador — e o plano gratuito não oferece nenhum. O blueprint contorna: migrations vão no `startCommand` (`npm run migrate && npm start`), onde o `&&` preserva a propriedade importante (migration falha → servidor não sobe → versão anterior continua no ar). O seed, que precisa de terminal, é encadeado no start por uma vez.

**O seed imprime uma senha que não volta.** Como não há Shell no plano gratuito, a única forma de capturá-la é ler os logs do deploy em que o seed rodou. O guia insiste em reverter o `startCommand` depois, senão o seed roda em todo deploy.

**`?sslmode=require` na `DATABASE_URL` é o que liga o TLS.** O driver `pg` 8.23 lê esse parâmetro da URL e configura o SSL sozinho — nenhuma mudança no `pool.js` foi necessária. Provedores gerenciados recusam conexão sem TLS, e o erro que aparece é de conexão, não de SSL, o que despista.

**`VITE_API_URL` é lida em tempo de BUILD.** O navegador é quem lê a variável; não há servidor para injetá-la depois. Corrigir a variável sem forçar um novo deploy não muda nada — o bundle continua com o valor antigo. Usei isso a favor para confirmar que a URL entrou no bundle: `grep` no `dist/assets/*.js`.

**Validar o `render.yaml` antes de confiar nele.** Rodei o `startCommand` real (`npm run migrate && npm start`) contra o banco local, em `NODE_ENV=production`, e conferi: `/health` 200 com `banco: "ok"`, docs em 404, CORS liberando só a origem configurada, guarda de segredos recusando subir. Para o caso de falha, criei uma migration inválida de propósito e confirmei `exit=1` com o servidor não subindo. Sem esses testes, os dois erros de plano gratuito só apareceriam no primeiro deploy real.
