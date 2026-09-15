-- ==========================================================
-- 004 - Carrinho, pedidos e a regra multi-agricultor
-- ==========================================================
-- Esta e a parte mais delicada do banco. Leia os comentarios antes de
-- alterar: as decisoes aqui sao o que impede um agricultor de mexer
-- no pedido de outro.

-- ----------------------------------------------------------
-- carrinhos
-- ----------------------------------------------------------
-- Um carrinho por consumidor, persistido no banco (e nao apenas no
-- localStorage) para que o cliente nao perca o carrinho ao trocar de
-- dispositivo.
CREATE TABLE carrinhos (
  id            BIGSERIAL PRIMARY KEY,
  consumidor_id BIGINT      NOT NULL UNIQUE
                            REFERENCES usuarios (id) ON DELETE CASCADE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER carrinhos_atualizado_em
  BEFORE UPDATE ON carrinhos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();


-- ----------------------------------------------------------
-- carrinho_itens
-- ----------------------------------------------------------
CREATE TABLE carrinho_itens (
  id           BIGSERIAL PRIMARY KEY,
  carrinho_id  BIGINT      NOT NULL
                           REFERENCES carrinhos (id) ON DELETE CASCADE,
  produto_id   BIGINT      NOT NULL
                           REFERENCES produtos (id) ON DELETE CASCADE,
  quantidade   INTEGER     NOT NULL,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT carrinho_itens_quantidade_positiva CHECK (quantidade > 0),

  -- Impede o mesmo produto duas vezes no mesmo carrinho. Adicionar de
  -- novo passa a ser um UPDATE de quantidade, e nao uma linha duplicada
  -- que confundiria o calculo do total.
  CONSTRAINT carrinho_itens_produto_unico UNIQUE (carrinho_id, produto_id)
);

-- ON DELETE CASCADE: apagar um produto limpa ele dos carrinhos. Isso e
-- seguro porque o carrinho e intencao de compra, nao historico.
-- (Em pedido_itens o comportamento e RESTRICT, porque ali e historico.)

CREATE INDEX carrinho_itens_carrinho_idx ON carrinho_itens (carrinho_id);
CREATE INDEX carrinho_itens_produto_idx  ON carrinho_itens (produto_id);

CREATE TRIGGER carrinho_itens_atualizado_em
  BEFORE UPDATE ON carrinho_itens
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- NOTA DE SEGURANCA: carrinho_itens nao guarda preco. O preco oficial e
-- sempre lido de produtos no momento do checkout. Se guardassemos preco
-- aqui, ele viraria um campo manipulavel pelo cliente.


-- ----------------------------------------------------------
-- pedidos
-- ----------------------------------------------------------
CREATE TABLE pedidos (
  id                BIGSERIAL PRIMARY KEY,
  consumidor_id     BIGINT        NOT NULL
                                  REFERENCES usuarios (id) ON DELETE RESTRICT,
  status            VARCHAR(15)   NOT NULL DEFAULT 'PENDENTE',
  valor_produtos    NUMERIC(10,2) NOT NULL,
  valor_frete       NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_total       NUMERIC(10,2) NOT NULL,

  -- Snapshot do endereco no momento da compra, em JSONB.
  -- Guardamos copia, e nao uma FK para enderecos, porque o cliente pode
  -- editar ou apagar um endereco depois. Um pedido de 2025 precisa
  -- continuar mostrando o endereco para onde o produto foi enviado.
  endereco_entrega  JSONB         NOT NULL,

  criado_em         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pedidos_status_valido
    CHECK (status IN ('PENDENTE', 'PROCESSANDO', 'ENVIADO', 'ENTREGUE', 'CANCELADO')),

  CONSTRAINT pedidos_valores_nao_negativos
    CHECK (valor_produtos >= 0 AND valor_frete >= 0 AND valor_total >= 0),

  -- Coerencia entre as partes: o total tem que ser a soma. Isso pega um
  -- bug de calculo no service antes de o dado entrar no banco.
  CONSTRAINT pedidos_total_coerente
    CHECK (valor_total = valor_produtos + valor_frete)
);

CREATE INDEX pedidos_consumidor_idx  ON pedidos (consumidor_id, criado_em DESC);
CREATE INDEX pedidos_status_idx      ON pedidos (status);
CREATE INDEX pedidos_criado_em_idx   ON pedidos (criado_em DESC);

CREATE TRIGGER pedidos_atualizado_em
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();


-- ----------------------------------------------------------
-- pedido_itens
-- ----------------------------------------------------------
-- A tabela central da regra multi-agricultor.
CREATE TABLE pedido_itens (
  id              BIGSERIAL PRIMARY KEY,
  pedido_id       BIGINT        NOT NULL
                                REFERENCES pedidos (id) ON DELETE CASCADE,
  produto_id      BIGINT        NOT NULL
                                REFERENCES produtos (id) ON DELETE RESTRICT,

  -- DENORMALIZADO de proposito. Era o caminho produto -> agricultor_id,
  -- mas copiamos o dono para ca por dois motivos:
  --   1) permite checar propriedade (WHERE agricultor_id = $1) sem JOIN,
  --      que e o que faz o IDOR do agricultor A no pedido do B ser
  --      impossivel de acontecer por esquecimento;
  --   2) se um produto mudar de dono (venda da propriedade), o pedido
  --      antigo continua apontando para quem realmente vendeu.
  agricultor_id   BIGINT        NOT NULL
                                REFERENCES agricultores (id) ON DELETE RESTRICT,

  -- Snapshot do preco no momento da compra. Se o produtor reajustar o
  -- preco amanha, o pedido de hoje continua com o valor combinado.
  preco_unitario  NUMERIC(10,2) NOT NULL,

  quantidade      INTEGER       NOT NULL,
  subtotal        NUMERIC(10,2) NOT NULL,

  -- Status POR ITEM: e isso que permite o agricultor A avancar os itens
  -- dele sem tocar nos itens do agricultor B.
  status          VARCHAR(15)   NOT NULL DEFAULT 'PENDENTE',

  criado_em       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT pedido_itens_status_valido
    CHECK (status IN ('PENDENTE', 'PROCESSANDO', 'ENVIADO', 'ENTREGUE', 'CANCELADO')),

  CONSTRAINT pedido_itens_quantidade_positiva CHECK (quantidade > 0),
  CONSTRAINT pedido_itens_preco_positivo      CHECK (preco_unitario > 0),

  -- Subtotal obrigatoriamente igual a quantidade x preco. Um subtotal
  -- manipulavel no frontend nao passa daqui.
  CONSTRAINT pedido_itens_subtotal_coerente
    CHECK (subtotal = quantidade * preco_unitario),

  -- Um produto aparece uma unica vez por pedido.
  CONSTRAINT pedido_itens_produto_unico UNIQUE (pedido_id, produto_id)
);

