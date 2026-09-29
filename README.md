# AgroHero — Marketplace de Produtos Orgânicos

Marketplace que conecta agricultores familiares de Toledo (PR) diretamente a consumidores locais.

O sistema é funcional de ponta a ponta — frontend + backend + PostgreSQL — e está **em produção**:

| Camada | Serviço | Endereço |
|---|---|---|
| Interface | Vercel | https://agrohero-six.vercel.app |
| API | Render | https://agrohero.onrender.com |
| Banco | Neon (PostgreSQL) | — |

Abra a vitrine em **https://agrohero-six.vercel.app**; a API responde em **https://agrohero.onrender.com/health**.

O diferencial do projeto é o **pagamento na retirada**: não há gateway, webhook nem cobrança online. O checkout registra apenas *como* o consumidor pretende pagar e cada produtor confirma o recebimento no próprio painel. Essa decisão vem do público real — o agricultor familiar vende na feira, e um gateway online traria taxas, exigência de conta de recebimento e inadimplência para vendas pequenas.

---

## Status do projeto

Desenvolvido em fases, cada uma testada antes de avançar. Fases **0 a 23 concluídas**; a 24 é acompanhamento contínuo.

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
| 13 | Pagamentos na retirada (PIX, cartão, dinheiro) | ✅ |
| 14 | Avaliações | ✅ |
| 15 | Frontend (estrutura, rotas, cliente HTTP, contextos) | ✅ |
| 16 | Integração frontend + backend | ✅ |
| 17 | Painel do consumidor (endereços e avaliações) | ✅ |
| 18 | Painel do agricultor | ✅ |
| 19 | Painel administrador | ✅ |
| 20 | Segurança (auditoria, testes negativos e guarda de produção) | ✅ |
| 21 | Testes completos (unidade, integração, cobertura) | ✅ |
| 22 | Documentação (OpenAPI sincronizada com o código) | ✅ |
| 23 | Deploy (publicado em Vercel + Render + Neon) | ✅ |
| 24 | Testes em produção (acompanhamento contínuo) | contínuo |

**Estado atual:** 48 rotas de API (65 operações), 22 rotas de interface, 12 tabelas de negócio, 10 migrations, **692 testes passando** (630 no backend, 62 no frontend).

---

## Funcionalidades

### Para o consumidor
Catálogo com busca, filtros (categoria, produtor, cidade, faixa de preço, disponibilidade) e ordenação; carrinho com revalidação de preço e estoque; múltiplos endereços com um principal; checkout transacional com cálculo de frete; histórico de pedidos; avaliação dos produtos já recebidos.

### Para o agricultor
Cadastro de produtos com estoque e unidade; ativação/desativação (tirar do ar); reposição de estoque; logo da propriedade; painel com os pedidos que contêm itens seus; atualização do status **por item**; e confirmação do recebimento do pagamento na retirada.

### Para o administrador
Gestão de categorias (criar, editar, desativar, reativar) e acompanhamento dos pedidos, com avanço de status do pedido inteiro.

### Conteúdo editorial
As páginas **Receitas** e **Sobre a iniciativa** não dependem da API para o texto: abrem mesmo com o backend fora do ar. As 6 receitas ligam seus ingredientes ao catálogo real (comparação por palavra inteira) para permitir comprar tudo de uma vez. A página `/sobre` apresenta a iniciativa em Toledo-PR, a missão e os distritos atendidos.

---

## Tecnologias

**Backend:** Node.js 22, Express 4, PostgreSQL 16, `pg`, JWT, bcrypt, Zod, Helmet, Pino, Swagger, `sharp` (imagens)
**Frontend:** React 18, Vite 5, React Router 6
**Banco:** PostgreSQL 16 (Docker Compose em desenvolvimento; Neon em produção)
**Testes:** backend com Jest + Supertest e frontend com Vitest + Testing Library; ambos de integração, contra PostgreSQL e API reais (sem mocks)

---

## Como rodar o projeto

### Pré-requisitos

- Node.js 20 ou superior
- Docker e Docker Compose

### 1. Clonar e entrar no projeto

