import { useState } from 'react';
import { iniciais } from '../utils/formato.js';
import { corDoNome } from '../utils/avatar.js';
import './avatar.css';

/*
 * Foto de perfil com as iniciais como fallback.
 *
 * O COMPONENTE NAO BUSCA A IMAGEM
 *
 * Ele so exibe a URL que recebe. Quem busca e o `useAvatar`, usado uma vez
 * no cabecalho: a busca exige o cabecalho `Authorization` (a rota nao e
 * publica), entao nao da para apontar um `<img src>` direto para a API -
 * ver a explicacao em `services/avatar.js`. Concentrar a busca em um
 * lugar evita que cada tela monte a sua propria requisicao.
 *
 * POR QUE AS INICIAIS SAO O PADRAO, E NAO UMA IMAGEM GENERICA
 *
 * A maioria das contas nunca vai enviar foto. Uma silhueta cinza em todas
 * elas deixaria a lista de avaliacoes e o cabecalho visualmente iguais, e
 * nao diria nada sobre quem e quem. As iniciais com a cor derivada do
 * nome identificam a pessoa de relance - sem exigir que ela escolha nada
 * e sem enviar arquivo nenhum.
 *
 * ACESSIBILIDADE
 *
 * Com foto, o `alt` descreve a pessoa ("Foto de Ana Souza"). Sem foto, o
 * bloco e `aria-hidden` e o nome aparece como texto ao lado: anunciar as
 * iniciais ("AS") duas vezes so poluiria a leitura de tela.
 */
export default function Avatar({ nome, url, tamanho = 'md', className = '', ...resto }) {
  /*
   * Rastreia a URL que FALHOU, e nao um booleano.
   *
   * Se o pai trocar a foto (o usuario acabou de enviar uma nova), um
   * booleano `quebrou` continuaria true e a foto nova nunca apareceria.
   * Comparando com a URL atual, a troca reseta o estado sozinha - sem
   * `useEffect` e sem render extra. Mesmo padrao do LogoPropriedade.
   */
  const [urlQuebrada, setUrlQuebrada] = useState(null);

  const usarFoto = Boolean(url) && urlQuebrada !== url;
  const classes = ['avatar', `avatar--${tamanho}`, className].filter(Boolean).join(' ');

  if (usarFoto) {
    return (
      <img
        className={classes}
        src={url}
        alt={`Foto de ${nome || 'usuario'}`}
        onError={() => setUrlQuebrada(url)}
        {...resto}
      />
    );
  }

  return (
    <span
      className={`${classes} avatar--iniciais`}
      style={{ backgroundColor: corDoNome(nome) }}
      aria-hidden="true"
      {...resto}
    >
      {iniciais(nome)}
    </span>
  );
}
