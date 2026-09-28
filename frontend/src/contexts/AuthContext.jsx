import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { removerToken, obterToken, configurarPerdaDeSessao } from '../services/api.js';
import * as authServico from '../services/auth.js';
import { useAvatar } from '../hooks/useAvatar.js';

/*
 * Contexto de autenticacao.
 *
 * Guarda o usuario logado em memoria e o token no localStorage. Ao
 * carregar a aplicacao, se existe token, buscamos o perfil para saber
 * quem e - o token carrega apenas `sub` e `tipo`, nao o nome, entao
 * sem essa consulta a interface nao teria o que exibir no cabecalho.
 *
 * O estado `carregando` existe para o primeiro render nao piscar a
 * versao "deslogada" antes da consulta terminar: quem esta logado veria
 * o botao "Entrar" aparecer e sumir.
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(() => Boolean(obterToken()));

  const sair = useCallback(() => {
    removerToken();
    setUsuario(null);
  }, []);

  /*
   * O api.js avisa quando a API responde 401 (token expirado ou
   * revogado). Sem isso o usuario ficaria "logado" na tela com um token
   * que nao vale mais, e so descobriria ao tentar agir.
   */
  useEffect(() => {
    configurarPerdaDeSessao(() => {
      removerToken();
      setUsuario(null);
    });
  }, []);

  useEffect(() => {
    if (!obterToken()) {
      setCarregando(false);
      return undefined;
    }

    let cancelado = false;

    authServico
      .buscarPerfil()
      .then((perfil) => {
        if (!cancelado) setUsuario(perfil);
      })
      .catch(() => {
        // Token invalido: a perda de sessao ja foi disparada pelo
        // api.js. Aqui so garantimos que o estado local nao fique preso.
        if (!cancelado) {
          removerToken();
          setUsuario(null);
        }
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  const entrar = useCallback(async (credenciais) => {
    const dados = await authServico.entrar(credenciais);
    setUsuario(dados.usuario);
    return dados.usuario;
  }, []);

  const registrar = useCallback(async (dadosCadastro) => {
    const dados = await authServico.registrar(dadosCadastro);
    setUsuario(dados.usuario);
    return dados.usuario;
  }, []);

  /* Rebusca o perfil apos editar dados ou trocar senha. */
  const recarregarPerfil = useCallback(async () => {
    const perfil = await authServico.buscarPerfil();
    setUsuario(perfil);
    return perfil;
  }, []);

  /*
   * A foto de perfil vive AQUI, e nao dentro do cabecalho ou do perfil.
   *
   * Motivo: a rota do avatar exige o cabecalho `Authorization`, entao a
   * imagem precisa ser buscada pela aplicacao (ver services/avatar.js) -
   * e duas telas exibem essa mesma foto. Buscando uma vez no contexto, o
   * cabecalho e a pagina de perfil compartilham o mesmo object URL, e
   * trocar a foto em uma atualiza a outra sem recarregar a pagina.
   *
   * `versao` e o gatilho: o Perfil o incrementa depois de enviar ou
   * remover a foto, e o efeito refaz a busca.
   */
  const [versaoAvatar, setVersaoAvatar] = useState(0);

  const { url: avatarUrl } = useAvatar({
    ativo: Boolean(usuario),
    versao: versaoAvatar,
  });

  const recarregarAvatar = useCallback(() => {
    setVersaoAvatar((atual) => atual + 1);
  }, []);

  const valor = useMemo(
    () => ({
      usuario,
      carregando,
      autenticado: Boolean(usuario),
      ehCliente: usuario?.tipo === 'cliente',
      ehAgricultor: usuario?.tipo === 'agricultor',
      ehAdmin: usuario?.tipo === 'administrador',
      avatarUrl,
      entrar,
      registrar,
      sair,
      recarregarPerfil,
      recarregarAvatar,
    }),
    [usuario, carregando, avatarUrl, entrar, registrar, sair, recarregarPerfil, recarregarAvatar],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth precisa ser usado dentro de <AuthProvider>.');
  }
  return contexto;
}
