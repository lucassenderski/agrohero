/*
 * Avatar: cor derivada do nome e iniciais.
 *
 * POR QUE UMA COR POR PESSOA, E NAO SEMPRE O VERDE DA MARCA
 *
 * Sem foto, todo avatar ficaria identico, e numa lista de avaliacoes ou
 * num cabecalho movimentado isso nao distingue nada. A cor derivada do
 * nome da a cada pessoa um marcador visual estavel - o mesmo nome produz
 * sempre a mesma cor, em qualquer tela e em qualquer sessao - sem exigir
 * que ninguem escolha nada.
 *
 * NAO E IDENTIDADE, E AUXILIO VISUAL. O nome continua sendo o texto ao
 * lado; a cor nunca e o unico sinal de quem e quem (isso excluiria quem
 * nao distingue cores).
 */

/*
 * Paleta de fundo dos avatares.
 *
 * Cores escuras o bastante para o texto branco passar no contraste AA
 * (4.5:1) - o mesmo cuidado do resto da interface. Foram escolhidas
 * dentro das familias ja usadas pelo projeto (verde, terracota, azul,
 * ameixa) para nao parecerem um corpo estranho na tela.
 */
const CORES = Object.freeze([
  '#007b55', // verde-lavoura (cor-primaria-600)
  '#1a5c8a', // azul
  '#8a5a00', // terracota escuro
  '#7a2f6b', // ameixa
  '#0f6b6b', // petroleo
  '#a33a12', // terracota queimado
  '#4a5a1f', // oliva
  '#8a2f3d', // vinho
]);

/*
 * Escolhe a cor pelo nome.
 *
 * O hash e deterministico e independente da plataforma: `charCodeAt` do
 * nome normalizado. Nao usamos `Math.random` nem a posicao na lista -
 * ambos dariam cores diferentes a cada render, e a pessoa "mudaria de
 * cor" ao navegar.
 *
 * O multiplicador 31 e o classico de hash de string (o mesmo do
 * `hashCode` do Java): espalha bem nomes parecidos, o que importa aqui
 * porque "Ana" e "Ana Paula" precisam cair em cores distintas.
 */
export function corDoNome(nome) {
  if (!nome) return CORES[0];

  const limpo = nome.trim().toLowerCase();
  let hash = 0;

  for (let i = 0; i < limpo.length; i += 1) {
    // `| 0` mantem o valor em 32 bits com sinal, evitando que o numero
    // cresca sem limite em nomes longos.
    hash = (hash * 31 + limpo.charCodeAt(i)) | 0;
  }

  // `Math.abs` antes do modulo: o hash pode ser negativo.
  return CORES[Math.abs(hash) % CORES.length];
}

/*
 * Cor do texto sobre o fundo derivado.
 *
 * Branco fixo: todas as cores da paleta foram escolhidas escuras o
 * bastante para isso. Se a paleta mudar, este e o ponto que precisa ser
 * revisto junto - por isso a constante existe, em vez de um '#fff' solto
 * no CSS.
 */
export const COR_TEXTO_AVATAR = '#ffffff';

export default { corDoNome, COR_TEXTO_AVATAR };
