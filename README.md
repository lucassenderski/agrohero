# AgroHero — Marketplace de Produtos Orgânicos

Marketplace que conecta produtores rurais diretamente a consumidores de produtos orgânicos.

O sistema é funcional de ponta a ponta: frontend + backend + PostgreSQL, com autenticação, autorização, catálogo, carrinho, checkout transacional, pedidos e painéis por perfil.

---

## Status do projeto

Desenvolvimento em fases, cada uma testada antes de avançar.

| Fase | Descrição | Situação |
|---|---|---|
| 0 | Planejamento e arquitetura | ✅ |
| 1 | Estrutura, PostgreSQL local, `/health`, testes | ✅ |
| 2 | Banco de dados (migrations e seeds) | ✅ |
| 3 | Backend base (validação, paginação, repositório, docs) | ✅ |
| 4 | Usuários | ✅ |
| 5 | Autenticação JWT | ✅ |
| 6 | Agricultores | ✅ |
| 7 | Categorias | ✅ |
| 8 | Produtos | ✅ |
| 9 | Busca e filtros | ✅ |
| 10 | Carrinho | ✅ |
| 11 | Checkout | ✅ |
| 12 | Pedidos | ✅ |
| 13 | Pagamentos (webhook e estorno) | ✅ |
| 14 | Avaliações | ✅ |
| 15 | Frontend (estrutura, rotas, cliente HTTP, contextos) | ✅ |
| 16 | Integração frontend + backend | ✅ |
| 17 | Painel do consumidor (endereços e avaliações) | ✅ |
| 18 | Painel do agricultor | ✅ |
| 19 | Painel administrador | ✅ |
| 20 | Seguranca (auditoria, testes negativos e guarda de producao) | ✅ |
| 21 | Testes completos (unidade, integracao, cobertura) | ✅ |
| 22 | Documentação (OpenAPI sincronizada com o código) | ✅ |
| 23 | Deploy | pendente |
| 24 | Testes em produção | pendente |

---

## Tecnologias

**Backend:** Node.js 22, Express 4, PostgreSQL 16, `pg`, JWT, bcrypt, Zod, Helmet, Pino, Swagger  
**Frontend:** React 18, Vite 5, React Router 6  
**Banco:** PostgreSQL 16 (Docker Compose em desenvolvimento)  
**Testes:** backend com Jest + Supertest e frontend com Vitest + Testing Library; ambos de integração, contra PostgreSQL e API reais (sem mocks)

---

## Como rodar o projeto

### Pré-requisitos

- Node.js 20 ou superior
- Docker e Docker Compose

### 1. Clonar e entrar no projeto

```bash
git clone <url-do-repositorio>
cd agrohero
```

### 2. Subir o PostgreSQL

```bash
docker compose up -d
docker compose ps        # aguarde aparecer "healthy"
```

O banco fica na porta **5433** do seu computador (mapeada para a 5432 do container), escolhida para não conflitar com um PostgreSQL que já exista na 5432.

### 3. Configurar e subir o backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

A API sobe em `http://localhost:3001`. Confira:

```bash
curl http://localhost:3001/health
```

### 4. Configurar e subir o frontend

Em outro terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Acesse `http://localhost:5173`.

### 5. Criar o schema e os dados iniciais

Com o banco no ar:

```bash
cd backend
npm run migrate    # cria as 11 tabelas, indices, triggers e a view
npm run seed       # cria as 7 categorias e o usuario administrador
```

O `npm run seed` imprime **uma vez** a senha do administrador:

```
============================================================
  ADMINISTRADOR CRIADO
============================================================
  E-mail: admin@agrohero.local
  Senha : d!mNBeke@SbxLFP&6g@S
============================================================
```

Anote a senha. Ela é gerada aleatoriamente a cada ambiente e não é exibida de novo — assim nenhum ambiente nasce com uma senha conhecida e versionada no Git.

Ambos os comandos são seguros para rodar mais de uma vez: as migrations sabem o que já foi aplicado e os seeds não duplicam dados.

### 6.1. Banco de testes

Os testes de integração usam um banco separado e descartável:

```bash
docker exec agrohero_db psql -U agrohero -d postgres -c "CREATE DATABASE agrohero_test;"
cd backend && npm test
```

