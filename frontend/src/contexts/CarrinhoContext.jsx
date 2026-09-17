import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as comprasServico from '../services/compras.js';
import { ErroApi } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

/*
 * Contexto do carrinho.
 *
 * O carrinho de verdade vive no banco, atrelado ao consumidor logado.
 * Aqui mantemos apenas uma copia para a interface reagir na hora
 * (contador no cabecalho, lista na tela) sem refazer a busca a cada
 * clique. Toda mutacao chama a API e substitui o estado pelo que o
 * servidor devolveu - a resposta da API e a fonte da verdade, nunca o
 * que a tela achava que ia acontecer.
 *
 * Visitante nao tem carrinho: a API exige login, entao `quantidade`
 * fica zerada e o botao "Adicionar" leva para o login.
 */

const CarrinhoContext = createContext(null);

const CARRINHO_VAZIO = {
  itens: [],
  total_itens: 0,
  total_unidades: 0,
  total_agricultores: 0,
  valor_produtos: 0,
};

export function CarrinhoProvider({ children }) {
  const { autenticado, ehCliente } = useAuth();
  const [carrinho, setCarrinho] = useState(CARRINHO_VAZIO);
  const [carregando, setCarregando] = useState(false);

  const podeUsarCarrinho = autenticado && ehCliente;

  const recarregar = useCallback(async () => {
    if (!podeUsarCarrinho) {
      setCarrinho(CARRINHO_VAZIO);
      return CARRINHO_VAZIO;
    }
    setCarregando(true);
    try {
      const dados = await comprasServico.buscarCarrinho();
      setCarrinho(dados);
      return dados;
    } finally {
      setCarregando(false);
    }
  }, [podeUsarCarrinho]);

  /* Ao entrar, busca o carrinho; ao sair, limpa a copia local. */
  useEffect(() => {
    if (!podeUsarCarrinho) {
      setCarrinho(CARRINHO_VAZIO);
      return undefined;
    }

    let cancelado = false;
    setCarregando(true);
    comprasServico
      .buscarCarrinho()
      .then((dados) => {
        if (!cancelado) setCarrinho(dados);
      })
      .catch(() => {
        // Carrinho indisponivel nao deve quebrar a navegacao.
        if (!cancelado) setCarrinho(CARRINHO_VAZIO);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [podeUsarCarrinho]);

  const adicionar = useCallback(async (produtoId, quantidade = 1) => {
    const dados = await comprasServico.adicionarAoCarrinho(produtoId, quantidade);
    setCarrinho(dados);
    return dados;
  }, []);

  const definirQuantidade = useCallback(async (produtoId, quantidade) => {
    const dados = await comprasServico.definirQuantidade(produtoId, quantidade);
    setCarrinho(dados);
    return dados;
  }, []);

  const remover = useCallback(async (produtoId) => {
    const dados = await comprasServico.removerDoCarrinho(produtoId);
    setCarrinho(dados);
    return dados;
  }, []);

  const esvaziar = useCallback(async () => {
    const dados = await comprasServico.esvaziarCarrinho();
    setCarrinho(dados);
    return dados;
  }, []);

  const valor = useMemo(
    () => ({
      carrinho,
      carregando,
      quantidade: carrinho.total_unidades || 0,
      totalItens: carrinho.total_itens || 0,
      recarregar,
      adicionar,
      definirQuantidade,
      remover,
      esvaziar,
    }),
    [carrinho, carregando, recarregar, adicionar, definirQuantidade, remover, esvaziar],
  );

  return <CarrinhoContext.Provider value={valor}>{children}</CarrinhoContext.Provider>;
}

export function useCarrinho() {
  const contexto = useContext(CarrinhoContext);
  if (!contexto) {
    throw new Error('useCarrinho precisa ser usado dentro de <CarrinhoProvider>.');
  }
  return contexto;
}

export { ErroApi };
