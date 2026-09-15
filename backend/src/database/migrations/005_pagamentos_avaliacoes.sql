-- ==========================================================
-- 005 - Pagamentos e avaliacoes
-- ==========================================================

-- ----------------------------------------------------------
-- pagamentos
-- ----------------------------------------------------------
CREATE TABLE pagamentos (
  id                    BIGSERIAL PRIMARY KEY,
  pedido_id             BIGINT        NOT NULL
                                      REFERENCES pedidos (id) ON DELETE CASCADE,
  metodo                VARCHAR(20)   NOT NULL,
  status                VARCHAR(20)   NOT NULL DEFAULT 'PENDENTE',
  valor                 NUMERIC(10,2) NOT NULL,

  -- ID da transacao no gateway (ex.: id do pagamento no Mercado Pago).
  -- Unico para que uma notificacao reenviada nao crie pagamento duplicado.
  identificador_externo VARCHAR(200)  UNIQUE,

  -- Guardamos apenas um resumo da resposta do gateway (status, id,
  -- metodo). NUNCA o payload completo: ele pode conter dado sensivel.
  resumo_gateway        JSONB,

  criado_em             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pagamentos_metodo_valido
    CHECK (metodo IN ('PIX', 'CARTAO', 'BOLETO', 'SIMULADO')),

  CONSTRAINT pagamentos_status_valido
    CHECK (status IN ('PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO', 'REEMBOLSADO')),

  CONSTRAINT pagamentos_valor_positivo CHECK (valor > 0)
);

-- NOTA DE SEGURANCA: esta tabela NAO tem coluna para numero de cartao,
-- CVV ou qualquer dado do cartao. Essa informacao nunca chega ao nosso
-- servidor: o cliente informa direto no formulario do gateway. Se um dia
-- alguem pedir para "guardar o cartao para a proxima compra", a resposta
-- e usar o token do gateway, nunca o numero.

CREATE INDEX pagamentos_pedido_idx ON pagamentos (pedido_id);
CREATE INDEX pagamentos_status_idx ON pagamentos (status);

CREATE TRIGGER pagamentos_atualizado_em
  BEFORE UPDATE ON pagamentos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();


-- ----------------------------------------------------------
-- avaliacoes
-- ----------------------------------------------------------
CREATE TABLE avaliacoes (
  id             BIGSERIAL PRIMARY KEY,
  pedido_id      BIGINT      NOT NULL
                             REFERENCES pedidos (id) ON DELETE CASCADE,
  produto_id     BIGINT      NOT NULL
                             REFERENCES produtos (id) ON DELETE RESTRICT,

  -- Redundante com pedidos.consumidor_id, mas copiado para permitir a
  -- consulta direta "minhas avaliacoes" e a regra de propriedade sem JOIN.
  consumidor_id  BIGINT      NOT NULL
                             REFERENCES usuarios (id) ON DELETE CASCADE,

  -- Tambem copiado do pedido_item: permite calcular a media do produtor
  -- sem passar por produtos, que pode estar inativo.
  agricultor_id  BIGINT      NOT NULL
                             REFERENCES agricultores (id) ON DELETE RESTRICT,

  nota           SMALLINT    NOT NULL,
  comentario     TEXT,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT avaliacoes_nota_valida CHECK (nota BETWEEN 1 AND 5),

  CONSTRAINT avaliacoes_comentario_tamanho
    CHECK (comentario IS NULL OR length(comentario) <= 2000),

  -- Uma avaliacao por produto por pedido. Sem isso, o cliente poderia
  -- inflar a media do produtor avaliando o mesmo item varias vezes.
  CONSTRAINT avaliacoes_uma_por_produto_por_pedido
    UNIQUE (pedido_id, produto_id, consumidor_id)
);

CREATE INDEX avaliacoes_produto_idx    ON avaliacoes (produto_id);
CREATE INDEX avaliacoes_agricultor_idx ON avaliacoes (agricultor_id);
CREATE INDEX avaliacoes_consumidor_idx ON avaliacoes (consumidor_id);

CREATE TRIGGER avaliacoes_atualizado_em
  BEFORE UPDATE ON avaliacoes
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();


-- ----------------------------------------------------------
-- View de media de avaliacoes por produto
-- ----------------------------------------------------------
-- Resolve o requisito "ordenar por avaliacao" (FASE 9) sem calcular AVG
-- a cada requisicao. O LEFT JOIN garante que produto sem avaliacao
-- apareca com media 0 e nao suma da listagem.
CREATE OR REPLACE VIEW produtos_com_avaliacao AS
SELECT
  p.id,
  p.nome,
  p.preco,
  p.estoque,
  p.ativo,
  p.categoria_id,
  p.agricultor_id,
  round(coalesce(avg(a.nota), 0), 2) AS media_avaliacoes,
  count(a.id)                        AS total_avaliacoes
FROM produtos p
LEFT JOIN avaliacoes a ON a.produto_id = p.id
GROUP BY p.id;

COMMENT ON VIEW produtos_com_avaliacao IS
  'Produtos com media e total de avaliacoes. Usada na ordenacao por relevancia.';