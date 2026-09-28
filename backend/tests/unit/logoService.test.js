import sharp from 'sharp';
import {
  processarLogo,
  LIMITE_ENTRADA_BYTES,
} from '../../src/services/logoService.js';

/*
 * Testes do processador de logo.
 *
 * Aqui mora o limite de tamanho: o processador e o unico ponto que
 * transforma um arquivo enviado pelo usuario em bytes que vao para o
 * banco. Os testes cobrem tanto o caminho feliz quanto as recusas, porque
 * a recusa e o que protege o recurso escasso (o banco do Neon).
 */

/* Imagem sintetica "fotografica": ruido, que nao comprime de graca. */
async function imagemRuido(largura, altura, formato = 'jpeg') {
  const raw = Buffer.alloc(largura * altura * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) % 256;

  const pipeline = sharp(raw, {
    raw: { width: largura, height: altura, channels: 3 },
  });

  return formato === 'png' ? pipeline.png().toBuffer() : pipeline.jpeg({ quality: 92 }).toBuffer();
}

/* Imagem de cor unica: previsivel, para checar dimensoes. */
async function imagemLisa(largura, altura, formato = 'png') {
  const pipeline = sharp({
    create: {
      width: largura,
      height: altura,
      channels: 3,
      background: { r: 7, g: 156, b: 104 },
    },
  });

  return formato === 'png' ? pipeline.png().toBuffer() : pipeline.jpeg().toBuffer();
}

describe('processarLogo', () => {
  test('converte uma foto grande para WebP dentro do alvo', async () => {
    const original = await imagemRuido(2400, 1800);

    // Sanidade: a entrada precisa ser grande o bastante para o teste valer.
    expect(original.length).toBeGreaterThan(200 * 1024);

    const { bytes, mime } = await processarLogo(original);

    expect(mime).toBe('image/webp');
    expect(bytes.length).toBeLessThanOrEqual(200 * 1024);

    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe('webp');
    // Reamostrada para o lado maximo, mesmo vindo de 2400px.
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(800);
  });

  test('reduz drasticamente o arquivo (o ponto da feature)', async () => {
    const original = await imagemRuido(2400, 1800);
    const { bytes } = await processarLogo(original);

    // 2400x1800 de ruido passa de 1 MB; a saida fica na casa das centenas
    // de KB. Exigimos ao menos 80% de reducao, com folga sobre o medido.
    expect(bytes.length).toBeLessThan(original.length * 0.2);
  });

  test('aceita PNG e confirma o formato pelos BYTES, nao pela extensao', async () => {
    const png = await imagemLisa(600, 600, 'png');

    // O nome do arquivo nunca chega aqui: so o buffer. Este teste trava a
    // garantia de que a deteccao e por magic bytes.
    const resultado = await processarLogo(png);

    expect(resultado.formatoEntrada).toBe('png');
    expect(resultado.mime).toBe('image/webp');
  });

  test('aplica recorte quadrado (cover) mantendo o lado pedido', async () => {
    // 1200x400: sem cover, a saida teria proporcao 3:1.
    const larga = await imagemLisa(1200, 400, 'png');

    const { bytes } = await processarLogo(larga);
    const meta = await sharp(bytes).metadata();

    expect(meta.width).toBe(meta.height);
    expect(meta.width).toBeLessThanOrEqual(800);
  });

  test('nao amplia imagem menor que o lado maximo', async () => {
    const pequena = await imagemLisa(300, 200, 'png');

    const { bytes } = await processarLogo(pequena);
    const meta = await sharp(bytes).metadata();

    // `withoutEnlargement`: 300px continua 300px, sem borrar por upscale.
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(300);
  });

  test('recusa arquivo acima do limite de entrada', async () => {
    const gigante = Buffer.alloc(LIMITE_ENTRADA_BYTES + 1, 7);

    await expect(processarLogo(gigante)).rejects.toMatchObject({
      codigo: 'LOGO_MUITO_GRANDE',
    });
  });

  test('a mensagem do limite diz o tamanho recebido (acionavel)', async () => {
    const gigante = Buffer.alloc(6 * 1024 * 1024, 7);

    // O usuario quase sempre mandou uma foto de celular; a mensagem
    // precisa dizer o que houve para ele resolver sozinho.
    await expect(processarLogo(gigante)).rejects.toThrow(/6\.0 MB/);
    await expect(processarLogo(gigante)).rejects.toThrow(/5 MB/);
  });

  test('recusa arquivo que nao e imagem', async () => {
    const texto = Buffer.from('isto nao e uma imagem, apenas texto puro');

    await expect(processarLogo(texto)).rejects.toMatchObject({
      codigo: 'LOGO_FORMATO_INVALIDO',
    });
  });

  test('recusa formato fora da lista branca (GIF)', async () => {
    // Cabecalho GIF89a valido, seguido de bytes quaisquer.
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64)]);

    await expect(processarLogo(gif)).rejects.toMatchObject({
      codigo: 'LOGO_FORMATO_INVALIDO',
    });
  });

  test('recusa buffer vazio ou ausente', async () => {
    await expect(processarLogo(Buffer.alloc(0))).rejects.toMatchObject({
      codigo: 'DADOS_INVALIDOS',
    });
    await expect(processarLogo(undefined)).rejects.toMatchObject({
      codigo: 'DADOS_INVALIDOS',
    });
  });

  test('recusa imagem truncada com magic bytes validos', async () => {
    const valida = await imagemRuido(400, 400);
    // Corta no meio: o cabecalho JPEG continua la, o resto nao.
    const truncada = valida.subarray(0, 40);

    await expect(processarLogo(truncada)).rejects.toMatchObject({
      codigo: 'LOGO_ILEGIVEL',
    });
  });

  test('o resultado sempre cabe no teto do banco (512 KB)', async () => {
    // O pior caso: ruido puro, que e incompressivel.
    const original = await imagemRuido(4000, 3000);

    const { bytes } = await processarLogo(
      // 4000x3000 de ruido passa de 5 MB e seria recusado antes; usamos
      // 2000x1500 para exercitar o caminho de compressao maxima.
      await imagemRuido(2000, 1500),
    );

    expect(original).toBeDefined();
    // A constraint `agricultores_logo_tamanho` recusaria acima disso.
    expect(bytes.length).toBeLessThanOrEqual(512 * 1024);
  });
});
