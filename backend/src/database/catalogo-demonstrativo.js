import { encerrarPool, comTransacao } from './pool.js';
import { gerarHashSenha, gerarSenhaAleatoria } from '../utils/senha.js';
import logger from '../config/logger.js';

/*
 * Catalogo demonstrativo.
 *
 * COMO USAR (dentro da pasta backend):
 *   npm run seed:catalogo
 *
 * POR QUE NAO ESTA EM `seeds/`
 *
 * Os arquivos de `seeds/` rodam automaticamente no `npm run seed`. No
 * plano gratuito do Render o seed precisa ser encadeado no
 * `startCommand` (nao ha Shell), entao tudo que estiver naquela pasta
 * pode acabar sendo gravado no banco de PRODUCAO. Dado de demonstracao
 * nao pode entrar em producao por efeito colateral de um deploy: quem
 * decide isso e uma pessoa, rodando este comando.
 *
 * POR QUE E UM SCRIPT JS, E NAO SQL
 *
 * As contas de demonstracao precisam de senha com hash bcrypt, e o
 * hash depende de um salt aleatorio - nao da para escrever em SQL
 * versionado. A regra do projeto e nao versionar senha: aqui a senha e
 * sorteada a cada execucao e aparece UMA VEZ no terminal, igual ao
 * administrador criado por `npm run seed`.
 *
 * O QUE ESTE SEED COBRE
 *
 * Os ingredientes das receitas da pagina `/receitas` casam por nome com
 * os produtos da vitrine (ver `casarIngredientes`, no frontend). Os
 * nomes abaixo foram escolhidos para que os 12 termos das receitas
 * encontrem um produto: abobora, mel, manjericao, alface, tomate,
 * cenoura, mandioca, ovos, couve, batata-doce, banana e geleia.
 *
 * IDEMPOTENTE
 *
 * Rodar duas vezes nao duplica nada: o produtor e identificado pelo
 * e-mail (unico) e o produto pelo par (agricultor, nome). Um produto ja
 * existente e deixado como esta, sem sobrescrever preco ou estoque -
 * quem editou na mao nao perde a edicao no proximo seed.
 */

const SENHA_DEMO_MINIMA = 20;

/*
 * Produtos sem `imagem_url` de proposito.
 *
 * A alternativa seria apontar para imagens de terceiros por link
 * direto, que e o que os produtos de producao fazem - mas um link
 * externo pode sair do ar e nao temos direito sobre ele. O
 * `ProductCard` ja trata a ausencia de imagem com um placeholder, entao
 * o catalogo fica apresentavel sem depender de servidor alheio.
 */
