import { useEffect, useState } from 'react';
import { buscarAvatarBlob } from '../services/avatar.js';

/*
 * Carrega a foto de perfil do usuario logado e devolve um object URL.
 *
 * POR QUE UM HOOK, E NAO A BUSCA DENTRO DE CADA COMPONENTE
 *
 * O avatar aparece em mais de um lugar (cabecalho, pagina de perfil). Se
 * cada tela buscasse a imagem por conta propria, trocar a foto no perfil
 * nao refletiria no cabecalho sem recarregar a pagina, e cada montagem
 * faria uma requisicao nova. Aqui a busca e o ciclo de vida do object URL
 * ficam em um lugar so.
 *
 * O `versao` existe para o Perfil avisar "a foto mudou": incrementar o
 * valor refaz a busca sem remontar o componente. E o jeito mais simples
 * de propagar a troca para quem ja estava exibindo a imagem antiga.
 *
 * REVOGACAO DO OBJECT URL
 *
 * `URL.createObjectURL` cria uma referencia que so morre com
 * `revokeObjectURL` ou com o fechamento da aba. Sem revogar na limpeza do
 * efeito, cada troca de foto deixaria a anterior ocupando memoria ate o
 * reload - e numa sessao longa isso se acumula. Por isso a funcao de
 * limpeza revoga exatamente a URL que este efeito criou, e nao a do
 * estado atual (que pode ser de outra renderizacao).
 */
export function useAvatar({ ativo = true, versao = 0 } = {}) {
  const [url, setUrl] = useState(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!ativo) {
      setUrl(null);
      return undefined;
    }

    let cancelado = false;
    let criada = null;

    setCarregando(true);

    buscarAvatarBlob()
      .then((blob) => {
        /*
         * Duas checagens antes de usar o resultado:
         *
         *   - `cancelado`: o componente desmontou (ou o `versao` mudou)
         *     enquanto a requisicao estava em voo. Aplicar o estado aqui
         *     seria atualizar um componente que ja saiu da tela.
         *   - `createObjectURL` pode nao existir no ambiente (jsdom nos
         *     testes). A ausencia nao pode derrubar a tela: sem suporte,
         *     simplesmente exibimos as iniciais.
         */
        if (cancelado) return;

        if (blob && typeof URL.createObjectURL === 'function') {
          criada = URL.createObjectURL(blob);
          setUrl(criada);
        } else {
          setUrl(null);
        }
      })
      .catch(() => {
        // Falha de rede ou 500: a foto nao aparece, mas a tela continua
        // utilizavel com as iniciais. Nao vale interromper a navegacao
        // por causa de uma imagem decorativa.
        if (!cancelado) setUrl(null);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
      if (criada) URL.revokeObjectURL?.(criada);
    };
  }, [ativo, versao]);

  return { url, carregando };
}

export default useAvatar;
