import request from 'supertest';
import { z } from 'zod';
import app from '../../src/app.js';
import { encerrarPool } from '../../src/database/pool.js';
import { validarComSchema, formatarErrosZod } from '../../src/utils/validacao.js';
import {
  idParametro,
  email,
  senha,
  preco,
  quantidade,
  estoque,
  nota,
} from '../../src/utils/validacao.js';
import { lerPaginacao, montarPaginacao, validarPaginaExiste } from '../../src/utils/paginacao.js';
import { AppError } from '../../src/utils/AppError.js';

/*
 * Testes da FASE 3: a base que todas as fases seguintes usam.
 *
 * Estes testes sao importantes porque cada modulo (produtos, carrinho,
 * checkout) herda este comportamento. Um bug de validacao aqui apareceria
 * em dez lugares diferentes depois.
 */

afterAll(async () => {
  await encerrarPool();
});

describe('Validacao: normalizacao de entrada', () => {
  it('converte email para minusculas e remove espacos', () => {
    const resultado = validarComSchema(email, '  Joao@Teste.COM  ');
    expect(resultado).toBe('joao@teste.com');
  });

  it('recusa email invalido com mensagem util', () => {
    try {
      validarComSchema(email, 'nao-e-email');
      throw new Error('Deveria ter falhado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(AppError);
      expect(erro.statusCode).toBe(400);
      expect(erro.codigo).toBe('DADOS_INVALIDOS');
      expect(erro.detalhes[0].campo).toBe('corpo');
      expect(erro.detalhes[0].mensagem).toMatch(/e-mail valido/i);
    }
  });

  it('converte preco de string para numero', () => {
    // Query string sempre chega como texto; o z.coerce resolve isso.
    expect(validarComSchema(preco, '8.50')).toBe(8.5);
    expect(validarComSchema(preco, '20')).toBe(20);
  });

  it('recusa preco com mais de 2 casas decimais', () => {
    // 8.999 viraria 9.00 no NUMERIC(10,2) e o total do pedido nao
    // fecharia. Melhor recusar do que gravar um valor diferente do
    // que o usuario informou.
    expect(() => validarComSchema(preco, '8.999')).toThrow(AppError);
  });

  it('recusa preco zero ou negativo', () => {
    expect(() => validarComSchema(preco, 0)).toThrow(AppError);
    expect(() => validarComSchema(preco, -5)).toThrow(AppError);
  });

  it('recusa quantidade decimal', () => {
    expect(() => validarComSchema(quantidade, 1.5)).toThrow(AppError);
  });

  it('recusa quantidade zero ou negativa', () => {
    expect(() => validarComSchema(quantidade, 0)).toThrow(AppError);
    expect(() => validarComSchema(quantidade, -3)).toThrow(AppError);
  });

  it('aceita estoque zero mas recusa negativo', () => {
    expect(validarComSchema(estoque, 0)).toBe(0);
    expect(() => validarComSchema(estoque, -1)).toThrow(AppError);
  });

  it('recusa nota fora de 1 a 5', () => {
    expect(validarComSchema(nota, 5)).toBe(5);
    expect(() => validarComSchema(nota, 0)).toThrow(AppError);
    expect(() => validarComSchema(nota, 6)).toThrow(AppError);
  });

  it('recusa id que nao e numero positivo', () => {
    expect(validarComSchema(idParametro, '42')).toBe(42);
    expect(() => validarComSchema(idParametro, 'abc')).toThrow(AppError);
    expect(() => validarComSchema(idParametro, '-1')).toThrow(AppError);
    expect(() => validarComSchema(idParametro, '0')).toThrow(AppError);
  });
});

describe('Validacao: senha', () => {
  it('aceita senha que atende aos requisitos', () => {
    expect(validarComSchema(senha, 'colheita2026')).toBe('colheita2026');
  });

  it('recusa senha curta', () => {
    expect(() => validarComSchema(senha, 'abc123')).toThrow(AppError);
  });

  it('recusa senha sem numero', () => {
    expect(() => validarComSchema(senha, 'somenteletras')).toThrow(AppError);
  });

  it('recusa senha sem letra', () => {
    expect(() => validarComSchema(senha, '12345678')).toThrow(AppError);
  });
});

describe('Validacao: mass assignment', () => {
  it('remove campos nao declarados no schema', () => {
    // Este e o teste que fecha a porta para escalacao de privilegio:
    // mesmo enviando "tipo: administrador", o campo nao sobrevive a
    // validacao e nunca chega ao controller.
    const schema = z.object({ nome: z.string(), email: z.string() });
    const resultado = validarComSchema(schema, {
      nome: 'Ana',
      email: 'ana@teste.com',
      tipo: 'administrador',
      ativo: true,
    });

    expect(resultado).toEqual({ nome: 'Ana', email: 'ana@teste.com' });
    expect(resultado.tipo).toBeUndefined();
    expect(resultado.ativo).toBeUndefined();
  });
});

describe('Validacao: formato dos erros para o frontend', () => {
  it('devolve a lista de campos com problema', () => {
    const schema = z.object({
      nome: z.string().min(3, 'O nome e curto demais.'),
      email: z.string().email('E-mail invalido.'),
    });

    const resultado = schema.safeParse({ nome: 'A', email: 'x' });
    const erros = formatarErrosZod(resultado.error);

    expect(erros).toHaveLength(2);
    expect(erros.map((e) => e.campo).sort()).toEqual(['email', 'nome']);
    erros.forEach((erro) => {
      expect(typeof erro.campo).toBe('string');
      expect(typeof erro.mensagem).toBe('string');
    });
  });

  it('identifica o campo em objeto aninhado', () => {
    const schema = z.object({
      itens: z.array(z.object({ quantidade: z.number().positive('Quantidade invalida.') })),
    });

    const resultado = schema.safeParse({ itens: [{ quantidade: 1 }, { quantidade: -1 }] });
    const erros = formatarErrosZod(resultado.error);

    expect(erros[0].campo).toBe('itens.1.quantidade');
  });
});

describe('Paginacao', () => {
  it('usa valores padrao quando nada e informado', () => {
    expect(lerPaginacao({})).toEqual({ pagina: 1, limite: 20, offset: 0 });
  });

  it('calcula o offset corretamente', () => {
    expect(lerPaginacao({ pagina: '3', limite: '10' })).toEqual({
      pagina: 3,
      limite: 10,
      offset: 20,
    });
  });

  it('limita o teto do limite, ignorando o pedido do cliente', () => {
    // GET /produtos?limite=999999 nao pode derrubar a API.
    const resultado = lerPaginacao({ limite: '999999' });
    expect(resultado.limite).toBe(100);
  });

  it('ignora valores invalidos sem quebrar', () => {
    expect(lerPaginacao({ pagina: 'abc', limite: 'xyz' })).toEqual({
      pagina: 1,
      limite: 20,
      offset: 0,
    });
    expect(lerPaginacao({ pagina: '-5' }).pagina).toBe(1);
  });

  it('monta o bloco de paginacao da resposta', () => {
    expect(montarPaginacao({ pagina: 2, limite: 20, total: 137 })).toEqual({
      pagina: 2,
      limite: 20,
      total: 137,
      paginas: 7,
      temAnterior: true,
      temProxima: true,
    });
  });

  it('marca a ultima pagina corretamente', () => {
    const paginacao = montarPaginacao({ pagina: 7, limite: 20, total: 137 });
    expect(paginacao.temProxima).toBe(false);
    expect(paginacao.temAnterior).toBe(true);
  });

  it('trata lista vazia sem divisao por zero', () => {
    const paginacao = montarPaginacao({ pagina: 1, limite: 20, total: 0 });
    expect(paginacao.paginas).toBe(1);
    expect(paginacao.temProxima).toBe(false);
  });

  it('recusa pagina inexistente com erro claro', () => {
    // Melhor um 404 explicito do que uma lista vazia que faria o
    // usuario achar que o marketplace nao tem produtos.
    expect(() => validarPaginaExiste({ pagina: 99, paginas: 3, total: 50 })).toThrow(AppError);
  });

  it('nao reclama quando nao ha registros', () => {
    expect(() => validarPaginaExiste({ pagina: 1, paginas: 1, total: 0 })).not.toThrow();
  });
});

describe('Documentacao da API', () => {
  it('serve a interface do Swagger UI', async () => {
    const resposta = await request(app).get('/api/v1/docs/');
    expect(resposta.status).toBe(200);
    expect(resposta.text).toMatch(/swagger/i);
  });

  it('serve a especificacao OpenAPI em JSON', async () => {
    const resposta = await request(app).get('/api/v1/docs/openapi.json');

    expect(resposta.status).toBe(200);
    expect(resposta.body.openapi).toBe('3.0.3');
    expect(resposta.body.info.title).toBe('AgroHero API');
    expect(resposta.body.info.version).toBe('1.0.0');
  });

  it('documenta apenas endpoints que existem de verdade', async () => {
    const resposta = await request(app).get('/api/v1/docs/openapi.json');
    const caminhos = resposta.body.paths;

    /*
     * Verifica METODO + CAMINHO, nao apenas o caminho.
     *
     * A versao anterior fazia GET em todo caminho documentado. Isso
     * funcionava enquanto so existia /health (GET). Quando entraram
     * rotas POST (login) e PUT (trocar senha), o teste passou a falhar
     * por um motivo falso: GET /api/v1/auth/login devolve 404 porque o
     * METODO nao existe ali, e nao porque a rota seja ficticia.
     *
     * A intencao do teste e pegar rota documentada que nao existe (o
     * "Try it out" devolveria 404 e a documentacao mentiria). Para isso,
     * temos que reproduzir o mesmo metodo que o cliente usaria.
     */
    const metodos = ['get', 'post', 'put', 'patch', 'delete'];

    for (const [caminho, operacoes] of Object.entries(caminhos)) {
      for (const metodo of metodos) {
        if (!operacoes[metodo]) continue;

        const chamada = request(app)[metodo](caminho);

        // Rota protegida sem token responde 401; rota com corpo
        // obrigatorio responde 400. Ambos provam que a rota EXISTE - o
        // que nao pode acontecer e 404.
        if (metodo !== 'get') {
          chamada.send({});
        }

        const respostaRota = await chamada;

        // 404 significaria rota ficticia. 400/401/403 provam que existe.
        expect(respostaRota.status).not.toBe(404);
      }
    }
  });

  it('toda operacao documentada tem summary e respostas declaradas', async () => {
    // Documentacao pela metade (operacao sem descricao ou sem respostas)
    // e pior que ausente: parece completa e nao e.
    const resposta = await request(app).get('/api/v1/docs/openapi.json');
    const metodos = ['get', 'post', 'put', 'patch', 'delete'];

    for (const [caminho, operacoes] of Object.entries(resposta.body.paths)) {
      for (const metodo of metodos) {
        if (!operacoes[metodo]) continue;

        expect(operacoes[metodo].summary).toBeTruthy();
        expect(Object.keys(operacoes[metodo].responses).length).toBeGreaterThan(0);
      }
    }
  });

  it('todas as referencias do OpenAPI resolvem para componentes existentes', async () => {
    // Uma $ref quebrada faz o Swagger UI renderizar "Could not resolve
    // reference" no lugar do schema, e o Try it out perde o exemplo.
    const resposta = await request(app).get('/api/v1/docs/openapi.json');
    const { schemas, responses } = resposta.body.components;

    const referencias = [...JSON.stringify(resposta.body).matchAll(/"#\/components\/(schemas|responses)\/(\w+)"/g)];

    expect(referencias.length).toBeGreaterThan(0);

    for (const [, tipo, nome] of referencias) {
      const alvo = tipo === 'schemas' ? schemas : responses;
      expect(Object.keys(alvo)).toContain(nome);
    }
  });

  it('inclui os schemas de erro e paginacao reutilizaveis', async () => {
    const resposta = await request(app).get('/api/v1/docs/openapi.json');
    const { schemas } = resposta.body.components;

    expect(schemas.Erro).toBeDefined();
    expect(schemas.Paginacao).toBeDefined();
    expect(schemas.Saude).toBeDefined();
  });
});