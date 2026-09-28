import { useState } from 'react';
import { urlLogo, LOGO_PADRAO } from '../utils/logo.js';

/*
 * Imagem da logo da propriedade, com a padrao como fallback.
 *
 * POR QUE UM COMPONENTE, E NAO UM <img> EM CADA LUGAR
 *
 * A API responde 404 no endpoint da logo quando o produtor nunca enviou
 * uma (ver GET /agricultores/:id/logo). O `logo_url` da resposta publica
 * ja vem null nesse caso, entao a maioria das telas nem chega a pedir a
 * imagem - mas o 404 pode acontecer mesmo assim, entre a leitura do
 * perfil e o carregamento da imagem, se o produtor remover a logo nesse
 * intervalo. Sem tratar o `onError`, o usuario veria o icone de imagem
 * quebrada do navegador.
 *
 * Concentrar isso aqui evita repetir o mesmo `useState` + `onError` em
 * cada card, perfil e lista.
 */
export default function LogoPropriedade({ logoUrl, nome, className, ...resto }) {
  /*
   * Guardamos a URL que FALHOU, e nao um booleano.
   *
   * Se o pai trocar `logoUrl` (o produtor acabou de enviar uma logo nova),
   * um booleano `quebrou` continuaria true e a imagem nova nunca
   * apareceria. Comparando com a URL atual, a troca reseta o estado
   * sozinha - sem useEffect e sem render extra.
   */
  const [urlQuebrada, setUrlQuebrada] = useState(null);

  const desejada = urlLogo(logoUrl);
  const usarPadrao = !logoUrl || urlQuebrada === desejada;
  const src = usarPadrao ? LOGO_PADRAO : desejada;

  /*
   * O `alt` diz o que a imagem REALMENTE e. Anunciar "Logo de Fazenda X"
   * quando o produtor nunca enviou uma descreveria mal a tela para quem
   * usa leitor de tela - e o padrao e apenas um icone generico.
   */
  const descricao = usarPadrao
    ? 'Imagem padrao de propriedade'
    : `Logo de ${nome || 'propriedade'}`;

  return (
    <img
      className={className}
      src={src}
      alt={descricao}
      loading="lazy"
      onError={() => setUrlQuebrada(desejada)}
      {...resto}
    />
  );
}