const PRODUTORES = [
  {
    email: 'sitio.bom.jesus@agrohero.demo',
    responsavel: 'Joana Batista',
    fazenda: 'Sítio Bom Jesus',
    cidade: 'Toledo',
    estado: 'PR',
    endereco: 'Linha São Cristóvão, s/n, Zona Rural',
    descricao:
      'Hortaliças e raízes colhidas no dia da entrega, sem agrotóxico.',
    historia:
      'A família Batista cultiva a mesma terra desde 1978. A produção é agroecológica desde 2011, quando a cooperativa da região passou a orientar o manejo do solo sem defensivo químico.',
    certificacoes: ['Produção agroecológica'],
    produtos: [
      { nome: 'Alface Crespa Orgânica', categoria: 'verduras', preco: 5.5, estoque: 40, unidade: 'unidade', descricao: 'Pé grande, colhido de manhã.' },
      { nome: 'Couve Manteiga Orgânica', categoria: 'verduras', preco: 4.0, estoque: 60, unidade: 'maço', descricao: 'Folhas largas, boas para refogado e suco.' },
      { nome: 'Manjericão Fresco Orgânico', categoria: 'verduras', preco: 6.0, estoque: 30, unidade: 'maço', descricao: 'Molho aromático, colhido na semana.' },
      { nome: 'Tomate Italiano Orgânico', categoria: 'legumes', preco: 9.9, estoque: 50, unidade: 'kg', descricao: 'Ideal para molho e salada.' },
      { nome: 'Cenoura Baby Crocante', categoria: 'legumes', preco: 8.9, estoque: 35, unidade: 'kg', descricao: 'Colhida nova, bem doce.' },
      { nome: 'Abóbora Cabotiá Orgânica', categoria: 'legumes', preco: 7.5, estoque: 45, unidade: 'kg', descricao: 'Polpa firme e bem alaranjada.' },
      { nome: 'Mandioca Mansa Amarela', categoria: 'legumes', preco: 9.0, estoque: 55, unidade: 'kg', descricao: 'Cozinhe rapidamente e desmancha bem.' },
      { nome: 'Batata-Doce Roxa', categoria: 'legumes', preco: 8.5, estoque: 40, unidade: 'kg', descricao: 'Massa roxa, boa para nhoque e assados.' },
      { nome: 'Banana Prata Orgânica', categoria: 'frutas', preco: 7.0, estoque: 30, unidade: 'kg', descricao: 'Cacho de pomar doméstico, bem maduro.' },
    ],
  },
  {
    email: 'apiario.vale.do.oeste@agrohero.demo',
    responsavel: 'Antônio Kruger',
    fazenda: 'Apiário Vale do Oeste',
    cidade: 'Toledo',
    estado: 'PR',
    endereco: 'Linha Concórdia, s/n, Zona Rural',
    descricao: 'Mel e derivados de apiário próprio, sem açúcar adicionado.',
    historia:
      'Apicultor há 22 anos, Antônio mantém cerca de 90 colmeias entre Toledo e Dez de Maio. O mel é extraído a frio, sem pasteurização, para preservar aroma e enzimas.',
    certificacoes: ['Apicultura sustentável'],
    produtos: [
      { nome: 'Mel Silvestre de Florada Nativa', categoria: 'outros', preco: 38.0, estoque: 25, unidade: 'unidade', descricao: 'Pote de 500 g, extração a frio.' },
      { nome: 'Geleia Artesanal de Frutas Vermelhas', categoria: 'outros', preco: 24.0, estoque: 20, unidade: 'unidade', descricao: 'Feita em casa, com pouca pectina.' },
    ],
  },
  {
    email: 'granja.dois.irmaos@agrohero.demo',
    responsavel: 'Cléber e Marli Rocha',
    fazenda: 'Granja Caipira Dois Irmãos',
    cidade: 'Toledo',
    estado: 'PR',
    endereco: 'Estrada do Dois Irmãos, km 4',
    descricao: 'Ovos de galinha caipira criada solta no pasto.',
    historia:
      'As aves são criadas soltas, com pasto e suplementação de milho. A produção é pequena de propósito: a coleta é feita duas vezes por dia para que o ovo chegue fresco.',
    certificacoes: ['Criação caipira'],
    produtos: [
      { nome: 'Ovos Caipiras Orgânicos', categoria: 'ovos', preco: 18.0, estoque: 70, unidade: 'duzia', descricao: 'Dúzia de ovos de casca marrom, coletados no dia.' },
    ],
  },
];

/* Mapa slug -> id das categorias, para nao gravar id fixo no codigo. */
async function mapaDeCategorias(cliente) {
  const { rows } = await cliente.query('SELECT id, slug FROM categorias');
  return new Map(rows.map((linha) => [linha.slug, linha.id]));
}

async function buscarUsuarioPorEmail(cliente, email) {
  const { rows } = await cliente.query(
    'SELECT id FROM usuarios WHERE email = $1',
    [email],
  );
  return rows[0]?.id ?? null;
}

async function buscarAgricultorPorUsuario(cliente, usuarioId) {
  const { rows } = await cliente.query(
    'SELECT id FROM agricultores WHERE usuario_id = $1',
    [usuarioId],
  );
  return rows[0]?.id ?? null;
}

