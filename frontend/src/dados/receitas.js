/*
 * Receitas da terra.
 *
 * Conteudo editorial, nao dado de negocio: por isso vive no frontend e
 * nao em tabela. O que se liga ao catalogo e o campo `termos`, com os
 * termos que identificam o produto na vitrine.
 *
 * Por que casar por termo, e nao por id de produto: os ids do banco
 * mudam a cada ambiente (sao SERIAL), entao uma receita gravada com
 * `produto_id: 3` apontaria para outro produto depois de uma recarga de
 * seed. O nome do produto, em contrapartida, e estavel e legivel.
 *
 * O casamento acontece em `casarIngredientes`, que roda contra a lista
 * real de produtos publicos da API - a receita aponta para o catalogo
 * vivo, nao para uma copia que envelhece.
 *
 * `itensDespensa` sao os ingredientes que nao se compram no
 * marketplace (sal, azeite, agua). Aparecem na lista sem botao de
 * compra, porque oferecer uma acao que o servidor vai recusar e pior do
 * que nao oferecer acao nenhuma.
 */

export const CATEGORIAS_RECEITA = [
  'Todas',
  'Prato Principal',
  'Saladas',
  'Lanches & Sopas',
  'Sobremesas',
  'Bebidas & Sucos',
];

export const RECEITAS = [
  {
    id: 'rec-1',
    titulo: 'Sopa Creme Rústica de Abóbora Cabotiá com Alecrim e Mel',
    subtitulo:
      'Conforto e sabor com os legumes doces de Concórdia do Oeste e mel silvestre de Dez de Maio',
    tempoPreparoMinutos: 35,
    porcoes: 4,
    dificuldade: 'Fácil',
    categoria: 'Lanches & Sopas',
    imagem:
      'https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?auto=format&fit=crop&w=800&q=80',
    notaOrigem:
      'Receita tradicional adaptada pelos agricultores familiares de Toledo, valorizando a colheita farta de abóboras de outono.',
    dicaDoChef:
      'Asse a abóbora com casca e um fio de azeite antes de bater; isso carameliza os açúcares naturais e intensifica o sabor terroso.',
    ingredientes: [
      { nome: 'Abóbora Cabotiá Orgânica', quantidade: '1 kg picada', termos: ['abobora'] },
      { nome: 'Mel Silvestre de Florada Nativa', quantidade: '1 colher de sopa', termos: ['mel'] },
      { nome: 'Manjericão / Alecrim Fresco', quantidade: '1 raminho', termos: ['manjericao'] },
    ],
    itensDespensa: [
      'Cebola picada e dentes de alho',
      'Azeite de oliva e sal marinho',
      'Água fervente ou caldo de legumes caseiro',
    ],
    modoPreparo: [
      'Em uma panela funda, refogue o alho e a cebola em azeite de oliva até dourarem delicadamente.',
      'Acrescente os cubos de abóbora cabotiá e mexa por 3 minutos para absorver os aromas.',
      'Cubra com a água fervente ou caldo caseiro, adicione uma pitada de sal marinho e cozinhe em fogo médio por 20 minutos, até que a abóbora esteja macia como manteiga.',
      'Transfira para o liquidificador ou use um mixer na própria panela até formar um creme sedoso.',
      'Finalize com 1 colher de mel silvestre e decore com folhas frescas de manjericão e alecrim. Sirva bem quentinha.',
    ],
  },
  {
    id: 'rec-2',
    titulo: 'Salada Crocante da Horta de Toledo com Molho Especial',
    subtitulo:
      'O frescor da colheita matinal de Novo Sarandi com tomates italianos e ramas aromáticas',
    tempoPreparoMinutos: 15,
    porcoes: 4,
    dificuldade: 'Fácil',
    categoria: 'Saladas',
    imagem:
      'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=800&q=80',
    notaOrigem:
      'Utiliza as verduras colhidas no mesmo dia pelas famílias produtoras da região e os tomates rubi da horta de Novo Sarandi.',
    dicaDoChef:
      'Seque muito bem as folhas de alface e couve após a higienização para que o molho de azeite e mel adira perfeitamente, sem amolecer as folhas.',
    ingredientes: [
      { nome: 'Alface Crespa Agroecológica', quantidade: '1 maço limpo', termos: ['alface'] },
      { nome: 'Tomate Italiano Orgânico', quantidade: '3 unidades em gomos', termos: ['tomate'] },
      { nome: 'Cenoura Baby Crocante', quantidade: '1 xícara ralada', termos: ['cenoura'] },
      { nome: 'Mel Silvestre (para o molho)', quantidade: '1 colher de chá', termos: ['mel'] },
      { nome: 'Manjericão Fresco Orgânico', quantidade: 'Folhas inteiras', termos: ['manjericao'] },
    ],
    itensDespensa: ['Suco de limão taiti fresco e azeite extravirgem'],
    modoPreparo: [
      'Rasgue as folhas de alface fresca com as mãos para não oxidar as bordas.',
      'Corte os tomates italianos em gomos rústicos e rale a cenoura em lâminas finas.',
      'Em um bowl pequeno, emulsione o azeite, o limão fresco, o mel e uma pitada de sal com um garfo até encorpar.',
      'Misture os vegetais em uma travessa de cerâmica, regue com o molho e espalhe as folhas inteiras de manjericão.',
      'Sirva imediatamente como entrada refrescante e nutritiva.',
    ],
  },
  {
    id: 'rec-3',
    titulo: 'Escondidinho Caipira de Mandioca Mansa',
    subtitulo: 'Purê cremoso de mandioca amarela com recheio nutritivo e gratinado dourado',
    tempoPreparoMinutos: 45,
    porcoes: 6,
    dificuldade: 'Médio',
    categoria: 'Prato Principal',
    imagem:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
    notaOrigem:
      'Homenagem aos domingos em família nos distritos rurais de Toledo, com ingredientes da agricultura familiar.',
    dicaDoChef:
      'A mandioca da região já é naturalmente amanteigada; amasse ainda quente com um pouco da água do próprio cozimento.',
    ingredientes: [
      { nome: 'Mandioca Mansa Amarela', quantidade: '1 kg cozida e macia', termos: ['mandioca'] },
      { nome: 'Ovos Caipiras Orgânicos', quantidade: '1 gema para pincelar', termos: ['ovos'] },
      { nome: 'Couve Manteiga Orgânica', quantidade: '1 maço fatiado fino', termos: ['couve'] },
      { nome: 'Tomate Italiano Orgânico', quantidade: '2 unidades picadas', termos: ['tomate'] },
    ],
    itensDespensa: [
      'Manteiga caipira ou azeite',
      'Recheio a gosto (legumes refogados, cogumelos ou carne moída)',
    ],
    modoPreparo: [
      'Cozinhe a mandioca em água com sal por cerca de 15 minutos, até desmanchar. Escorra e amasse bem com a manteiga.',
      'Em uma frigideira, refogue a couve fatiada finamente e os cubos de tomate até murcharem.',
      'Em um refratário médio, faça uma camada com metade do purê de mandioca.',
      'Distribua o refogado temperado por igual.',
      'Cubra com o restante do purê, alise a superfície e pincele com a gema de ovo caipira.',
      'Leve ao forno pré-aquecido a 200°C por 20 minutos, até formar uma crosta dourada.',
    ],
  },
  {
    id: 'rec-4',
    titulo: 'Nhoque Rústico de Batata-Doce Roxa ao Pesto de Manjericão',
    subtitulo:
      'Cor exuberante e nutrição funcional com produtos colhidos no solo fértil do Paraná',
    tempoPreparoMinutos: 40,
    porcoes: 4,
    dificuldade: 'Médio',
    categoria: 'Prato Principal',
    imagem:
      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80',
    notaOrigem:
      'Prato colorido desenvolvido para incentivar as crianças a comerem tubérculos coloridos.',
    dicaDoChef:
      'Asse as batatas-doces roxas em vez de ferver: retêm menos umidade e reduzem a quantidade de farinha necessária na massa.',
    ingredientes: [
      {
        nome: 'Batata-Doce Roxa Orgânica',
        quantidade: '800 g assada e amassada',
        termos: ['batata-doce'],
      },
      { nome: 'Ovos Caipiras Orgânicos', quantidade: '1 unidade', termos: ['ovos'] },
      { nome: 'Manjericão Fresco', quantidade: '2 maços cheios', termos: ['manjericao'] },
    ],
    itensDespensa: [
      'Farinha de trigo orgânica ou de arroz (sem glúten)',
      'Azeite de oliva, castanhas e dente de alho (para o pesto)',
    ],
    modoPreparo: [
      'Misture a batata-doce amassada com o ovo caipira e adicione a farinha aos poucos, até dar ponto de enrolar sem grudar.',
      'Faça rolinhos compridos na bancada enfarinhada e corte em pedaços de 2 cm.',
      'Cozinhe em água fervente com sal abundante. Quando os nhoques subirem à superfície, retire com uma escumadeira.',
      'Bata as folhas de manjericão com o azeite, as castanhas, o alho e sal para fazer o pesto fresco.',
      'Envolva os nhoques roxos no pesto verde vibrante e sirva morno.',
    ],
  },
  {
    id: 'rec-5',
    titulo: 'Bolo Integral Fofinho de Banana com Mel Silvestre',
    subtitulo:
      'Sem açúcar refinado, adoçado com bananas no ponto e mel de florada de laranjeira',
    tempoPreparoMinutos: 50,
    porcoes: 8,
    dificuldade: 'Fácil',
    categoria: 'Sobremesas',
    imagem:
      'https://images.unsplash.com/photo-1607958996333-41aef7caefaa?auto=format&fit=crop&w=800&q=80',
    notaOrigem:
      'Receita querida das feiras de produtores de Toledo, perfeita para o café da tarde ou lanche escolar saudável.',
    dicaDoChef:
      'Polvilhe canela em pó por cima das rodelas de banana antes de ir ao forno, para um aroma irresistível.',
    ingredientes: [
      {
        nome: 'Banana Prata Orgânica bem madura',
        quantidade: '5 unidades amassadas',
        termos: ['banana'],
      },
      { nome: 'Mel Silvestre de Florada Nativa', quantidade: '1/2 xícara', termos: ['mel'] },
      { nome: 'Ovos Caipiras Orgânicos de Pasto', quantidade: '3 unidades', termos: ['ovos'] },
      {
        nome: 'Geleia Artesanal de Morango',
        quantidade: '2 colheres (opcional, para a calda)',
        termos: ['geleia'],
      },
    ],
    itensDespensa: ['Farinha de aveia em flocos e farinha integral', 'Fermento em pó e canela'],
    modoPreparo: [
      'Bata no liquidificador as bananas bem maduras, os ovos caipiras e o mel, até obter um creme espumoso.',
      'Em uma tigela, junte a mistura líquida às farinhas e à canela, mexendo com delicadeza.',
      'Por último, incorpore o fermento em pó com movimentos suaves, de baixo para cima.',
      'Despeje em forma untada e asse em forno pré-aquecido a 180°C por 35 a 40 minutos (faça o teste do palito).',
      'Deixe amornar e sirva fatiado. Para uma ocasião especial, acompanhe com uma colher de geleia artesanal.',
    ],
  },
  {
    id: 'rec-6',
    titulo: 'Suco Vitalidade Verde do Oeste Paranaense',
    subtitulo:
      'Revigorante desintoxicante matinal com couve fresca, cenoura doce e toque de mel',
    tempoPreparoMinutos: 10,
    porcoes: 2,
    dificuldade: 'Fácil',
    categoria: 'Bebidas & Sucos',
    imagem:
      'https://images.unsplash.com/photo-1556881286-fc6915169721?auto=format&fit=crop&w=800&q=80',
    notaOrigem:
      'Criado pela comunidade agroecológica de Dez de Maio como tônico energético para os dias de campo.',
    dicaDoChef:
      'Beba sem coar, para aproveitar integralmente as fibras que regulam o intestino e sustentam a energia ao longo do dia.',
    ingredientes: [
      {
        nome: 'Couve Manteiga Orgânica',
        quantidade: '2 folhas grandes higienizadas',
        termos: ['couve'],
      },
      { nome: 'Cenoura Baby Crocante', quantidade: '1 unidade', termos: ['cenoura'] },
      {
        nome: 'Banana Prata Orgânica congelada',
        quantidade: '1 unidade (dá cremosidade)',
        termos: ['banana'],
      },
      { nome: 'Mel Silvestre de Florada Nativa', quantidade: '1 colher de sobremesa', termos: ['mel'] },
    ],
    itensDespensa: ['Água mineral ou água de coco', 'Suco de 1/2 limão siciliano'],
    modoPreparo: [
      'Corte as folhas de couve e a cenoura em pedaços pequenos.',
      'Coloque no liquidificador junto com a banana congelada, a água gelada e o suco de limão.',
      'Bata em potência alta por 2 minutos, até ficar completamente homogêneo e cremoso.',
      'Adicione a colher de mel e pulse apenas para misturar.',
      'Sirva com pedras de gelo.',
    ],
  },
];

