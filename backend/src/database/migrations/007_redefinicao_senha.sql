-- ==========================================================
-- 007 - Tokens de redefinicao de senha
-- ==========================================================

CREATE TABLE tokens_redefinicao_senha (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  BIGINT NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  token_hash  CHAR(64) NOT NULL,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tokens_redefinicao_hash_unico UNIQUE (token_hash)
);

CREATE INDEX tokens_redefinicao_usuario_idx
  ON tokens_redefinicao_senha (usuario_id);

CREATE INDEX tokens_redefinicao_validos_idx
  ON tokens_redefinicao_senha (token_hash, expira_em)
  WHERE usado_em IS NULL;