```bash
git clone https://github.com/lucassenderski/agrohero.git
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
npm run migrate    # cria as 12 tabelas, índices, triggers e a view
npm run seed       # cria as 7 categorias e o usuário administrador
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

### 5.1. Catálogo demonstrativo (opcional)

Um banco recém-criado tem categorias, mas nenhum produto — a vitrine fica vazia e a página de receitas não tem com o que casar os ingredientes. Para popular um catálogo de demonstração:

```bash
cd backend
npm run seed:catalogo
```

Isso cria 3 produtores de Toledo-PR e 12 produtos (hortaliças, raízes, ovos, mel e geleia), escolhidos para que os ingredientes das 6 receitas encontrem um produto na vitrine. O comando imprime uma vez o e-mail das 3 contas de demonstração e a senha, igual ao administrador.

O script é idempotente: rodar de novo não duplica produtor nem produto, e **não sobrescreve** preço ou estoque de produto que já existe.

> **Não é para produção.** Os dados são fictícios. Por isso este seed **não** fica na pasta `seeds/`, que roda automaticamente no `npm run seed` — e no plano gratuito do Render o seed é encadeado no `startCommand`, então o que está em `seeds/` pode acabar gravado no banco de produção. Quem decide rodar o catálogo demonstrativo é uma pessoa, com o comando acima.

---

## Testes

### Estratégia

São **três níveis**, cada um cobrindo o que o outro não alcança:

| Nível | Onde | O que verifica | Quantidade |
|---|---|---|---|
| Unidade | `backend/tests/unit/` | funções puras: tradução de erro do PostgreSQL, autorização por papel, escape de busca, guarda de produção, e-mail | 56 |
| Integração | `backend/tests/integration/` | rotas de verdade contra PostgreSQL real | 574 |
| Integração | `frontend/src/testes/` | telas de verdade contra a API real (sem mock de `fetch`) | 62 |

Total: **692 testes** (25 suítes no backend, 11 no frontend).

O frontend não testa com mock porque o que ele precisa verificar é justamente o que um mock esconde: o formato do envelope, os nomes dos campos, os códigos de erro e as regras de autorização.

### Como rodar

Os testes de integração do backend usam um banco separado e descartável, `agrohero_test`:

```bash
docker exec agrohero_db psql -U agrohero -d postgres -c "CREATE DATABASE agrohero_test;"
```

```bash
cd backend
npm run test:unit        # só os testes de unidade (rápidos, sem banco)
npm test                 # tudo (recria o schema do zero)
npm run test:coverage    # com relatório de cobertura
```

Os testes **recriam o schema do zero** a cada execução, então não dependem de você ter rodado as migrations antes.

### Testes do frontend

Também são de integração: nenhum `fetch` é mockado. Exigem um backend no ar, em modo `test` — nesse modo o rate limit fica desligado, sem o que uma suíte com vários cadastros estoura o limite de tentativas e falha por motivo errado:

```bash
cd backend
NODE_ENV=test PORT=3002 \
  DATABASE_URL=postgresql://agrohero:agrohero_dev@localhost:5433/agrohero_test \
  node src/server.js
```

Em outro terminal:

```bash
cd frontend
npm test          # executa uma vez (vitest run)
npm run test:watch
```

Os testes usam `http://localhost:3002/api/v1` por padrão. Para apontar para outro servidor, defina `VITE_API_URL` antes de rodar:

```bash
VITE_API_URL=http://localhost:3001/api/v1 npm test
```

> Se rodar a suíte do backend e depois a do frontend sem resemear, o frontend falha em cascata: o `npm test` do backend recria o schema e **esvazia `categorias`**, e os testes do frontend criam produtos de verdade usando `categorias[0].id`. Resemeie entre as duas suítes:
> ```bash
> cd backend && DATABASE_URL=postgresql://agrohero:agrohero_dev@localhost:5433/agrohero_test \
>   node src/database/run-seeds.js
> ```

### Cobertura

```bash
cd backend && npm run test:coverage
```

| Métrica | Cobertura |
|---|---|
| Instruções | 83,09 % |
| Ramificações | 74,63 % |
| Funções | 83,94 % |
| Linhas | 83,71 % |

A cobertura é maior onde importa: **services 91,29 %** (a regra de negócio) e controllers 96,73 %. As lacunas estão em `src/database` (scripts de migration/seed, executados fora dos testes), `enderecoService` e `redefinicaoSenhaService`.

`requireDono` existe e está testado como unidade, mas nenhuma rota o usa: a checagem de propriedade acontece dentro dos services, que já têm o recurso carregado e podem comparar o dono sem uma segunda consulta ao banco.

---