Os testes **recriam o schema do zero** a cada execução, então não dependem de você ter rodado as migrations antes.

### 6.2. Estratégia de testes

São dois níveis, cada um cobrindo o que o outro não alcança:

| Nível | Onde | O que verifica | Quantidade |
|---|---|---|---|
| Unidade | `backend/tests/unit/` | funções puras: tradução de erro do PostgreSQL, autorização por papel, escape de busca, guarda de produção | 43 |
| Integração | `backend/tests/integration/` | rotas de verdade contra PostgreSQL real | 547 |
| Integração | `frontend/src/testes/` | telas de verdade contra a API real (sem mock de `fetch`) | 28 |

O frontend não testa com mock porque o que ele precisa verificar é justamente o que um mock esconde: o formato do envelope, os nomes dos campos, os códigos de erro e as regras de autorização.

```bash
cd backend
npm run test:unit        # só os testes de unidade (rápidos, sem banco)
npm test                 # tudo
npm run test:coverage    # com relatório de cobertura
```

Cobertura atual do backend: **84% das linhas**. As lacunas estão em caminhos que não têm rota (integração real com o Mercado Pago, `requireDono` — ver a nota abaixo).

`requireDono` existe e está testado como unidade, mas nenhuma rota o usa: a checagem de propriedade acontece dentro dos services, que já têm o recurso carregado e podem comparar o dono sem uma segunda consulta ao banco.

### 6.3. Testes do frontend

Os testes do frontend também são de integração: nenhum `fetch` é mockado, cada
teste fala com a API de verdade. Por isso eles exigem um backend no ar.

Use um servidor em modo `test`, apontando para o banco descartável
(`agrohero_test`). Nesse modo o rate limit fica desligado — sem isso, uma suíte
com vários cadastros estoura o limite de tentativas e falha por motivo errado:

```bash
cd backend
NODE_ENV=test PORT=3002 \
  DATABASE_URL_TEST=postgresql://agrohero:agrohero_dev@localhost:5433/agrohero_test \
  node src/server.js
```

Em outro terminal:

```bash
cd frontend
npm test          # executa uma vez (vitest run)
npm run test:watch
```

Os testes usam `http://localhost:3002/api/v1` por padrão. Para apontar para
outro servidor, defina `VITE_API_URL` antes de rodar:

```bash
VITE_API_URL=http://localhost:3001/api/v1 npm test
```

---

### 7. Variáveis sensíveis

O `.env` fica fora do Git (está no `.gitignore`). O `.env.example` mostra só os nomes, com valores de exemplo. Duas chaves merecem atenção:

| Variável | Para que serve | Se faltar |
|---|---|---|
| `JWT_SECRET` | Assina os tokens de acesso | A aplicação não sobe (validação exige 32+ caracteres) |
| `PAYMENT_WEBHOOK_SECRET` | Verifica a assinatura dos webhooks | Webhook recusado com 500 (falha fechada, nunca aberta) |

Gere cada uma com um valor aleatório próprio:

```bash
openssl rand -hex 32
```

Usar o mesmo valor nas duas é um erro: rotacionar o segredo do webhook não deve invalidar as sessões dos usuários.

### 8. Testar o webhook de pagamento

O gateway `fake` só grava a transação, sem chamar serviço externo. Para simular o pagador concluindo o PIX e ver a confirmação chegar por webhook:

```bash
cd backend
node --input-type=module -e "
import gatewayFake from './src/services/gateways/gatewayFake.js';
import pedidoRepository from './src/repositories/pedidoRepository.js';

const pagamento = await pedidoRepository.buscarPagamentoPorPedido(1);
gatewayFake._simularPagamentoConfirmado(pagamento.identificador_externo);
console.log('Gateway agora diz APROVADO para', pagamento.identificador_externo);
"
```

E envie o webhook assinado:

```bash
SECRET=$(grep '^PAYMENT_WEBHOOK_SECRET=' backend/.env | cut -d= -f2-)
BODY='{"pedido_id":1}'
HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

curl -X POST http://localhost:3001/api/v1/webhooks/pagamento \
  -H 'Content-Type: application/json' \
  -H "x-agrohero-signature: sha256=$HASH" \
  -d "$BODY"
```

Confira o resultado:

```json
{"sucesso":true,"dados":{"processado":true,"status":"APROVADO","pagamento":{...}}}
```

