/*
 * Especificacao OpenAPI 3.0 da API.
 *
 * Este arquivo descreve APENAS endpoints que existem de verdade. Documentar
 * rota planejada como se ja funcionasse engana quem consome a API e faz o
 * Swagger "Try it out" devolver 404 - pior que nao ter documentacao.
 *
 * Cada fase acrescenta os componentes (schemas reutilizaveis) e os paths
 * do seu modulo. Os schemas de erro e paginacao ja ficam prontos aqui,
 * porque valem para toda a API.
 */

const schemas = {
  Erro: {
    type: 'object',
    properties: {
      sucesso: { type: 'boolean', example: false },
      erro: {
        type: 'object',
        properties: {
          codigo: { type: 'string', example: 'DADOS_INVALIDOS' },
          mensagem: { type: 'string', example: 'Dados invalidos.' },
          detalhes: {
            type: 'array',
            description: 'Presente em erros de validacao. O frontend usa os campos para destacar os inputs.',
            items: {
              type: 'object',
              properties: {
                campo: { type: 'string', example: 'email' },
                mensagem: { type: 'string', example: 'Informe um e-mail valido.' },
              },
            },
          },
        },
      },
    },
  },

  Paginacao: {
    type: 'object',
    properties: {
      pagina: { type: 'integer', example: 1 },
      limite: { type: 'integer', example: 20 },
      total: { type: 'integer', example: 137 },
      paginas: { type: 'integer', example: 7 },
      temAnterior: { type: 'boolean', example: false },
      temProxima: { type: 'boolean', example: true },
    },
  },

  Saude: {
    type: 'object',
    properties: {
      api: { type: 'string', example: 'ok' },
      banco: { type: 'string', example: 'ok', description: 'Valores possiveis: ok, indisponivel.' },
      latenciaBancoMs: { type: 'integer', example: 3 },
      ambiente: { type: 'string', example: 'development' },
      uptimeSegundos: { type: 'integer', example: 120 },
    },
  },

  UsuarioPublico: {
    type: 'object',
    description:
      'Dados publicos do usuario. Nunca inclui senha nem senha_hash - a consulta ao banco usa uma lista explicita de colunas.',
    properties: {
      id: { type: 'integer', example: 1 },
      nome: { type: 'string', example: 'Maria Produtora' },
      email: { type: 'string', format: 'email', example: 'maria@teste.com' },
      telefone: { type: 'string', nullable: true, example: '19999998888' },
      cidade: { type: 'string', nullable: true, example: 'Campinas' },
      estado: { type: 'string', nullable: true, example: 'SP' },
      tipo: {
        type: 'string',
        enum: ['cliente', 'agricultor', 'administrador'],
        example: 'agricultor',
      },
      ativo: { type: 'boolean', example: true },
      criado_em: { type: 'string', format: 'date-time' },
      atualizado_em: { type: 'string', format: 'date-time' },
    },
  },

  PerfilAgricultor: {
    type: 'object',
    description: 'Perfil publico da propriedade. Presente apenas quando o usuario e agricultor.',
    nullable: true,
    properties: {
      id: { type: 'integer', example: 1 },
      nome_fazenda: { type: 'string', example: 'Sitio Boa Vista' },
      descricao: { type: 'string', nullable: true },
      historia: { type: 'string', nullable: true },
      cidade: { type: 'string', nullable: true, example: 'Campinas' },
      estado: { type: 'string', nullable: true, example: 'SP' },
      endereco: { type: 'string', nullable: true },
      certificacoes: { type: 'array', items: { type: 'string' }, example: ['Organico IBD'] },
      imagem_url: { type: 'string', nullable: true },
      ativo: { type: 'boolean', example: true },
    },
  },

  /*
   * Perfil publico do produtor, como aparece no marketplace.
   *
   * Repare no que este schema NAO tem: e-mail, telefone e endereco. Nao e
   * omissao da documentacao - a rota realmente nao devolve esses campos.
   * Documentar aqui o que a API nao expoe ajuda quem consome a entender
   * que o contato nao esta disponivel por essa via.
   */
  ProdutorPublico: {
    type: 'object',
    description:
      'Perfil publico do produtor. Nao inclui e-mail, telefone nem endereco completo: o requisito 13 define esses campos como privados, e a rota e publica.',
    properties: {
      id: { type: 'integer', example: 1 },
      nome_fazenda: { type: 'string', example: 'Sitio Boa Vista' },
      descricao: { type: 'string', nullable: true, example: 'Produtos organicos sem agrotoxicos.' },
      historia: { type: 'string', nullable: true, example: 'Terceira geracao da familia na mesma terra.' },
      cidade: { type: 'string', nullable: true, example: 'Campinas' },
      estado: { type: 'string', nullable: true, example: 'SP' },
      certificacoes: { type: 'array', items: { type: 'string' }, example: ['Organico IBD'] },
      imagem_url: { type: 'string', nullable: true },
      ativo: { type: 'boolean', example: true },
      criado_em: { type: 'string', format: 'date-time' },
      atualizado_em: { type: 'string', format: 'date-time' },
      responsavel_nome: { type: 'string', example: 'Carlos Produtor' },
      media_avaliacoes: { type: 'number', example: 4.5 },
      total_avaliacoes: { type: 'integer', example: 12 },
    },
  },

  ReputacaoProdutor: {
    type: 'object',
    description: 'Resumo da reputacao do produtor, usado no cabecalho do perfil publico.',
    properties: {
      total: { type: 'integer', example: 12 },
      media: { type: 'number', example: 4.5 },
      distribuicao: {
        type: 'object',
        description: 'Quantidade de avaliacoes por nota. Permite desenhar o grafico do perfil.',
        properties: {
          1: { type: 'integer', example: 0 },
          2: { type: 'integer', example: 1 },
          3: { type: 'integer', example: 2 },
          4: { type: 'integer', example: 4 },
          5: { type: 'integer', example: 5 },
        },
      },
    },
  },

  ResumoProdutos: {
    type: 'object',
    description: 'Contagem de produtos do produtor, por situacao.',
    properties: {
      produtos_total: { type: 'integer', example: 18 },
      produtos_ativos: { type: 'integer', example: 15 },
      produtos_esgotados: { type: 'integer', example: 2 },
    },
  },

  ProdutoPublico: {
    type: 'object',
    description: 'Produto como aparece na vitrine publica.',
    properties: {
      id: { type: 'integer', example: 1 },
      nome: { type: 'string', example: 'Morango Organico' },
      descricao: { type: 'string', nullable: true },
      preco: { type: 'number', example: 25.9 },
      estoque: { type: 'integer', example: 40 },
      unidade: { type: 'string', example: 'unidade' },
      imagem_url: { type: 'string', nullable: true },
      ativo: { type: 'boolean', example: true },
      agricultor_id: { type: 'integer', example: 1 },
      categoria_id: { type: 'integer', example: 1 },
      categoria_nome: { type: 'string', example: 'Frutas' },
      categoria_slug: { type: 'string', example: 'frutas' },
      nome_fazenda: { type: 'string', example: 'Sitio Boa Vista' },
      agricultor_cidade: { type: 'string', nullable: true, example: 'Campinas' },
      agricultor_estado: { type: 'string', nullable: true, example: 'SP' },
      media_avaliacoes: { type: 'number', example: 4.5 },
      total_avaliacoes: { type: 'integer', example: 12 },
      criado_em: { type: 'string', format: 'date-time' },
      atualizado_em: { type: 'string', format: 'date-time' },
    },
  },

  AvaliacaoPublica: {
    type: 'object',
    description:
      'Avaliacao exibida no perfil do produtor. Traz apenas o primeiro nome de quem avaliou: publicar o nome completo, ligado ao que a pessoa comprou, seria exposicao desnecessaria.',
    properties: {
      id: { type: 'integer', example: 1 },
      nota: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
      comentario: { type: 'string', nullable: true, example: 'Chegou fresco e bem embalado.' },
      criado_em: { type: 'string', format: 'date-time' },
      produto_id: { type: 'integer', example: 1 },
      produto_nome: { type: 'string', example: 'Morango Organico' },
      consumidor_primeiro_nome: { type: 'string', example: 'Maria' },
    },
  },

  PerfilPublicoProdutor: {
    allOf: [
      { $ref: '#/components/schemas/ProdutorPublico' },
      {
        type: 'object',
        properties: {
          reputacao: { $ref: '#/components/schemas/ReputacaoProdutor' },
          resumo: { $ref: '#/components/schemas/ResumoProdutos' },
          produtos: {
            type: 'array',
            description: 'Primeiros produtos da vitrine. A lista completa fica em /agricultores/{id}/produtos.',
            items: { $ref: '#/components/schemas/ProdutoPublico' },
          },
          produtos_paginacao: { $ref: '#/components/schemas/Paginacao' },
        },
      },
    ],
  },

  CategoriaPublica: {
    type: 'object',
    description:
      'Categoria do catalogo. A contagem considera apenas produtos ativos: o filtro do marketplace nao deve sugerir produto disponivel quando todos estao desativados.',
    properties: {
      id: { type: 'integer', example: 1 },
      nome: { type: 'string', example: 'Frutas' },
      slug: {
        type: 'string',
        description: 'Identificador para URL, derivado do nome. Formato: letras minusculas, numeros e hifen.',
        example: 'frutas',
      },
      descricao: { type: 'string', nullable: true, example: 'Frutas frescas da estacao.' },
      ativo: { type: 'boolean', example: true },
      total_produtos: {
        type: 'integer',
        description: 'Produtos ativos nesta categoria.',
        example: 12,
      },
      criado_em: { type: 'string', format: 'date-time' },
      atualizado_em: { type: 'string', format: 'date-time' },
    },
  },

  CategoriaEntrada: {
    type: 'object',
    required: ['nome'],
    properties: {
      nome: { type: 'string', minLength: 2, maxLength: 80, example: 'Grãos e Cereais' },
      descricao: { type: 'string', maxLength: 1000, nullable: true },
      ativo: { type: 'boolean', default: true },
    },
  },

  CategoriaAtualizacao: {
    type: 'object',
    description:
      'Todos os campos sao opcionais, mas ao menos um deve ser enviado. O slug NAO e aceito: ele e derivado do nome quando o nome muda, e mantido quando so a descricao muda - assim as URLs ja publicadas continuam validas.',
    properties: {
      nome: { type: 'string', minLength: 2, maxLength: 80, example: 'Frutas Frescas' },
      descricao: { type: 'string', maxLength: 1000, nullable: true },
      ativo: { type: 'boolean' },
    },
  },

  CategoriaDesativada: {
    type: 'object',
    description:
      'Resultado da desativacao. `produtos_afetados` informa quantos produtos ativos sairam do marketplace junto com a categoria, para o admin dimensionar o efeito.',
    properties: {
      id: { type: 'integer', example: 1 },
      ativo: { type: 'boolean', example: false },
      produtos_afetados: { type: 'integer', example: 8 },
    },
  },

  ProdutoPublico: {
    type: 'object',
    description:
      'Produto na vitrine. `media_avaliacoes` e `total_avaliacoes` vem da view produtos_com_avaliacao.',
    properties: {
      id: { type: 'integer', example: 1 },
      nome: { type: 'string', example: 'Tomate Italiano' },
      descricao: { type: 'string', nullable: true },
      preco: {
        type: 'number',
        description: 'Preco em reais. O servidor devolve como numero.',
        example: 8.5,
      },
      estoque: { type: 'integer', example: 120 },
      unidade: {
        type: 'string',
        description:
          'Unidade de venda. Lista fechada: unidade, kg, g, litro, ml, duzia, bandeja, maço, caixa, pacote.',
        example: 'kg',
      },
      imagem_url: { type: 'string', nullable: true },
      ativo: { type: 'boolean' },
      agricultor_id: { type: 'integer', example: 3 },
      categoria_id: { type: 'integer', example: 2 },
      categoria_nome: { type: 'string', example: 'Legumes' },
      categoria_slug: { type: 'string', example: 'legumes' },
      nome_fazenda: { type: 'string', example: 'Sitio Boa Vista' },
      agricultor_cidade: { type: 'string', example: 'Campinas' },
      agricultor_estado: { type: 'string', example: 'SP' },
      media_avaliacoes: { type: 'number', example: 4.5 },
      total_avaliacoes: { type: 'integer', example: 12 },
      criado_em: { type: 'string', format: 'date-time' },
      atualizado_em: { type: 'string', format: 'date-time' },
    },
  },

  ProdutoEntrada: {
    type: 'object',
    required: ['nome', 'preco', 'categoria_id'],
    description:
      'O dono do produto vem do token; `agricultor_id` enviado no corpo e ignorado. `ativo` nao e aceito na criacao: produto novo nasce ativo e a disponibilidade tem rota propria.',
    properties: {
      nome: { type: 'string', minLength: 2, maxLength: 140, example: 'Tomate Italiano' },
      descricao: { type: 'string', maxLength: 2000, nullable: true },
      preco: {
        type: 'number',
        exclusiveMinimum: 0,
        description: 'Maior que zero, no maximo 2 casas decimais.',
        example: 8.5,
      },
      estoque: { type: 'integer', minimum: 0, default: 0, example: 120 },
      unidade: { type: 'string', default: 'unidade', example: 'kg' },
      categoria_id: { type: 'integer', example: 2 },
      imagem_url: { type: 'string', nullable: true },
    },
  },

  ProdutoAtualizacao: {
    type: 'object',
    description:
      'Ao menos um campo deve ser enviado. Campos ausentes permanecem inalterados. `agricultor_id`, `ativo` e os atributos de imagem nao sao aceitos aqui.',
    properties: {
      nome: { type: 'string', minLength: 2, maxLength: 140 },
      descricao: { type: 'string', maxLength: 2000, nullable: true },
      preco: { type: 'number', exclusiveMinimum: 0 },
      estoque: { type: 'integer', minimum: 0 },
      unidade: { type: 'string' },
      categoria_id: { type: 'integer' },
      imagem_url: { type: 'string', nullable: true },
    },
  },

  ProdutoDisponibilidade: {
    type: 'object',
    required: ['ativo'],
    properties: {
      ativo: { type: 'boolean', example: false },
    },
  },

  ProdutoEstoque: {
    type: 'object',
    required: ['quantidade'],
    description:
      'A quantidade e SOMADA ao estoque atual, nunca substitui. Isso evita perder reposicoes simultaneas.',
    properties: {
      quantidade: { type: 'integer', minimum: 1, example: 50 },
    },
  },

  PerfilCompleto: {
    allOf: [
      { $ref: '#/components/schemas/UsuarioPublico' },
      {
        type: 'object',
        properties: {
          agricultor: { $ref: '#/components/schemas/PerfilAgricultor' },
        },
      },
    ],
  },

  RespostaAutenticacao: {
    type: 'object',
    properties: {
      sucesso: { type: 'boolean', example: true },
      dados: {
        type: 'object',
        properties: {
          usuario: { $ref: '#/components/schemas/UsuarioPublico' },
          token: {
            type: 'string',
            description:
              'JWT para usar em `Authorization: Bearer <token>`. Carrega apenas `sub` (id) e `tipo` - nunca senha nem dados pessoais.',
            example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          },
        },
      },
    },
  },

  CadastroCliente: {
    type: 'object',
    required: ['nome', 'email', 'senha'],
    properties: {
      nome: { type: 'string', minLength: 2, maxLength: 120, example: 'Joao da Silva' },
      email: { type: 'string', format: 'email', example: 'joao@teste.com' },
      senha: {
        type: 'string',
        minLength: 8,
        maxLength: 72,
        description:
          'No minimo 8 caracteres, com pelo menos uma letra e um numero. O limite e 72 BYTES (acentos contam como 2), porque o bcrypt trunca silenciosamente alem disso.',
        example: 'SenhaSegura1',
      },
      telefone: { type: 'string', example: '19999998888', description: '10 ou 11 digitos, com DDD.' },
      cidade: { type: 'string', example: 'Campinas' },
      estado: { type: 'string', example: 'SP', description: 'Sigla com 2 letras.' },
      tipo: {
        type: 'string',
        enum: ['cliente', 'agricultor'],
        default: 'cliente',
        description:
          'Apenas cliente ou agricultor. Enviar "administrador" resulta em 400: nao existe autocadastro de administrador.',
      },
    },
  },

  CadastroAgricultor: {
    allOf: [
      { $ref: '#/components/schemas/CadastroCliente' },
      {
        type: 'object',
        required: ['tipo', 'agricultor'],
        properties: {
          tipo: { type: 'string', enum: ['agricultor'], example: 'agricultor' },
          agricultor: {
            type: 'object',
            required: ['nome_fazenda'],
            description:
              'Obrigatorio quando tipo = agricultor. Usuario e perfil sao criados na MESMA transacao: ou nascem os dois, ou nenhum.',
            properties: {
              nome_fazenda: { type: 'string', example: 'Sitio Boa Vista' },
              descricao: { type: 'string' },
              historia: { type: 'string' },
              endereco: { type: 'string' },
              certificacoes: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    ],
  },

  Login: {
    type: 'object',
    required: ['email', 'senha'],
    properties: {
      email: { type: 'string', format: 'email', example: 'joao@teste.com' },
      senha: { type: 'string', example: 'SenhaSegura1' },
    },
  },

  AtualizarPerfil: {
    type: 'object',
    description:
      'Todos os campos sao opcionais. `email`, `tipo` e `ativo` NAO sao aceitos: sao descartados pela validacao antes de chegar ao service.',
    properties: {
      nome: { type: 'string', example: 'Joao da Silva' },
      telefone: { type: 'string', example: '19999998888' },
      cidade: { type: 'string', example: 'Recife' },
      estado: { type: 'string', example: 'PE' },
      agricultor: {
        type: 'object',
        description: 'Aplicavel apenas quando o usuario e agricultor.',
        properties: {
          nome_fazenda: { type: 'string' },
          descricao: { type: 'string' },
          historia: { type: 'string' },
          endereco: { type: 'string' },
          cidade: { type: 'string' },
          estado: { type: 'string' },
          certificacoes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },

  TrocarSenha: {
    type: 'object',
    required: ['senha_atual', 'nova_senha', 'confirma_nova_senha'],
    properties: {
      senha_atual: {
        type: 'string',
        description:
          'Exigida mesmo com o usuario ja autenticado: limita o estrago de um token vazado, impedindo que o atacante troque a senha e tome a conta.',
      },
      nova_senha: { type: 'string', description: 'Mesma politica do cadastro.' },
      confirma_nova_senha: { type: 'string' },
    },
  },
};

const respostas = {
  ErroValidacao: {
    description: 'Dados invalidos (validacao com Zod).',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
  },
  NaoAutenticado: {
    description: 'Token ausente, invalido ou expirado.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
  },
  SemPermissao: {
    description: 'Usuario autenticado, mas sem permissao para a acao.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
  },
  NaoEncontrado: {
    description: 'Recurso nao encontrado.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
  },
  Conflito: {
    description: 'Conflito com o estado atual (ex.: estoque insuficiente).',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
  },
  MuitasRequisicoes: {
    description: 'Limite de requisicoes atingido.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
  },
};

/*
 * Esquema de seguranca para o botao "Authorize" do Swagger UI.
 *
 * Declarar isso permite colar o token uma vez e testar todas as rotas
 * protegidas pela interface, sem montar o cabecalho na mao.
 */
const esquemasSeguranca = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Token obtido em POST /api/v1/auth/login ou /api/v1/auth/register. Informe apenas o token: o Swagger adiciona o prefixo "Bearer".',
  },
};

export const openapi = {
  openapi: '3.0.3',

  info: {
    title: 'AgroHero API',
    version: '1.0.0',
    description: [
      'API do marketplace de produtos organicos AgroHero.',
      '',
      '**Formato de resposta.** Todas as respostas usam um envelope:',
      '',
      '- Sucesso: `{ "sucesso": true, "dados": {...}, "paginacao": {...} }`',
      '- Erro: `{ "sucesso": false, "erro": { "codigo": "...", "mensagem": "...", "detalhes": [...] } }`',
      '',
      '**Autenticacao.** Rotas protegidas exigem `Authorization: Bearer <token>`.',
      '',
      '**Status de implementacao.** Apenas endpoints ja implementados aparecem aqui.',
    ].join('\n'),
  },

  /*
   * Um unico servidor, com o host raiz.
   *
   * Antes havia dois (um na raiz e outro em /api/v1). Isso quebra o
   * "Try it out": o Swagger usa o PRIMEIRO servidor como padrao, e como
   * os caminhos de negocio nao tem o prefixo /api/v1, a chamada iria
   * para http://localhost:3001/auth/register - que responde 404. Por
   * isso os caminhos de negocio abaixo sao declarados com o prefixo
   * completo.
   */
  servers: [
    { url: 'http://localhost:3001', description: 'Desenvolvimento local' },
  ],

  tags: [
    { name: 'Infraestrutura', description: 'Saude e estado da API' },
    { name: 'Autenticacao', description: 'Cadastro e login (rotas publicas)' },
    { name: 'Usuarios', description: 'Perfil do usuario autenticado (requer token)' },
  ],

  paths: {
    '/health': {
      get: {
        tags: ['Infraestrutura'],
        summary: 'Estado da API e do banco',
        description:
          'Verifica a API e executa `SELECT 1` no PostgreSQL. Responde 503 quando o banco esta fora - a API continua no ar e se recupera sozinha quando o banco voltar.',
        responses: {
          200: {
            description: 'API e banco funcionando.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/Saude' },
                  },
                },
              },
            },
          },
          503: {
            description: 'API no ar, mas sem conexao com o PostgreSQL.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: false },
                    dados: { $ref: '#/components/schemas/Saude' },
                    erro: {
                      type: 'object',
                      properties: {
                        codigo: { type: 'string', example: 'BANCO_INDISPONIVEL' },
                        mensagem: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        tags: ['Autenticacao'],
        summary: 'Cadastra um usuario',
        description:
          'Rota publica. Cria cliente ou agricultor. Nao existe autocadastro de administrador: enviar `tipo: "administrador"` responde 400.\n\n' +
          'Quando `tipo` e `agricultor`, o perfil da propriedade e criado na MESMA transacao do usuario. Se qualquer um dos dois INSERT falhar, o rollback desfaz tudo - nunca fica um produtor sem perfil.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/CadastroCliente' },
                  { $ref: '#/components/schemas/CadastroAgricultor' },
                ],
              },
            },
          },
        },
        responses: {
          201: {
            description:
              'Usuario criado. A resposta ja traz um token, entao o frontend pode autenticar direto sem um segundo round-trip de login.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RespostaAutenticacao' },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          409: { $ref: '#/components/responses/Conflito' },
          429: {
            description: 'Muitas tentativas (mesmo limitador do login).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
          },
        },
      },
    },

    '/api/v1/auth/login': {
      post: {
        tags: ['Autenticacao'],
        summary: 'Autentica e devolve um token',
        description:
          'Rota publica. Todas as falhas (senha errada, e-mail inexistente, conta bloqueada) respondem exatamente o mesmo 401 com a mesma mensagem.\n\n' +
          'Isso e proposital: respostas diferentes transformariam o login em um oraculo para descobrir quais e-mails estao cadastrados. O tempo de resposta tambem e equalizado.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Login' } },
          },
        },
        responses: {
          200: {
            description: 'Autenticado.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RespostaAutenticacao' },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          429: {
            description: 'Muitas tentativas de login (protecao contra forca bruta).',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
          },
        },
      },
    },

    '/api/v1/usuarios/profile': {
      get: {
        tags: ['Usuarios'],
        summary: 'Perfil do usuario autenticado',
        description:
          'Devolve o perfil de QUEM esta autenticado. Nao existe rota para ler o perfil de outro usuario, e por isso nao ha IDOR aqui.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Perfil do usuario.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/PerfilCompleto' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
        },
      },
      put: {
        tags: ['Usuarios'],
        summary: 'Atualiza o proprio perfil',
        description:
          '`email`, `tipo` e `ativo` sao descartados pela validacao: troca de e-mail exige verificacao, e mudar o proprio tipo ou desbloquear a propria conta seria escalacao de privilegio.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AtualizarPerfil' } },
          },
        },
        responses: {
          200: {
            description: 'Perfil atualizado.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/UsuarioPublico' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
        },
      },
    },

    '/api/v1/usuarios/senha': {
      put: {
        tags: ['Usuarios'],
        summary: 'Troca a propria senha',
        description:
          'Exige a senha atual mesmo com o usuario ja autenticado. Isso limita o estrago de um token vazado: sem essa exigencia, quem obtivesse o token poderia trocar a senha e tomar a conta em definitivo.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/TrocarSenha' } },
          },
        },
        responses: {
          204: { description: 'Senha alterada. Sem corpo na resposta.' },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          422: {
            description: 'Nova senha igual a atual.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
          },
        },
      },
    },
    '/api/v1/agricultores': {
      get: {
        tags: ['Agricultores'],
        summary: 'Lista publica de produtores',
        description:
          'Rota publica: nao exige autenticacao. Devolve apenas produtores visiveis (perfil ativo E usuario nao bloqueado). Nao expoe e-mail, telefone nem endereco do produtor.',
        parameters: [
          {
            name: 'busca',
            in: 'query',
            description: 'Trecho do nome da fazenda. Os curingas do LIKE sao escapados.',
            schema: { type: 'string', minLength: 2, maxLength: 100 },
          },
          {
            name: 'cidade',
            in: 'query',
            schema: { type: 'string', minLength: 2, maxLength: 80 },
          },
          {
            name: 'estado',
            in: 'query',
            description: 'Sigla da UF, duas letras.',
            schema: { type: 'string', pattern: '^[A-Za-z]{2}$' },
          },
          {
            name: 'ordenar',
            in: 'query',
            schema: { type: 'string', enum: ['nome', 'recentes', 'avaliacao'], default: 'nome' },
          },
          { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limite',
            in: 'query',
            description: 'Maximo de 100. O servidor impoe o teto.',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          200: {
            description: 'Lista de produtores.',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      type: 'object',
                      properties: {
                        sucesso: { type: 'boolean', example: true },
                        dados: { type: 'array', items: { $ref: '#/components/schemas/ProdutorPublico' } },
                      },
                    },
                  ],
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
        },
      },
    },

    '/api/v1/agricultores/{id}': {
      get: {
        tags: ['Agricultores'],
        summary: 'Perfil publico do produtor',
        description:
          'Devolve o perfil, a reputacao, o resumo de produtos e os primeiros itens da vitrine em uma resposta so, para o frontend desenhar a pagina inteira sem tres requisicoes. Produtor inexistente ou suspenso devolve o MESMO 404, para nao confirmar a existencia de um perfil oculto.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'ID do produtor (tabela agricultores, nao o id de usuario).',
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'categoria_id',
            in: 'query',
            description: 'Recorta a vitrine por categoria.',
            schema: { type: 'integer', minimum: 1 },
          },
          {
            name: 'ordenar',
            in: 'query',
            schema: { type: 'string', enum: ['recentes', 'baratos', 'caros', 'nome'] },
          },
        ],
        responses: {
          200: {
            description: 'Perfil publico do produtor.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/PerfilPublicoProdutor' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          404: {
            description: 'Produtor inexistente, suspenso ou com usuario bloqueado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
          },
        },
      },
    },

    '/api/v1/agricultores/{id}/produtos': {
      get: {
        tags: ['Agricultores'],
        summary: 'Vitrine paginada do produtor',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
          { name: 'categoria_id', in: 'query', schema: { type: 'integer', minimum: 1 } },
          {
            name: 'ordenar',
            in: 'query',
            schema: { type: 'string', enum: ['recentes', 'baratos', 'caros', 'nome'] },
          },
          { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: {
          200: {
            description: 'Produtos publicos do produtor.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { type: 'array', items: { $ref: '#/components/schemas/ProdutoPublico' } },
                    paginacao: { $ref: '#/components/schemas/Paginacao' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
        },
      },
    },

    '/api/v1/agricultores/{id}/avaliacoes': {
      get: {
        tags: ['Agricultores'],
        summary: 'Avaliacoes recebidas pelo produtor',
        description:
          'Devolve as avaliacoes com a reputacao agregada. Cada avaliacao traz apenas o primeiro nome de quem avaliou.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
          { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: {
          200: {
            description: 'Avaliacoes e reputacao do produtor.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: {
                      type: 'object',
                      properties: {
                        avaliacoes: {
                          type: 'array',
                          items: { $ref: '#/components/schemas/AvaliacaoPublica' },
                        },
                        reputacao: { $ref: '#/components/schemas/ReputacaoProdutor' },
                      },
                    },
                    paginacao: { $ref: '#/components/schemas/Paginacao' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
        },
      },
    },
    '/api/v1/categorias': {
      get: {
        tags: ['Categorias'],
        summary: 'Lista categorias ativas',
        description:
          'Rota publica. Devolve apenas categorias ativas - o parametro para incluir desativadas existe somente na rota administrativa, e aqui e descartado na validacao.',
        parameters: [
          { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: 'Lista de categorias ativas, ordenada por nome.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { type: 'array', items: { $ref: '#/components/schemas/CategoriaPublica' } },
                    paginacao: { $ref: '#/components/schemas/Paginacao' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
        },
      },
    },

    '/api/v1/categorias/{id}': {
      get: {
        tags: ['Categorias'],
        summary: 'Detalhe da categoria por id ou slug',
        description:
          'Aceita id numerico ou slug na mesma rota: /categorias/3 e /categorias/frutas sao equivalentes. Categoria desativada devolve 404, sem distinguir de inexistente.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Id numerico ou slug (letras minusculas, numeros e hifen).',
            schema: { type: 'string', example: 'frutas' },
          },
        ],
        responses: {
          200: {
            description: 'Categoria encontrada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/CategoriaPublica' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
        },
      },
    },

    '/api/v1/admin/categorias': {
      get: {
        tags: ['Admin'],
        summary: 'Lista categorias, incluindo desativadas',
        description:
          'O padrao de `incluir_inativas` e `true`: o admin abre esta rota principalmente para enxergar e reativar o que esta fora do ar.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incluir_inativas',
            in: 'query',
            schema: { type: 'string', enum: ['true', 'false'], default: 'true' },
          },
          { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: 'Lista de categorias.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { type: 'array', items: { $ref: '#/components/schemas/CategoriaPublica' } },
                    paginacao: { $ref: '#/components/schemas/Paginacao' },
                  },
                },
              },
            },
          },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
        },
      },
      post: {
        tags: ['Admin'],
        summary: 'Cria categoria',
        description:
          'O slug e derivado do nome pelo servidor; enviar `slug` no corpo nao tem efeito. Nome duplicado (ignorando maiuscula) devolve 409. Se o slug gerado colidir com um existente, um sufixo numerico e acrescentado.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CategoriaEntrada' } },
          },
        },
        responses: {
          201: {
            description: 'Categoria criada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/CategoriaPublica' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          409: { $ref: '#/components/responses/Conflito' },
        },
      },
    },

    '/api/v1/admin/categorias/{id}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
      ],
      get: {
        tags: ['Admin'],
        summary: 'Detalhe da categoria, incluindo desativada',
        description:
          'Diferente da rota publica, aqui `incluir_inativa` e aceito e o padrao e `true` - e o unico jeito de abrir uma categoria desativada para reativa-la.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incluir_inativa',
            in: 'query',
            schema: { type: 'string', enum: ['true', 'false'], default: 'true' },
          },
        ],
        responses: {
          200: {
            description: 'Categoria encontrada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/CategoriaPublica' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
        },
      },
      put: {
        tags: ['Admin'],
        summary: 'Atualiza categoria',
        description:
          'O slug e regerado apenas quando o nome muda. Alterar so a descricao preserva a URL atual.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CategoriaAtualizacao' } },
          },
        },
        responses: {
          200: {
            description: 'Categoria atualizada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/CategoriaPublica' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
          409: { $ref: '#/components/responses/Conflito' },
        },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Desativa categoria (exclusao logica)',
        description:
          'Nao apaga o registro. O motivo e duplo: `produtos.categoria_id` tem ON DELETE RESTRICT, entao apagar uma categoria em uso falharia; e mesmo sem produto, apagar perderia a referencia historica dos pedidos. Desativar tambem retira do marketplace os produtos dessa categoria.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Categoria desativada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/CategoriaDesativada' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
          422: {
            description: 'Categoria ja esta desativada.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
          },
        },
      },
    },

    '/api/v1/admin/categorias/{id}/ativar': {
      patch: {
        tags: ['Admin'],
        summary: 'Reativa categoria',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
        ],
        responses: {
          200: {
            description: 'Categoria reativada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer', example: 1 },
                        ativo: { type: 'boolean', example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
          422: {
            description: 'Categoria ja esta ativa.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
          },
        },
      },
    },
    '/api/v1/produtos': {
      get: {
        tags: ['Produtos'],
        summary: 'Catalogo publico com busca, filtros e paginacao',
        description:
          'Rota publica. Por padrao devolve apenas produtos DISPONIVEIS, o que significa: produto ativo, com estoque, de produtor ativo, com usuario ativo e de categoria ativa. Basta um desses estar desligado para o produto sair do resultado. A ordenacao e um enum fechado - nenhum texto do cliente chega ao ORDER BY.',
        parameters: [
          {
            name: 'busca',
            in: 'query',
            description: 'Trecho do nome. Curingas do LIKE (% e _) sao tratados como texto literal.',
            schema: { type: 'string', minLength: 2, maxLength: 100 },
          },
          { name: 'categoria_id', in: 'query', schema: { type: 'integer' } },
          { name: 'agricultor_id', in: 'query', schema: { type: 'integer' } },
          { name: 'cidade', in: 'query', schema: { type: 'string' } },
          {
            name: 'estado',
            in: 'query',
            description: 'Sigla de duas letras; aceita minuscula e normaliza para maiuscula.',
            schema: { type: 'string', minLength: 2, maxLength: 2, example: 'SP' },
          },
          { name: 'preco_min', in: 'query', schema: { type: 'number', minimum: 0 } },
          { name: 'preco_max', in: 'query', schema: { type: 'number', minimum: 0 } },
          {
            name: 'disponivel',
            in: 'query',
            description: '`true` (padrao) so produtos com estoque; `false` inclui esgotados.',
            schema: { type: 'string', enum: ['true', 'false'], default: 'true' },
          },
          {
            name: 'ordenar',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['recentes', 'baratos', 'caros', 'nome', 'avaliacao'],
              default: 'recentes',
            },
          },
          { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: 'Produtos encontrados.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { type: 'array', items: { $ref: '#/components/schemas/ProdutoPublico' } },
                    paginacao: { $ref: '#/components/schemas/Paginacao' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
        },
      },
      post: {
        tags: ['Produtos'],
        summary: 'Cria produto',
        description:
          'Exige perfil de agricultor ativo. O dono vem do token: `agricultor_id` no corpo e ignorado. A categoria precisa existir e estar ativa.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ProdutoEntrada' } },
          },
        },
        responses: {
          201: {
            description: 'Produto criado.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/ProdutoPublico' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          422: {
            description: 'Conta de agricultor sem perfil de propriedade.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
          },
        },
      },
    },

    '/api/v1/produtos/meus': {
      get: {
        tags: ['Produtos'],
        summary: 'Lista os produtos do proprio agricultor',
        description:
          'Inclui produtos inativos e esgotados, e nao depende de a categoria estar ativa - o dono precisa enxergar o que tirou do ar para poder reativar. Declarada antes de /produtos/{id} para "meus" nao ser lido como id.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'busca', in: 'query', schema: { type: 'string', minLength: 2, maxLength: 100 } },
          { name: 'categoria_id', in: 'query', schema: { type: 'integer' } },
          {
            name: 'situacao',
            in: 'query',
            schema: { type: 'string', enum: ['todos', 'ativos', 'inativos', 'esgotados'], default: 'todos' },
          },
          {
            name: 'ordenar',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['recentes', 'baratos', 'caros', 'nome', 'estoque'],
              default: 'recentes',
            },
          },
          { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: 'Produtos do agricultor autenticado.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { type: 'array', items: { $ref: '#/components/schemas/ProdutoPublico' } },
                    paginacao: { $ref: '#/components/schemas/Paginacao' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
        },
      },
    },

    '/api/v1/produtos/{id}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
      ],
      get: {
        tags: ['Produtos'],
        summary: 'Detalhe publico do produto',
        description:
          'Produto inativo, esgotado, de produtor suspenso ou de categoria desativada devolve 404 - sem distinguir de inexistente.',
        responses: {
          200: {
            description: 'Produto encontrado.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/ProdutoPublico' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
        },
      },
      put: {
        tags: ['Produtos'],
        summary: 'Atualiza produto (substituicao)',
        description:
          'Exige ser o agricultor DONO do produto. Produto de outro produtor devolve 403, e nao 404: quem chama ja e um agricultor autenticado tentando escrever, entao esconder o motivo nao protege nada e atrapalha o suporte.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ProdutoAtualizacao' } },
          },
        },
        responses: {
          200: {
            description: 'Produto atualizado.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/ProdutoPublico' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
        },
      },
      patch: {
        tags: ['Produtos'],
        summary: 'Atualiza produto (parcial)',
        description:
          'Mesmo comportamento do PUT. Campos ausentes permanecem inalterados; um corpo vazio devolve 400.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ProdutoAtualizacao' } },
          },
        },
        responses: {
          200: {
            description: 'Produto atualizado.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/ProdutoPublico' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
        },
      },
      delete: {
        tags: ['Produtos'],
        summary: 'Desativa produto (exclusao logica)',
        description:
          'Nao apaga o registro: `pedido_itens.produto_id` referencia o produto, e apagar perderia o historico de pedidos. Desativar o que ja esta desativado devolve 422, e nao sucesso silencioso.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Produto desativado.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/ProdutoPublico' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
          422: {
            description: 'Produto ja esta desativado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
          },
        },
      },
    },

    '/api/v1/produtos/{id}/disponibilidade': {
      patch: {
        tags: ['Produtos'],
        summary: 'Tira do ar ou recoloca o produto',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ProdutoDisponibilidade' } },
          },
        },
        responses: {
          200: {
            description: 'Disponibilidade alterada.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/ProdutoPublico' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
          422: {
            description: 'O produto ja esta no estado pedido.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
          },
        },
      },
    },

    '/api/v1/produtos/{id}/estoque': {
      patch: {
        tags: ['Produtos'],
        summary: 'Repoe estoque (soma)',
        description:
          'A quantidade e somada ao estoque em uma unica operacao do banco (`estoque = estoque + $1`), para que duas reposicoes simultaneas nao se percam. Produto desativado nao aceita reposicao.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ProdutoEstoque' } },
          },
        },
        responses: {
          200: {
            description: 'Estoque atualizado.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sucesso: { type: 'boolean', example: true },
                    dados: { $ref: '#/components/schemas/ProdutoPublico' },
                  },
                },
              },
            },
          },
          400: { $ref: '#/components/responses/ErroValidacao' },
          401: { $ref: '#/components/responses/NaoAutenticado' },
          403: { $ref: '#/components/responses/SemPermissao' },
          404: { $ref: '#/components/responses/NaoEncontrado' },
          422: {
            description: 'Produto desativado.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } },
          },
        },
      },
    },
  },

  components: { schemas, responses: respostas, securitySchemes: esquemasSeguranca },
};

export default openapi;