## Pagamento na retirada

Não há gateway, webhook nem estorno. O checkout apenas registra **como** o consumidor pretende pagar — `PIX`, `CARTAO` ou `DINHEIRO` — e o pagamento em si acontece no balcão, entre consumidor e produtor.

O fluxo é:

1. o consumidor escolhe o método no checkout e confirma o pedido;
2. a API cria uma linha em `pagamentos` **por produtor**, com status `PENDENTE`;
3. o produtor confirma o recebimento no painel (`PATCH /api/v1/pedidos/:id/pagamento/confirmar`), o que muda o status para `PAGO`;
4. quando todos os produtores do pedido confirmam, o pedido fica com o pagamento completo.

O pagamento é por produtor, e não por pedido, porque um pedido pode ter itens de vários produtores e cada um recebe o seu. Com uma linha por pedido, "quem confirma o recebimento?" não teria resposta, e um produtor confirmaria o pagamento do produto de outro.

O consumidor não pode confirmar o pagamento: a rota exige o papel `agricultor` e responde **403** para qualquer outro. Um produtor que não participa do pedido recebe **404**, e não 403 — não se confirma a existência de pedido alheio.

Para testar sem interface, use um produtor de demonstração (ver `npm run seed:catalogo`) e chame a rota de confirmação com o token dele.

---

## Avaliações

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
```

---

## Variáveis sensíveis

O `.env` fica fora do Git (está no `.gitignore`). O `.env.example` mostra só os nomes, com valores de exemplo. As que merecem atenção:

| Variável | Para que serve | Se faltar |
|---|---|---|
| `JWT_SECRET` | Assina os tokens de acesso | A aplicação não sobe (validação exige 32+ caracteres) |
| `DATABASE_URL` | Conexão com o PostgreSQL | `/health` responde 503; a API continua no ar |
| `CORS_ORIGINS` | Lista branca de origens | O frontend recebe 403 |

Gere um segredo com um valor aleatório próprio:

```bash
openssl rand -hex 32
```

Não há segredo de gateway de pagamento: o pagamento é feito presencialmente, direto ao produtor, e confirmado por ele no painel. Nenhuma variável de integração de pagamento é necessária.

---

## Arquitetura

O backend segue uma arquitetura em camadas, com separação estrita de responsabilidades:

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

A regra de ouro é: **controller não escreve SQL, repository não decide regra de negócio, service não conhece `req`/`res`**. Isso mantém o checkout testável sem subir servidor HTTP.

Detalhes por módulo: **[backend/README.md](backend/README.md)** e **[frontend/README.md](frontend/README.md)**.

---

## Modelo de dados

**12 tabelas de negócio**, criadas por 10 migrations versionadas e idempotentes.

| Tabela | Papel |
|---|---|
| `usuarios` | Contas dos três perfis (cliente, agricultor, administrador) |
| `agricultores` | Perfil do produtor, com logo da propriedade |
| `enderecos` | Endereços de entrega do consumidor (um principal, garantido por índice único parcial) |
| `categorias` | Categorias do catálogo |
| `produtos` | Produtos, com estoque, preço e busca textual em português |
| `carrinhos` / `carrinho_itens` | Carrinho do consumidor (sem preço: o valor oficial vem de `produtos`) |
| `pedidos` / `pedido_itens` | Pedido e seus itens (status por item, preço congelado) |
| `pagamentos` | Uma linha por produtor, com status `PENDENTE`/`PAGO`/`CANCELADO` |
| `avaliacoes` | Avaliação de produto por pedido recebido |
| `tokens_redefinicao_senha` | Tokens de redefinição de senha |

Mais a view `produtos_com_avaliacao` e a tabela de controle `migrations`.

Decisões que afetam o código:

- **`pedido_itens.status` é por item** e `pedidos.status` é derivado por trigger. Um agricultor altera só os itens dele (`WHERE agricultor_id = ...`).
- **`pedido_itens.agricultor_id` é denormalizado** de propósito, para a checagem de posse não depender de JOIN.
- **Preços congelados** em `pedido_itens.preco_unitario`; `carrinho_itens` **não guarda preço**.
- **`pedido.endereco_entrega` é JSONB** (snapshot), não FK — o cliente pode apagar um endereço e o pedido precisa continuar mostrando para onde foi.
- Constraints no banco são a última linha de defesa (preço > 0, subtotal coerente), mesmo que o service valide antes.
- `pagamentos` **não tem nenhuma coluna de cartão**, por decisão de segurança.

---

## API

Envelope único em todas as respostas:

```json
{ "sucesso": true, "dados": { }, "paginacao": { "pagina": 1, "limite": 20, "total": 137, "paginas": 7 } }
{ "sucesso": false, "erro": { "codigo": "ESTOQUE_INSUFICIENTE", "mensagem": "Estoque insuficiente para Tomate." } }
```

Legenda: 🔓 público · 🔐 autenticado · 👤 cliente · 🧑‍🌾 agricultor · 🛡️ administrador

**Infraestrutura**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/health` | 🔓 | Saúde da API e do banco |
| GET | `/api/v1/docs` | 🔓 | Documentação interativa (Swagger UI) |
| GET | `/api/v1/docs/openapi.json` | 🔓 | Especificação OpenAPI em JSON |