async function criarProdutor(cliente, produtor, senhaHash) {
  const usuarioId = await buscarUsuarioPorEmail(cliente, produtor.email);

  if (usuarioId) {
    const agricultorId = await buscarAgricultorPorUsuario(cliente, usuarioId);
    if (agricultorId) return { agricultorId, criado: false };
    throw new Error(
      `O e-mail ${produtor.email} existe como usuario, mas sem perfil de agricultor. Corrija a mao antes de rodar o seed.`,
    );
  }

  const { rows } = await cliente.query(
    `INSERT INTO usuarios (nome, email, senha_hash, tipo, cidade, estado, ativo)
     VALUES ($1, $2, $3, 'agricultor', $4, $5, TRUE)
     RETURNING id`,
    [produtor.responsavel, produtor.email, senhaHash, produtor.cidade, produtor.estado],
  );

  const { rows: criado } = await cliente.query(
    `INSERT INTO agricultores
       (usuario_id, nome_fazenda, descricao, historia, cidade, estado, endereco, certificacoes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      rows[0].id,
      produtor.fazenda,
      produtor.descricao,
      produtor.historia,
      produtor.cidade,
      produtor.estado,
      produtor.endereco,
      produtor.certificacoes,
    ],
  );

  return { agricultorId: criado[0].id, criado: true };
}

async function criarProdutos(cliente, agricultorId, produtos, categorias) {
  let inseridos = 0;

  for (const produto of produtos) {
    const categoriaId = categorias.get(produto.categoria);
    if (!categoriaId) {
      throw new Error(
        `Categoria "${produto.categoria}" nao existe. Rode "npm run seed" antes deste script.`,
      );
    }

    /*
     * `$3::VARCHAR(140)` nao e decoracao: o mesmo parametro aparece como
     * valor do INSERT e como comparacao na subquery, e sem o cast o
     * Postgres deduz dois tipos diferentes para ele e recusa a query
     * ("inconsistent types deduced for parameter $3").
     *
     * O INSERT ... SELECT ... WHERE NOT EXISTS resolve a idempotencia no
     * proprio banco, sem SELECT previo: entre a checagem e a insercao
     * nao ha janela para uma execucao concorrente duplicar a linha.
     */
    const { rowCount } = await cliente.query(
      `INSERT INTO produtos
         (agricultor_id, categoria_id, nome, descricao, preco, estoque, unidade, ativo)
       SELECT $1, $2, $3::VARCHAR(140), $4, $5, $6, $7, TRUE
        WHERE NOT EXISTS (
          SELECT 1 FROM produtos WHERE agricultor_id = $1 AND nome = $3::VARCHAR(140)
        )`,
      [
        agricultorId,
        categoriaId,
        produto.nome,
        produto.descricao,
        produto.preco,
        produto.estoque,
        produto.unidade,
      ],
    );

    inseridos += rowCount;
  }

  return inseridos;
}

async function rodar() {
  logger.info('Iniciando catalogo demonstrativo');

  const senhaDemo = gerarSenhaAleatoria(SENHA_DEMO_MINIMA);
  // Um unico hash para as tres contas: o bcrypt no custo 12 leva ~250 ms
  // e sao contas de demonstracao, nao vale repetir o custo por conta.
  const senhaHash = await gerarHashSenha(senhaDemo);

  const resumo = await comTransacao(async (cliente) => {
    const categorias = await mapaDeCategorias(cliente);

    if (categorias.size === 0) {
      throw new Error(
        'Nao ha categorias no banco. Rode "npm run seed" antes deste script.',
      );
    }

    const resultado = { produtoresCriados: 0, produtosInseridos: 0 };

    for (const produtor of PRODUTORES) {
      const { agricultorId, criado } = await criarProdutor(cliente, produtor, senhaHash);
      if (criado) resultado.produtoresCriados += 1;

      resultado.produtosInseridos += await criarProdutos(
        cliente,
        agricultorId,
        produtor.produtos,
        categorias,
      );
    }

    return resultado;
  });

  const totalProdutores = PRODUTORES.length;
  const totalProdutos = PRODUTORES.reduce((soma, p) => soma + p.produtos.length, 0);

  logger.info(resumo, 'Catalogo demonstrativo concluido');

  // Fora do logger, como no seed do administrador: senha nao vai para
  // arquivo de log.
  console.log('\n' + '='.repeat(64));
  console.log('  CATALOGO DEMONSTRATIVO APLICADO');
  console.log('='.repeat(64));
  console.log(`  Produtores criados agora : ${resumo.produtoresCriados} de ${totalProdutores}`);
  console.log(`  Produtos inseridos agora : ${resumo.produtosInseridos} de ${totalProdutos}`);
  if (resumo.produtoresCriados > 0) {
    console.log('');
    console.log('  Contas de demonstracao (tipo agricultor):');
    for (const produtor of PRODUTORES) {
      console.log(`    ${produtor.email}`);
    }
    console.log(`  Senha (igual para as tres): ${senhaDemo}`);
    console.log('  Anote agora. Ela nao e exibida de novo.');
  }
  console.log('='.repeat(64));
  console.log('  Estes dados sao de demonstracao. Nao use em producao.\n');
}

rodar()
  .then(async () => {
    await encerrarPool();
    process.exit(0);
  })
  .catch(async (erro) => {
    await encerrarPool().catch(() => {});
    logger.error({ err: erro }, 'Catalogo demonstrativo interrompido');
    process.exit(1);
  });