Se `x-agrohero-signature` estiver errado ou ausente, a resposta é **403** e nada muda. O corpo do webhook não define o status: o servidor consulta o gateway e aplica a resposta dele.

### 9. Testar as avaliações

Quem pode avaliar? Três condições precisam valer ao mesmo tempo, e nenhuma delas vem do corpo da requisição:

1. o produto está em um pedido do consumidor autenticado;
2. o item está com status **ENTREGUE**;
3. ainda não existe avaliação daquele produto naquele pedido.

A checagem do status é **por item**, e não pelo pedido inteiro. Em um pedido com produtos de dois produtores, o produtor A pode ter entregue enquanto o B ainda está enviando — e a avaliação do item que chegou não deve esperar o outro.

O corpo aceita `pedido_id`, `produto_id`, `nota` e `comentario`. Não aceita `consumidor_id` (vem do token) nem `agricultor_id` (vem do item do pedido): como a validação descarta campos não declarados, enviar esses valores não tem efeito.

```bash
# Avaliar um produto recebido
curl -X POST http://localhost:3001/api/v1/avaliacoes \
  -H "Authorization: Bearer $TOKEN_CLIENTE" \
  -H 'Content-Type: application/json' \
  -d '{"pedido_id":1,"produto_id":1,"nota":5,"comentario":"Tomate excelente"}'

# Reputação pública do produto (sem token)
curl http://localhost:3001/api/v1/avaliacoes/produto/1

# O que este pedido ainda tem para avaliar
curl http://localhost:3001/api/v1/avaliacoes/pendentes/1 \
  -H "Authorization: Bearer $TOKEN_CLIENTE"
```

Respostas esperadas: **422** (`ITEM_NAO_ENTREGUE`) antes da entrega, **404** se o pedido não for do consumidor ou o produto não estiver nele, **409** ao tentar avaliar o mesmo item duas vezes.

Para editar, envie apenas o que muda. `comentario: null` apaga o texto; omitir o campo mantém o atual:

```bash
curl -X PUT http://localhost:3001/api/v1/avaliacoes/1 \
  -H "Authorization: Bearer $TOKEN_CLIENTE" \
  -H 'Content-Type: application/json' \
  -d '{"nota":3,"comentario":null}'
```

A média exposta em `/produtos/:id` (`media_avaliacoes`) e o perfil do produtor se ajustam na hora — inclusive quando uma avaliação é apagada.

---

## Estrutura do repositório

```
agrohero/
├── docker-compose.yml     PostgreSQL local
├── backend/               API REST (ver backend/README.md)
└── frontend/              Interface React (ver frontend/README.md)
```

---

## Arquitetura

O backend segue uma arquitetura em camadas, com responsabilidades bem separadas:

```
Requisição HTTP
   ↓
routes        define a URL e encadeia middlewares
   ↓
middlewares   autenticação → autorização → validação → controller
   ↓
controllers   lê a requisição, chama o service, monta a resposta
   ↓
services      regra de negócio e transações
   ↓
repositories  único lugar que executa SQL, sempre parametrizado
   ↓
database      pool de conexões PostgreSQL
```

Regra de ouro: **controller não escreve SQL, repository não decide regra de negócio, service não conhece `req`/`res`**. Isso mantém o checkout testável sem subir servidor HTTP.

---

## Modelo de dados

### Entidades

`usuarios` · `agricultores` · `categorias` · `produtos` · `enderecos` · `carrinhos` · `carrinho_itens` · `pedidos` · `pedido_itens` · `pagamentos` · `avaliacoes`

### Relacionamentos

```
usuarios    1 ──── 0..1 agricultores      (um usuário pode ter um perfil de produtor)
usuarios    1 ──── 0..1 carrinhos
usuarios    1 ──── N    enderecos
usuarios    1 ──── N    pedidos           (como consumidor)
agricultores 1 ─── N    produtos
categorias  1 ──── N    produtos
carrinhos   1 ──── N    carrinho_itens    → 1 produtos
pedidos     1 ──── N    pedido_itens      → 1 produtos, → 1 agricultores
pedidos     1 ──── N    pagamentos
pedidos     1 ──── N    avaliacoes        → 1 produtos
```

Tipos de usuário: `cliente`, `agricultor`, `administrador`.