**Autenticação**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/api/v1/auth/register` | 🔓 | Cadastro (cliente ou agricultor) |
| POST | `/api/v1/auth/login` | 🔓 | Login (retorna JWT) |
| POST | `/api/v1/auth/solicitar-redefinicao` | 🔓 | Envia e-mail de redefinição de senha |
| POST | `/api/v1/auth/redefinir-senha` | 🔓 | Redefine a senha com o token |

**Usuários**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/v1/usuarios/profile` | 🔐 | Perfil do usuário logado |
| PUT | `/api/v1/usuarios/profile` | 🔐 | Editar o próprio perfil |
| PUT | `/api/v1/usuarios/senha` | 🔐 | Trocar a própria senha |
| PUT | `/api/v1/usuarios/avatar` | 🔐 | Enviar/trocar a própria foto de perfil (multipart) |
| GET | `/api/v1/usuarios/avatar` | 🔐 | Bytes da própria foto (o dono é o do token; não aceita id) |
| DELETE | `/api/v1/usuarios/avatar` | 🔐 | Remover a própria foto (volta às iniciais) |
| PUT | `/api/v1/usuarios/logo` | 🧑‍🌾 | Enviar/trocar a logo da propriedade (multipart) |
| DELETE | `/api/v1/usuarios/logo` | 🧑‍🌾 | Remover a logo da propriedade |

**Agricultores (público)**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/v1/agricultores` | 🔓 | Lista pública de produtores |
| GET | `/api/v1/agricultores/:id` | 🔓 | Perfil público do produtor |
| GET | `/api/v1/agricultores/:id/produtos` | 🔓 | Vitrine paginada do produtor |
| GET | `/api/v1/agricultores/:id/avaliacoes` | 🔓 | Avaliações recebidas (perfil público) |
| GET | `/api/v1/agricultores/:id/logo` | 🔓 | Bytes da logo da propriedade |

**Categorias**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/v1/categorias` | 🔓 | Lista categorias ativas |
| GET | `/api/v1/categorias/:id` | 🔓 | Detalhe por id ou slug |

**Administração de categorias**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/v1/admin/categorias` | 🛡️ | Lista incluindo desativadas |
| POST | `/api/v1/admin/categorias` | 🛡️ | Criar categoria |
| GET/PUT/DELETE | `/api/v1/admin/categorias/:id` | 🛡️ | Ver, editar, desativar |
| PATCH | `/api/v1/admin/categorias/:id/ativar` | 🛡️ | Reativar categoria |

**Produtos**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/v1/produtos` | 🔓 | Catálogo: busca, filtros, ordenação, paginação |
| GET | `/api/v1/produtos/:id` | 🔓 | Detalhe público do produto |
| GET | `/api/v1/produtos/meus` | 🧑‍🌾 | Produtos do próprio agricultor (inclui inativos) |
| POST | `/api/v1/produtos` | 🧑‍🌾 | Criar produto (dono vem do token) |
| PUT/PATCH | `/api/v1/produtos/:id` | 🧑‍🌾 | Editar o próprio produto |
| PATCH | `/api/v1/produtos/:id/disponibilidade` | 🧑‍🌾 | Tirar do ar / recolocar |
| PATCH | `/api/v1/produtos/:id/estoque` | 🧑‍🌾 | Repor estoque (soma) |
| DELETE | `/api/v1/produtos/:id` | 🧑‍🌾 | Desativar (exclusão lógica) |

