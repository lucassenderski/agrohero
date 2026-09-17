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
| 7 | Categorias | próxima |
| 8 | Produtos | pendente |
| 9 | Busca e filtros | pendente |
| 10 | Carrinho | pendente |
| 11 | Checkout | pendente |
| 12 | Pedidos | pendente |
| 13 | Pagamentos | pendente |
| 14 | Avaliações | pendente |
| 15 | Frontend | pendente |
| 16 | Integração frontend + backend | pendente |
| 17 | Painel do consumidor | pendente |
| 18 | Painel do agricultor | pendente |
| 19 | Painel administrador | pendente |
| 20 | Segurança | pendente |
| 21 | Testes completos | pendente |
| 22 | Documentação | pendente |
| 23 | Deploy | pendente |
| 24 | Testes em produção | pendente |

---

## Tecnologias

**Backend:** Node.js 22, Express 4, PostgreSQL 16, `pg`, JWT, bcrypt, Zod, Helmet, Pino, Swagger  
**Frontend:** React 18, Vite 5, React Router 6  
**Banco:** PostgreSQL 16 (Docker Compose em desenvolvimento)  
**Testes:** Jest + Supertest (integração real contra PostgreSQL)

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

### 6. Banco de testes

Os testes de integração usam um banco separado e descartável:

```bash
docker exec agrohero_db psql -U agrohero -d postgres -c "CREATE DATABASE agrohero_test;"
cd backend && npm test
```

Os testes **recriam o schema do zero** a cada execução, então não dependem de você ter rodado as migrations antes.

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
| GET | `/api/v1/agricultores/:id/avaliacoes` | 🔓 | Avaliações recebidas |

**Planejado (Fases 7–19):**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/categorias` | 🔓 | Lista de categorias |
| POST/PUT/DELETE | `/categorias/:id` | 🛡️ | Gerenciar categorias |
| GET | `/produtos` | 🔓 | Busca, filtros, ordenação e paginação |
| GET | `/produtos/:id` | 🔓 | Detalhe do produto |
| POST/PUT/PATCH/DELETE | `/produtos` | 🧑‍🌾 | Gerenciar os próprios produtos |
| GET/POST/PUT/DELETE | `/carrinho` | 👤 | Carrinho persistente |
| POST | `/checkout/preview` | 👤 | Recalcular valores sem gravar |
| POST | `/checkout` | 👤 | Criar pedido (transação) |
| GET | `/pedidos` | 👤 | Meus pedidos |
| GET | `/pedidos/:id` | 🔐 | Detalhe do pedido |
| PATCH | `/pedidos/:id/cancelar` | 👤 | Cancelar pedido |
| PATCH | `/pedidos/:pedidoId/itens/:itemId/status` | 🧑‍🌾 | Alterar status dos próprios itens |
| POST | `/pagamentos/:pedidoId` | 👤 | Iniciar pagamento |
| POST | `/webhooks/pagamento` | 🔓 | Callback do gateway (assinatura verificada) |
| POST | `/avaliacoes` | 👤 | Avaliar produto comprado |
| GET | `/admin/*` | 🛡️ | Métricas, usuários, moderação |

Filtros de `/produtos`: `busca`, `categoria_id`, `agricultor_id`, `cidade`, `estado`, `preco_min`, `preco_max`, `disponivel`, `ordenar`, `pagina`, `limite`.

Documentação interativa das rotas já implementadas: **http://localhost:3001/api/v1/docs**

O Swagger UI executa as requisições direto do navegador, o que ajuda a testar cada fase conforme ela é implementada.

> As rotas marcadas como planejadas ainda **não** existem. Cada uma entra nesta tabela e no Swagger na fase em que for implementada, para que a documentação nunca descreva algo que não funciona.

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
