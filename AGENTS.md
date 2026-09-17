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

Fases 0–9 concluídas (estrutura, banco, backend base, usuários, autenticação JWT, agricultores, categorias, produtos, busca e filtros). Próxima: FASE 10 (carrinho).
Divergências encontradas no ambiente (ex.: container de banco caído) foram diagnosticadas e resolvidas, não contornadas.
Suíte de testes: 292 testes, 11 suítes, todos passando.

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