**Carrinho**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/v1/carrinho` | 👤 | Carrinho do consumidor (cria na 1ª chamada) |
| POST | `/api/v1/carrinho/itens` | 👤 | Adicionar produto (soma quantidade) |
| PATCH | `/api/v1/carrinho/itens/:produtoId` | 👤 | Definir quantidade exata |
| DELETE | `/api/v1/carrinho/itens/:produtoId` | 👤 | Remover item |
| DELETE | `/api/v1/carrinho` | 👤 | Esvaziar carrinho |
| GET | `/api/v1/carrinho/validacao` | 👤 | Revalidar preços e estoque |

**Endereços**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET/POST | `/api/v1/enderecos` | 👤 | Endereços de entrega (dado pessoal) |
| GET/PUT/DELETE | `/api/v1/enderecos/:id` | 👤 | Detalhe, edição e remoção |
| PATCH | `/api/v1/enderecos/:id/principal` | 👤 | Definir endereço principal |

**Checkout**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/api/v1/checkout/preview` | 👤 | Resumo calculado sem gravar |
| POST | `/api/v1/checkout` | 👤 | Finalizar compra (transação) |

**Pedidos**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/v1/pedidos` | 👤 | Pedidos do consumidor, com itens |
| GET | `/api/v1/pedidos/agricultor` | 🧑‍🌾 | Itens do produtor (só os dele) |
| GET | `/api/v1/pedidos/:id` | 🔐 | Detalhe — visão por tipo de usuário |
| PATCH | `/api/v1/pedidos/:id/cancelar` | 👤 | Cancelar pedido (devolve estoque) |
| PATCH | `/api/v1/pedidos/:id/itens/:itemId/status` | 🧑‍🌾 | Avançar status do próprio item |
| DELETE | `/api/v1/pedidos/:id/itens/:itemId` | 🧑‍🌾 | Cancelar o próprio item |
| GET | `/api/v1/admin/pedidos` | 🛡️ | Todos os pedidos |
| PATCH | `/api/v1/admin/pedidos/:id/status` | 🛡️ | Avançar pedido inteiro |
| PATCH | `/api/v1/pedidos/:id/pagamento/confirmar` | 🧑‍🌾 | Confirmar recebimento do pagamento (na retirada) |

**Avaliações**

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/v1/avaliacoes/produto/:produtoId` | 🔓 | Avaliações do produto (média e total) |
| GET | `/api/v1/avaliacoes/agricultor/:agricultorId` | 🔓 | Avaliações do produtor (com distribuição de notas) |
| POST | `/api/v1/avaliacoes` | 👤 | Avaliar produto recebido |
| PUT/DELETE | `/api/v1/avaliacoes/:id` | 👤 | Editar / apagar a própria avaliação |
| GET | `/api/v1/avaliacoes/minhas` | 👤 | Avaliações que o consumidor escreveu |
| GET | `/api/v1/avaliacoes/pendentes/:pedidoId` | 👤 | Itens entregues e ainda não avaliados |

Filtros de `/produtos`: `busca`, `categoria_id`, `agricultor_id`, `cidade`, `estado`, `preco_min`, `preco_max`, `disponivel`, `ordenar`, `pagina`, `limite`.

Documentação interativa: **http://localhost:3001/api/v1/docs** (em produção vem desativada). O Swagger UI executa as requisições direto do navegador. A especificação em JSON fica em `/api/v1/docs/openapi.json` — é ela que serve de base para gerar clientes ou importar no Postman/Insomnia.

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
- Nenhum dado de cartão é armazenado nem trafega pelo sistema: a cobrança é presencial, na maquininha do produtor
- Guarda de produção: a API **recusa subir** se `JWT_SECRET` for um valor de exemplo, se `CORS_ORIGINS` tiver `*` ou usar `http://`

### Testes de segurança

`backend/tests/integration/seguranca.test.js` cobre o checklist de segurança como testes negativos — o que importa é o que o sistema **recusa**:

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
| `npm run seed:catalogo` | backend | Catálogo demonstrativo (não usar em produção) |
| `npm run dev` | backend | API com reload automático |
| `npm test` | backend | Todos os testes (recria o schema) |
| `npm run test:unit` | backend | Só os testes de unidade |
| `npm run test:coverage` | backend | Testes com relatório de cobertura |
| `npm run dev` | frontend | Interface em desenvolvimento |
| `npm run build` | frontend | Build de produção |
| `npm test` | frontend | Testes do frontend (exige API no ar) |
| `npm run lint` | frontend | ESLint |