### Regra multi-agricultor

Um pedido pode conter produtos de vários produtores. Para que o agricultor A nunca altere dados do agricultor B:

- **`pedido_itens.status`** é o status real, por item. Cada agricultor altera apenas os próprios itens.
- **`pedidos.status`** é derivado do conjunto de itens (todos PENDENTE → PENDENTE; algum em andamento → PROCESSANDO; todos ENVIADO → ENVIADO; todos ENTREGUE → ENTREGUE).
- `pedido_itens.agricultor_id` é denormalizado de propósito: é ele que permite aplicar a regra de propriedade sem consultar a tabela de produtos.

### Estados do pedido

```
PENDENTE → PROCESSANDO → ENVIADO → ENTREGUE
     ↘          ↘          ↘
            CANCELADO
```

`ENTREGUE` e `CANCELADO` são terminais. Cancelamento devolve o estoque dos itens cancelados.

---

## API

Prefixo `/api/v1`. Envelope único:

```json
{ "sucesso": true, "dados": { }, "paginacao": { "pagina": 1, "limite": 20, "total": 137, "paginas": 7 } }
{ "sucesso": false, "erro": { "codigo": "ESTOQUE_INSUFICIENTE", "mensagem": "Estoque insuficiente para Tomate." } }
```

Legenda: 🔓 público · 🔐 autenticado · 👤 cliente · 🧑‍🌾 agricultor · 🛡️ administrador

