-- ==========================================================
-- 001 - Funcoes utilitarias compartilhadas
-- ==========================================================
-- Criada primeiro porque as outras migrations dependem dela.

-- Atualiza automaticamente a coluna atualizado_em em UPDATE.
--
-- Por que no banco e nao na aplicacao: assim a garantia vale para
-- qualquer caminho de escrita (inclusive um ajuste manual no psql).
-- Se ficasse so no service, um UPDATE esquecido deixaria a data velha.
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;