/*
 * Remove acentos e caixa para comparar termos com os nomes dos produtos.
 *
 * Necessario porque o catalogo grava "Abóbora Cabotiá" (com acento) e o
 * termo da receita e escrito sem acento. Comparar as strings cruas nunca
 * casaria, e a falha seria silenciosa: a receita simplesmente nao
 * mostraria o botao de compra, sem erro nenhum.
 */
export function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/*
 * Casa os ingredientes de uma receita com os produtos reais da vitrine.
 *
 * Devolve a lista de ingredientes com `produto` preenchido quando houver
 * correspondencia. Um mesmo produto pode servir a dois ingredientes
 * (o mel do molho e o mel do final), e isso e intencional - a lista
 * segue a ordem da receita.
 */
export function casarIngredientes(receita, produtos) {
  const lista = Array.isArray(produtos) ? produtos : [];

  return receita.ingredientes.map((ingrediente) => {
    const produto =
      lista.find((item) => {
        const nome = normalizarTexto(item.nome);
        return ingrediente.termos.some((termo) => nome.includes(normalizarTexto(termo)));
      }) || null;

    return { ...ingrediente, produto };
  });
}

/* Soma o preco dos produtos disponiveis para a receita. */
export function totalDosIngredientes(ingredientesCasados) {
  return ingredientesCasados.reduce(
    (soma, item) => (item.produto ? soma + Number(item.produto.preco || 0) : soma),
    0,
  );
}