-- ON DELETE RESTRICT em produto_id: um produto que ja foi vendido nao
-- pode ser apagado do banco, senao o historico do pedido se perde.
-- Por isso a exclusao de produto e logica (ativo = false).

-- Indice que sustenta a consulta mais importante do painel do agricultor:
-- "quais itens de pedido sao meus?".
CREATE INDEX pedido_itens_agricultor_idx ON pedido_itens (agricultor_id, status);

CREATE INDEX pedido_itens_pedido_idx     ON pedido_itens (pedido_id);
CREATE INDEX pedido_itens_produto_idx    ON pedido_itens (produto_id);

CREATE TRIGGER pedido_itens_atualizado_em
  BEFORE UPDATE ON pedido_itens
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();


-- ----------------------------------------------------------
-- Sincronizacao do status do pedido
-- ----------------------------------------------------------
-- O status do pedido e DERIVADO dos seus itens. Um pedido com produtos
-- de varios produtores nao tem um dono unico, entao quem manda e o
-- conjunto dos itens.
--
-- Regras, em ordem de precedencia:
--   1) todos os itens cancelados            -> CANCELADO
--   2) todos os itens entregues             -> ENTREGUE
--   3) todos os itens enviados ou entregues -> ENVIADO
--   4) algum item em andamento              -> PROCESSANDO
--   5) caso contrario                       -> PENDENTE
--
-- A funcao roda em trigger AFTER UPDATE nos itens, garantindo que
-- pedidos.status nunca fique divergente, independente de qual rota
-- fez a alteracao.
CREATE OR REPLACE FUNCTION sincronizar_status_pedido()
RETURNS TRIGGER AS $$
DECLARE
  total          INTEGER;
  qtd_cancelado  INTEGER;
  qtd_pendente   INTEGER;
  qtd_entregue   INTEGER;
  qtd_enviado    INTEGER;
  novo_status    VARCHAR(15);
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'CANCELADO'),
    count(*) FILTER (WHERE status = 'PENDENTE'),
    count(*) FILTER (WHERE status = 'ENTREGUE'),
    count(*) FILTER (WHERE status = 'ENVIADO')
  INTO total, qtd_cancelado, qtd_pendente, qtd_entregue, qtd_enviado
  FROM pedido_itens
  WHERE pedido_id = NEW.pedido_id;

  IF total > 0 AND qtd_cancelado = total THEN
    novo_status := 'CANCELADO';
  ELSIF total > 0 AND qtd_entregue = total THEN
    novo_status := 'ENTREGUE';
  ELSIF total > 0 AND (qtd_entregue + qtd_enviado) = total THEN
    novo_status := 'ENVIADO';
  ELSIF qtd_pendente = total THEN
    novo_status := 'PENDENTE';
  ELSE
    novo_status := 'PROCESSANDO';
  END IF;

  -- Atualiza apenas se mudou, para nao gerar escritas e triggers inuteis.
  UPDATE pedidos
     SET status = novo_status
   WHERE id = NEW.pedido_id
     AND status IS DISTINCT FROM novo_status;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pedido_itens_sincroniza_status
  AFTER UPDATE OF status ON pedido_itens
  FOR EACH ROW EXECUTE FUNCTION sincronizar_status_pedido();