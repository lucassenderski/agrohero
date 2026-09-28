import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { File as ArquivoNode } from 'node:buffer';
import * as undici from 'undici';
import Perfil from '../pages/Perfil.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import { RotaPrivada } from '../routes/Guards.jsx';
import Notificacoes from '../components/Notificacoes.jsx';
import { criarProdutorLogado, chamar, removerToken } from './ajudantes.js';

/*
 * Este arquivo precisa de um `fetch` que saiba enviar multipart.
 *
 * O jsdom traz `FormData` e `File` proprios, mas o `fetch` do ambiente
 * nao reconhece o `FormData` dele como corpo multipart: cai no caminho
 * generico e envia a STRING "[object FormData]" com `Content-Type:
 * text/plain`. O servidor responde "nenhum arquivo foi enviado" e o
 * teste acusa a aplicacao por um defeito do ambiente.
 *
 * Por isso trocamos `fetch` e `FormData` pelas pecas do Node (undici),
 * que falam o mesmo protocolo entre si, e `File` pelo `node:buffer`.
 * Isso acontece AQUI, e nao no `configuracao.js` compartilhado, porque
 * os testes rodam em paralelo: trocar o `fetch` de todos os arquivos
 * faz os outros testes - que nao tem nada a ver com upload - passarem a
 * usar o pool de conexoes do undici e falharem de forma intermitente.
 * O ajuste e do ambiente deste teste, entao fica restrito a ele.
 */
globalThis.fetch = undici.fetch;
globalThis.FormData = undici.FormData;
globalThis.File = ArquivoNode;

/*
 * Testes da logo da propriedade.
 *
 * Como nos outros testes de interface deste projeto, nada e mockado: o
 * upload sai para o backend de verdade, passa pelo sharp e grava no
 * banco. E o unico jeito de cobrir o que realmente pode dar errado aqui -
 * o caminho do arquivo ate os bytes (multipart, boundary, campo `logo`).
 * Um mock de fetch aceitaria qualquer coisa e nao pegaria o caso classico
 * de "enviei JSON.stringify(FormData) e virou {}".
 *
 * Os arquivos de teste sao gerados em memoria com `sharp`, pela mesma
 * razao: um PNG de fixture no repositorio nao provaria que o servidor
 * aceita a imagem que o NAVEGADOR produz.
 */

/*
 * PNG 4x4 verde, 94 bytes.
 *
 * Vem em base64 em vez de um arquivo de fixture para nao versionar um
 * binario por causa de um teste - e porque o conteudo exato nao importa:
 * o que se testa e o caminho do arquivo ate os bytes, nao a imagem.
 * Gerado com o `sharp` do backend (que e quem processa do outro lado).
 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWMQ6YmCIwbiOACSIw+hcGDx+QAAAABJRU5ErkJggg==';

function criarPngValido() {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (caractere) => caractere.charCodeAt(0));
  return new File([bytes], 'logo.png', { type: 'image/png' });
}

/* Arquivo que nao e imagem, mas chega com nome e tipo de imagem. */
function criarArquivoFalso() {
  return new File([new TextEncoder().encode('isto nao e uma imagem')], 'falsa.png', {
    type: 'image/png',
  });
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/perfil']}>
      <AuthProvider>
        <NotificacaoProvider>
          <Notificacoes />
          <Routes>
            <Route element={<RotaPrivada />}>
              <Route path="/perfil" element={<Perfil />} />
            </Route>
          </Routes>
        </NotificacaoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/*
 * Le o logo_url do proprio backend - a prova independente da tela.
 *
 * Devolve tambem o id do agricultor, porque a rota publica da imagem e
 * indexada por ELE, e nao pelo id do usuario: os dois numeros vem de
 * tabelas distintas e trocar um pelo outro daria 404 em um teste que
 * parece certo.
 */
async function perfilNoBackend(token) {
  const { dados } = await chamar('/usuarios/profile', { metodo: 'GET', token });
  return {
    logoUrl: dados.agricultor?.logo_url ?? null,
    agricultorId: dados.agricultor?.id ?? null,
  };
}

/*
 * Busca os bytes da logo publica. Confirma que o `logo_url` devolvido
 * nao e so um texto bonito: ele responde imagem de verdade.
 */
async function buscarBytesDaLogo(produtorId) {
  const resposta = await fetch(
    `${import.meta.env.VITE_API_URL}/agricultores/${produtorId}/logo`,
  );
  if (!resposta.ok) return { status: resposta.status, tipo: null, tamanho: 0 };
  const buffer = await resposta.arrayBuffer();
  return {
    status: resposta.status,
    tipo: resposta.headers.get('content-type'),
    tamanho: buffer.byteLength,
  };
}

describe('Logo da propriedade', () => {
  let produtor;

  beforeEach(async () => {
    removerToken();
    produtor = await criarProdutorLogado();
  });

  it('envia a logo e a imagem fica disponivel na rota publica', async () => {
    const usuario = userEvent.setup();
    renderizar();

    const arquivo = criarPngValido();

    // O input de arquivo e escondido, entao `upload` vai direto nele.
    const input = await screen.findByLabelText(/Logo da propriedade/i, {
      selector: 'input[type="file"]',
    });
    await usuario.upload(input, arquivo);

    expect(await screen.findByText(/Logo da propriedade atualizada/i)).toBeInTheDocument();

    // O backend passou a devolver o caminho da logo...
    await waitFor(async () => {
      expect((await perfilNoBackend(produtor.token)).logoUrl).toMatch(
        /\/agricultores\/\d+\/logo$/,
      );
    });

    // ...e o caminho entrega bytes de imagem, nao um 404.
    const { agricultorId } = await perfilNoBackend(produtor.token);
    const imagem = await buscarBytesDaLogo(agricultorId);
    expect(imagem.status).toBe(200);
    expect(imagem.tipo).toMatch(/^image\//);
    expect(imagem.tamanho).toBeGreaterThan(0);
  });

  it('recusa arquivo que nao e imagem com a mensagem do servidor', async () => {
    const usuario = userEvent.setup();
    renderizar();

    const input = await screen.findByLabelText(/Logo da propriedade/i, {
      selector: 'input[type="file"]',
    });
    await usuario.upload(input, criarArquivoFalso());

    /*
     * A mensagem vem do BACKEND, nao do cliente: o arquivo tem mimetype
     * de PNG e passa pela validacao local. So os magic bytes revelam que
     * nao e imagem - e quem le isso e o sharp, no servidor.
     */
    expect(await screen.findByText(/formato|imagem/i)).toBeInTheDocument();

    // E nada foi gravado.
    expect((await perfilNoBackend(produtor.token)).logoUrl).toBeNull();
  });

  it('remove a logo e volta a imagem padrao', async () => {
    const usuario = userEvent.setup();
    renderizar();

    const input = await screen.findByLabelText(/Logo da propriedade/i, {
      selector: 'input[type="file"]',
    });
    await usuario.upload(input, criarPngValido());
    await screen.findByText(/Logo da propriedade atualizada/i);

    await usuario.click(await screen.findByRole('button', { name: /Restaurar padrão/i }));

    expect(await screen.findByText(/Logo removida/i)).toBeInTheDocument();

    const { logoUrl, agricultorId } = await perfilNoBackend(produtor.token);
    expect(logoUrl).toBeNull();

    // Sem logo, a rota publica responde 404 - e o componente cai no padrao.
    const imagem = await buscarBytesDaLogo(agricultorId);
    expect(imagem.status).toBe(404);
  });
});
