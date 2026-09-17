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
  },

  components: { schemas, responses: respostas, securitySchemes: esquemasSeguranca },
};

export default openapi;