**Implementado até agora (Fases 1–5):**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/health` | 🔓 | Saúde da API e do banco |
| GET | `/api/v1/docs` | 🔓 | Documentação interativa (Swagger UI) |
| GET | `/api/v1/docs/openapi.json` | 🔓 | Especificação OpenAPI em JSON |
| POST | `/api/v1/auth/register` | 🔓 | Cadastro (cliente ou agricultor) |
| POST | `/api/v1/auth/login` | 🔓 | Login (retorna JWT) |
| GET | `/api/v1/usuarios/profile` | 🔐 | Perfil do usuário logado |
| PUT | `/api/v1/usuarios/profile` | 🔐 | Editar o próprio perfil |
| PUT | `/api/v1/usuarios/senha` | 🔐 | Trocar a própria senha |
| GET | `/api/v1/agricultores` | 🔓 | Lista pública de produtores |
| GET | `/api/v1/agricultores/:id` | 🔓 | Perfil público do produtor |
| GET | `/api/v1/agricultores/:id/produtos` | 🔓 | Vitrine paginada do produtor |
| GET | `/api/v1/agricultores/:id/avaliacoes` | 🔓 | Avaliações recebidas (perfil público) |
| GET | `/api/v1/categorias` | 🔓 | Lista categorias ativas |
| GET | `/api/v1/categorias/:id` | 🔓 | Detalhe por id ou slug |
| GET | `/api/v1/admin/categorias` | 🛡️ | Lista incluindo desativadas |
| POST | `/api/v1/admin/categorias` | 🛡️ | Criar categoria |
| GET/PUT/DELETE | `/api/v1/admin/categorias/:id` | 🛡️ | Ver, editar, desativar |
| PATCH | `/api/v1/admin/categorias/:id/ativar` | 🛡️ | Reativar categoria |
| GET | `/api/v1/produtos` | 🔓 | Catálogo: busca, filtros, ordenação, paginação |
| GET | `/api/v1/produtos/:id` | 🔓 | Detalhe público do produto |
| GET | `/api/v1/produtos/meus` | 🧑‍🌾 | Produtos do próprio agricultor (inclui inativos) |
| POST | `/api/v1/produtos` | 🧑‍🌾 | Criar produto (dono vem do token) |
| PUT/PATCH | `/api/v1/produtos/:id` | 🧑‍🌾 | Editar o próprio produto |
| PATCH | `/api/v1/produtos/:id/disponibilidade` | 🧑‍🌾 | Tirar do ar / recolocar |
| PATCH | `/api/v1/produtos/:id/estoque` | 🧑‍🌾 | Repor estoque (soma) |
| DELETE | `/api/v1/produtos/:id` | 🧑‍🌾 | Desativar (exclusão lógica) |
| GET | `/api/v1/carrinho` | 👤 | Carrinho do consumidor (cria na 1ª chamada) |
| POST | `/api/v1/carrinho/itens` | 👤 | Adicionar produto (soma quantidade) |
| PATCH | `/api/v1/carrinho/itens/:produtoId` | 👤 | Definir quantidade exata |
| DELETE | `/api/v1/carrinho/itens/:produtoId` | 👤 | Remover item |
| DELETE | `/api/v1/carrinho` | 👤 | Esvaziar carrinho |
| GET | `/api/v1/carrinho/validacao` | 👤 | Revalidar preços e estoque |
| GET/POST | `/api/v1/enderecos` | 👤 | Endereços de entrega (dado pessoal) |
| GET/PUT/DELETE | `/api/v1/enderecos/:id` | 👤 | Detalhe, edição e remoção |
| PATCH | `/api/v1/enderecos/:id/principal` | 👤 | Definir endereço principal |
| POST | `/api/v1/checkout/preview` | 👤 | Resumo calculado sem gravar |
| POST | `/api/v1/checkout` | 👤 | Finalizar compra (transação) |
| GET | `/api/v1/pedidos` | 👤 | Pedidos do consumidor, com itens |
| GET | `/api/v1/pedidos/agricultor` | 🧑‍🌾 | Itens do produtor (só os dele) |
| GET | `/api/v1/pedidos/:id` | 🔐 | Detalhe — visão por tipo de usuário |
| PATCH | `/api/v1/pedidos/:id/cancelar` | 👤 | Cancelar pedido (devolve estoque) |
| PATCH | `/api/v1/pedidos/:id/itens/:itemId/status` | 🧑‍🌾 | Avançar status do próprio item |
| DELETE | `/api/v1/pedidos/:id/itens/:itemId` | 🧑‍🌾 | Cancelar o próprio item |
| GET | `/api/v1/admin/pedidos` | ⚙️ | Todos os pedidos |
| PATCH | `/api/v1/admin/pedidos/:id/status` | ⚙️ | Avançar pedido inteiro |
| POST | `/api/v1/webhooks/pagamento` | 🔓 | Notificação do gateway (assinatura HMAC) |
| GET | `/api/v1/avaliacoes/produto/:produtoId` | 🔓 | Avaliações do produto (média e total) |
| GET | `/api/v1/avaliacoes/agricultor/:agricultorId` | 🔓 | Avaliações do produtor (com distribuição de notas) |
| POST | `/api/v1/avaliacoes` | 👤 | Avaliar produto recebido |
| PUT/DELETE | `/api/v1/avaliacoes/:id` | 👤 | Editar / apagar a própria avaliação |
| GET | `/api/v1/avaliacoes/minhas` | 👤 | Avaliações que o consumidor escreveu |
| GET | `/api/v1/avaliacoes/pendentes/:pedidoId` | 👤 | Itens entregues e ainda não avaliados |

**Planejado (Fases 15–19):**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/admin/*` | 🛡️ | Métricas, usuários, moderação |

Filtros de `/produtos`: `busca`, `categoria_id`, `agricultor_id`, `cidade`, `estado`, `preco_min`, `preco_max`, `disponivel`, `ordenar`, `pagina`, `limite`.

Documentação interativa das rotas já implementadas: **http://localhost:3001/api/v1/docs**

O Swagger UI executa as requisições direto do navegador, o que ajuda a testar cada fase conforme ela é implementada.

A especificação em JSON fica em `/api/v1/docs/openapi.json` — é ela que serve de base para gerar clientes ou importar no Postman/Insomnia.

### Sincronia entre documentação e código

A documentação acima não é escrita à mão por fora do app: ela é testada nos dois sentidos, para não descrever rota que não existe nem esquecer rota que existe.

| Sentido | O que pega | Como |
|---|---|---|
| Spec → app | rota documentada que não existe (o "Try it out" devolveria 404) | o caminho documentado tem que estar na pilha de routers do Express |
| App → spec | rota nova no app que ninguém documentou | toda rota de negócio da pilha tem que estar no OpenAPI |

A verificação não usa requisição HTTP para decidir se uma rota existe. Um router protegido aplica `checkJwt` no router inteiro, antes do 404 — uma rota fictícia sob `/api/v1/carrinho/` responderia 401 e passaria como "existe". A fonte da verdade é a pilha de routers (`app._router.stack`), onde ou o caminho está, ou não está.

