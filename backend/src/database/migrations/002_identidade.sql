-- ==========================================================
-- 002 - Identidade: usuarios, agricultores, enderecos
-- ==========================================================
-- Base de todo o sistema: sem usuario nao existe agricultor,
-- sem agricultor nao existe produto, e sem produto nao existe pedido.

-- ----------------------------------------------------------
-- usuarios
-- ----------------------------------------------------------
CREATE TABLE usuarios (
  id            BIGSERIAL PRIMARY KEY,
  nome          VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL,
  senha_hash    VARCHAR(72)  NOT NULL,   -- bcrypt gera 60 chars; 72 da folga
  telefone      VARCHAR(20),
  cidade        VARCHAR(80),
  estado        CHAR(2),
  tipo          VARCHAR(15)  NOT NULL DEFAULT 'cliente',
  ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Optamos por CHECK em vez de CREATE TYPE para os dominios de valor.
  -- Motivo: um ENUM do PostgreSQL exige ALTER TYPE para ganhar um valor
  -- novo, e isso nao roda dentro da mesma transacao em que e usado. Com
  -- CHECK, incluir um tipo ou status novo e uma migration trivial.
  CONSTRAINT usuarios_tipo_valido
    CHECK (tipo IN ('cliente', 'agricultor', 'administrador')),

  -- Reduz a superficie de erro: o app normaliza antes de gravar, e o
  -- banco recusa qualquer email que chegue com maiuscula.
  CONSTRAINT usuarios_email_minusculo
    CHECK (email = lower(email)),

  -- Unicidade case-insensitive: impede "Joao@x.com" e "joao@x.com"
  -- conviverem como contas diferentes.
  CONSTRAINT usuarios_email_nao_vazio
    CHECK (length(trim(email)) >= 5),

  CONSTRAINT usuarios_nome_nao_vazio
    CHECK (length(trim(nome)) >= 2),

  CONSTRAINT usuarios_estado_valido
    CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$')
);

-- Unicidade de email sem depender de maiuscula/minuscula, blindando
-- contra um INSERT que venha de fora da aplicacao.
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));

-- Listagens administrativas filtram por tipo e por situacao.
CREATE INDEX usuarios_tipo_idx  ON usuarios (tipo);
CREATE INDEX usuarios_ativo_idx ON usuarios (ativo) WHERE ativo = FALSE;

CREATE TRIGGER usuarios_atualizado_em
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

COMMENT ON COLUMN usuarios.senha_hash IS
  'Hash bcrypt da senha. A senha original nunca e armazenada nem logada.';


-- ----------------------------------------------------------
-- agricultores
-- ----------------------------------------------------------
-- Dados da propriedade separados do usuario: a identidade (login) fica
-- em usuarios e o perfil publico do produtor fica aqui. Isso permite
-- evoluir o perfil sem tocar na autenticacao.
CREATE TABLE agricultores (
  id                BIGSERIAL PRIMARY KEY,
  usuario_id        BIGINT       NOT NULL UNIQUE
                                 REFERENCES usuarios (id) ON DELETE CASCADE,
  nome_fazenda      VARCHAR(140) NOT NULL,
  descricao         TEXT,
  historia          TEXT,
  cidade            VARCHAR(80),
  estado            CHAR(2),
  endereco          VARCHAR(200),
  certificacoes     TEXT[]       NOT NULL DEFAULT '{}',
  imagem_url        VARCHAR(500),
  imagem_public_id  VARCHAR(200),
  ativo             BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT agricultores_fazenda_nao_vazia
    CHECK (length(trim(nome_fazenda)) >= 2),

  CONSTRAINT agricultores_estado_valido
    CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$')
);

-- Filtro do marketplace "produtores da minha regiao".
CREATE INDEX agricultores_localizacao_idx ON agricultores (cidade, estado);
CREATE INDEX agricultores_ativo_idx       ON agricultores (ativo) WHERE ativo = TRUE;

-- Busca textual pela propriedade e pela historia do produtor.
CREATE INDEX agricultores_busca_idx ON agricultores
  USING GIN (to_tsvector('portuguese',
    coalesce(nome_fazenda, '') || ' ' || coalesce(descricao, '')));

CREATE TRIGGER agricultores_atualizado_em
  BEFORE UPDATE ON agricultores
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

COMMENT ON COLUMN agricultores.imagem_url IS
  'Apenas a URL da imagem. O arquivo fica no servico de armazenamento, nunca no PostgreSQL.';


-- ----------------------------------------------------------
-- enderecos
-- ----------------------------------------------------------
CREATE TABLE enderecos (
  id                BIGSERIAL PRIMARY KEY,
  consumidor_id     BIGINT       NOT NULL
                                 REFERENCES usuarios (id) ON DELETE CASCADE,
  nome_destinatario VARCHAR(120) NOT NULL,
  cep               CHAR(8)      NOT NULL,
  rua               VARCHAR(160) NOT NULL,
  numero            VARCHAR(20)  NOT NULL,
  complemento       VARCHAR(80),
  bairro            VARCHAR(80)  NOT NULL,
  cidade            VARCHAR(80)  NOT NULL,
  estado            CHAR(2)      NOT NULL,
  principal         BOOLEAN      NOT NULL DEFAULT FALSE,
  criado_em         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- CEP so com digitos, sem hifen nem ponto (o frontend formata na exibicao).
  CONSTRAINT enderecos_cep_valido CHECK (cep ~ '^[0-9]{8}$'),

  CONSTRAINT enderecos_estado_valido CHECK (estado ~ '^[A-Z]{2}$')
);

CREATE INDEX enderecos_consumidor_idx ON enderecos (consumidor_id);

-- Garante no banco que cada consumidor tem NO MAXIMO um endereco principal.
-- Um indice parcial unico resolve isso de forma atomica, diferente de um
-- "desmarca os outros e marca este" no service, que tem condicao de corrida.
CREATE UNIQUE INDEX enderecos_um_principal_por_consumidor
  ON enderecos (consumidor_id)
  WHERE principal = TRUE;

CREATE TRIGGER enderecos_atualizado_em
  BEFORE UPDATE ON enderecos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();