---

## Deploy

O passo a passo completo está em **[docs/DEPLOY.md](docs/DEPLOY.md)**. O repositório traz o blueprint [`render.yaml`](render.yaml), que cria a API e o site estático no Render.

### Combinação em uso

| Camada | Serviço | Plano gratuito | Limitação principal |
|---|---|---|---|
| Interface | **Vercel** | sim | — |
| Backend | Render (Web Service) | sim | hiberna após 15 min; cold start de 30–60 s |
| PostgreSQL | Neon | sim, permanente | 0,5 GB e 100 h de processamento/mês |
| Imagens (produto) | Cloudinary (futuro) | sim | 3 GB de storage, 10 GB de tráfego |

> **A interface de produção é o Vercel**, em `https://agrohero-six.vercel.app`. O `render.yaml` também declara o Static Site do Render (`agrohero-web.onrender.com`), que existe e responde, mas está fora do CORS da API — quem a API reconhece como "o frontend" é a origem do Vercel. Ao mexer em URLs, use a do Vercel; apontar para a do Render dá `403 CORS_BLOQUEADO`. É por isso que existe o `frontend/vercel.json` com o rewrite SPA: sem ele, toda rota profunda responde 404 ao ser aberta direto — o React Router resolve no cliente, mas só depois de o servidor entregar o `index.html`.

> **Sobre a linha de imagens:** o upload de arquivo existe para a **logo da propriedade** e a **foto de perfil (avatar)**, processadas pelo `sharp` (redimensionadas e convertidas para WebP) e guardadas no próprio PostgreSQL como `BYTEA`. O produto, porém, ainda guarda apenas `imagem_url`, informada no cadastro. As variáveis `STORAGE_DRIVER` e `CLOUDINARY_*` já existem no `.env.example` e são validadas pelo `env.js`, mas nenhum código as consome ainda — a linha acima é o destino planejado para as imagens de produto, não algo que o deploy atual use.

### O que foi descartado, e por quê

- **PostgreSQL do Render** — o banco gratuito **expira em 30 dias** e é apagado com todos os dados (14 dias de carência para migrar para um plano pago). Não serve para um projeto que precisa continuar de pé.
- **Railway** — não tem mais plano gratuito; são US$ 5 de crédito que expiram em cerca de 30 dias.
- **Fly.io** — sem plano gratuito para contas novas, e o PostgreSQL gerenciado começa em cerca de US$ 38/mês.
- **Supabase** — o banco gratuito pausa após 7 dias sem uso e exige reativação manual, o que derrubaria a API sem aviso.

### Duas limitações do plano gratuito que mudaram o deploy

O plano gratuito do Render não executa `preDeployCommand` nem oferece Shell/SSH — os dois são exclusivos de planos pagos. O blueprint contorna as duas:

- **Migrations** rodam no `startCommand` (`npm run migrate && npm start`). O `&&` garante o mesmo efeito do pré-deploy: se a migration falhar, o servidor não sobe e a versão anterior continua no ar.
- **Seed** precisa ser encadeado no comando de start por uma vez (`... && npm run seed && npm start`), porque não há terminal para digitar o comando. A senha do administrador aparece nos logs e deve ser anotada e o comando revertido em seguida.

### Variáveis de ambiente em produção

O backend **recusa subir** em produção com configuração insegura (regra em `src/config/verificacaoProducao.js`):

- `JWT_SECRET` não pode conter valores de exemplo;
- `CORS_ORIGINS` não pode conter `*`;
- `CORS_ORIGINS` não pode usar `http://`.

A `DATABASE_URL` do Neon deve incluir `?sslmode=require` — o driver `pg` lê esse parâmetro e liga o TLS, sem nenhuma mudança de código.

### Conferir o que está publicado

O painel do provedor mostra o deploy **disparado**, não necessariamente o que está no ar: um deploy que falha não derruba o anterior. A conferência confiável é o artefato — o Vite nomeia os arquivos por hash de conteúdo, então reconstruir o commit candidato e comparar os nomes de `dist/assets` com os que o site serve prova qual commit está publicado. O procedimento e o ponto de rollback (`v1.0.0-producao`) estão na seção 9 de `docs/DEPLOY.md`.

---

## Licença

Projeto acadêmico.