`/health`, `/api/v1/docs` e `/` ficam de fora do contrato de negócio: são infraestrutura.

Todos os schemas referenciados por `$ref` também são verificados, e toda operação precisa ter `summary` e ao menos uma resposta declarada — documentação pela metade parece completa e não é.

---

## Segurança

- Senhas com bcrypt (custo 12); nunca armazenadas em texto puro
- JWT com payload mínimo (`sub`, `tipo`); `JWT_SECRET` só em variável de ambiente
- `checkJwt` valida assinatura e expiração e recarrega o usuário (bloqueio tem efeito imediato)
- `requireRole('agricultor' | 'cliente' | 'administrador')` por rota
- Validação de entrada com Zod em body, params e query
- SQL Injection: sempre queries parametrizadas (`$1`, `$2`); ordenação por lista branca
- IDOR: toda operação sensível resolve o proprietário pelo **token**, nunca pelo corpo da requisição
- Preço, quantidade e estoque recalculados no servidor; o valor enviado pelo frontend é ignorado
- CORS com lista branca; origem desconhecida recebe 403
- Rate limit global e restrito em `/auth`
- Helmet, limite de 1 MB no corpo, tratamento de erro sem stack trace
- Log com redação de senha, token e dados de cartão
- Nenhum dado de cartão é armazenado (responsabilidade do gateway)
- Guarda de produção: a API **recusa subir** se `JWT_SECRET` ou `PAYMENT_WEBHOOK_SECRET` forem valores de exemplo, se `CORS_ORIGINS` tiver `*` ou usar `http://`

### Testes de segurança

`backend/tests/integration/seguranca.test.js` cobre o checklist de segurança como
testes negativos — o que importa é o que o sistema **recusa**:

| Área | O que é verificado |
|---|---|
| SQL Injection | aspas, comentário e `UNION` no filtro não quebram a query nem vazam outra tabela |
| Senhas | resposta sem senha/hash, hash bcrypt no banco, login sem enumeração de contas |
| JWT | payload só com `sub` e `tipo` — sem e-mail, telefone ou senha |
| Exposição | erro de validação e 404 sem stack trace |
| IDOR | pedido, produto, item e endereço de outro usuário |
| Acesso vertical | cliente não cria produto, agricultor não entra no admin |
| Preço/quantidade | preço do corpo é ignorado; quantidade acima do estoque é recusada |
| Estoque | checkout não deixa estoque negativo e não grava pedido pela metade |
| Status | valor inválido e transição fora da regra |
| Autenticação | token ausente, adulterado, de usuário bloqueado ou removido |
| CORS | origem desconhecida recebe 403; `x-powered-by` ausente; Helmet presente |
| Escalação | cadastro não aceita `administrador`; `tipo` no corpo é descartado |

---

## Comandos úteis

| Comando | Onde | O que faz |
|---|---|---|
| `docker compose up -d` | raiz | Sobe o PostgreSQL |
| `docker compose down` | raiz | Para o PostgreSQL (mantém os dados) |
| `docker compose down -v` | raiz | Para e **apaga** os dados |
| `npm run migrate` | backend | Aplica as migrations pendentes |
| `npm run seed` | backend | Cria categorias e o administrador |
| `npm run dev` | backend | API com reload automático |
| `npm test` | backend | Testes de integração |
| `npm run dev` | frontend | Interface em desenvolvimento |
| `npm run build` | frontend | Build de produção |

---

## Deploy

Estratégia para deploy gratuito (verificada em setembro de 2026):

| Camada | Serviço | Limitações |
|---|---|---|
| Frontend | Vercel ou Cloudflare Pages | estático, sem sleep |
| Backend | Render (plano free) | dorme após 15 min ociosos; cold start de 30–60 s |
| PostgreSQL | Neon (plano free) | 0,5 GB; escala a zero e volta sozinho |
| Imagens | Cloudinary (plano free) | 3 GB de storage, 10 GB de tráfego |

> O PostgreSQL gratuito do Render expira em 30 dias e é apagado — por isso o banco fica no Neon.
> O plano gratuito do Supabase pausa o projeto após 7 dias sem uso e exige reativação manual.

O passo a passo detalhado de deploy é feito na Fase 23.

---

## Licença

Projeto acadêmico.
