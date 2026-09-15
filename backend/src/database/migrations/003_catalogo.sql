-- ==========================================================
-- 003 - Catalogo: categorias e produtos
-- ==========================================================

-- ----------------------------------------------------------
-- categorias
-- ----------------------------------------------------------
CREATE TABLE categorias (
  id            BIGSERIAL PRIMARY KEY,
  nome          VARCHAR(80) NOT NULL,
  slug          VARCHAR(80) NOT NULL,
  descricao     TEXT,
  ativo         BOOLEAN     NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- O slug vai na URL (/categorias/frutas). Validar o formato evita
  -- que um slug com espaco ou acento quebre o link.
  CONSTRAINT categorias_slug_formato
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  CONSTRAINT categorias_nome_nao_vazio
    CHECK (length(trim(nome)) >= 2)
);

CREATE UNIQUE INDEX categorias_nome_unico ON categorias (lower(nome));
CREATE UNIQUE INDEX categorias_slug_unico ON categorias (slug);

CREATE INDEX categorias_ativo_idx ON categorias (ativo) WHERE ativo = TRUE;

CREATE TRIGGER categorias_atualizado_em
  BEFORE UPDATE ON categorias
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();


-- ----------------------------------------------------------
-- produtos
-- ----------------------------------------------------------
CREATE TABLE produtos (
  id                BIGSERIAL PRIMARY KEY,
  agricultor_id     BIGINT        NOT NULL
                                  REFERENCES agricultores (id) ON DELETE RESTRICT,
  categoria_id      BIGINT        NOT NULL
                                  REFERENCES categorias (id)  ON DELETE RESTRICT,
  nome              VARCHAR(140)  NOT NULL,
  descricao         TEXT,
  preco             NUMERIC(10,2) NOT NULL,
  estoque           INTEGER       NOT NULL DEFAULT 0,
  unidade           VARCHAR(20)   NOT NULL DEFAULT 'unidade',
  imagem_url        VARCHAR(500),
  imagem_public_id  VARCHAR(200),
  ativo             BOOLEAN       NOT NULL DEFAULT TRUE,
  criado_em         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ   NOT NULL DEFAULT now(),

  -- As tres regras que protegem o checkout: preco positivo, estoque
  -- nunca negativo e nome preenchido. Validadas na aplicacao E aqui,
  -- porque a aplicacao pode ter um bug; o banco e a ultima linha.
  CONSTRAINT produtos_preco_positivo   CHECK (preco > 0),
  CONSTRAINT produtos_estoque_nao_neg CHECK (estoque >= 0),
  CONSTRAINT produtos_nome_nao_vazio   CHECK (length(trim(nome)) >= 2),

  -- Teto de preco: evita que um erro de digitacao crie um produto de
  -- dez milhões, que quebraria a ordenacao e a exibicao.
  CONSTRAINT produtos_preco_maximo     CHECK (preco <= 999999.99)
);

-- ON DELETE RESTRICT em agricultor_id e categoria_id e intencional:
-- excluir um produtor que tem produto ativo deve falhar, nao apagar
-- o catalogo em cascata. A exclusao de produto e logica (ativo = false).

-- Indices que sustentam os filtros do marketplace (FASE 9).
CREATE INDEX produtos_agricultor_idx   ON produtos (agricultor_id);
CREATE INDEX produtos_categoria_idx    ON produtos (categoria_id);
CREATE INDEX produtos_preco_idx        ON produtos (preco);
CREATE INDEX produtos_criado_em_idx    ON produtos (criado_em DESC);

-- Indice parcial: as listagens publicas so mostram produto ativo, entao
-- o indice carrega apenas essas linhas e fica menor e mais rapido.
CREATE INDEX produtos_disponiveis_idx  ON produtos (ativo, categoria_id)
  WHERE ativo = TRUE;

-- Busca textual em portugues sobre nome e descricao.
-- Suporta termo acentuado e radical (buscar "tomate" acha "tomates").
CREATE INDEX produtos_busca_idx ON produtos
  USING GIN (to_tsvector('portuguese',
    coalesce(nome, '') || ' ' || coalesce(descricao, '')));

-- Indice para "produtos com estoque baixo", usado no painel do agricultor.
CREATE INDEX produtos_estoque_baixo_idx ON produtos (agricultor_id, estoque)
  WHERE ativo = TRUE AND estoque <= 5;

CREATE TRIGGER produtos_atualizado_em
  BEFORE UPDATE ON produtos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
