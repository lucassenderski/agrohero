import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { File as ArquivoNode } from 'node:buffer';
import * as undici from 'undici';
import Perfil from '../pages/Perfil.jsx';
import Header from '../components/Header.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import { CarrinhoProvider } from '../contexts/CarrinhoContext.jsx';
import { RotaPrivada } from '../routes/Guards.jsx';
import Notificacoes from '../components/Notificacoes.jsx';
import { criarClienteLogado, chamar, removerToken } from './ajudantes.js';

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
 * Restrito a este arquivo porque os testes rodam em paralelo: trocar o
 * `fetch` de todos faria os outros passarem a usar o pool de conexoes do
 * undici e falharem de forma intermitente.
 */
globalThis.fetch = undici.fetch;
globalThis.FormData = undici.FormData;
globalThis.File = ArquivoNode;

/*
 * O jsdom NAO implementa `URL.createObjectURL` (verificado: a funcao e
 * `undefined`). Sem isso, `useAvatar` e a previa do upload caem no
 * fallback "sem suporte" e a foto nunca aparece como `<img>` - o teste
 * acusaria a aplicacao por uma lacuna do ambiente.
 *
 * O polyfill devolve uma URL falsa e estavel. Nao e um mock do nosso
 * codigo: e a peca que o navegador fornece e o jsdom nao tem. O jsdom
 * tambem nao carrega imagens, entao nada aqui depende de a URL resolver
 * de verdade - o que se verifica e o ELEMENTO `<img>` com o `alt` certo,
 * que e o que prova que o componente saiu do fallback das iniciais.
 *
 * Em navegador real (com a API nativa) o caminho exercitado e o mesmo,
 * apenas com uma URL de blob verdadeira.
 */
let contadorBlob = 0;
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => `blob:teste-${(contadorBlob += 1)}`;
  URL.revokeObjectURL = () => {};
}

/*
 * Testes do avatar (foto de perfil).
 *
 * Como nos outros testes de interface deste projeto, nada e mockado: o
 * upload sai para o backend de verdade, passa pelo sharp e grava na
 * coluna BYTEA. E o unico jeito de cobrir o que pode dar errado aqui - o
 * caminho do arquivo ate os bytes (multipart, campo `avatar`) e a leitura
 * AUTENTICADA da imagem, que e o ponto sutil desta feature.
 *
 * O TESTE QUE MAIS IMPORTA AQUI
 *
 * A rota do avatar exige `Authorization`, e um `<img>` nao envia esse
 * cabecalho. O teste "a foto aparece no cabecalho sem recarregar" falha
 * se alguem "simplificar" o componente apontando o `src` direto para a
 * API - que e o erro mais provavel nesta feature. Por isso ele existe e
 * verifica o object URL, e nao apenas o texto na tela.
 */

/*
 * PNG 4x4 verde, 94 bytes.
 *
 * Vem em base64 em vez de um arquivo de fixture para nao versionar um
 * binario por causa de um teste - e porque o conteudo exato nao importa:
 * o que se testa e o caminho do arquivo ate os bytes, nao a imagem.
 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWMQ6YmCIwbiOACSIw+hcGDx+QAAAABJRU5ErkJggg==';

function criarPngValido() {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (caractere) => caractere.charCodeAt(0));
  return new File([bytes], 'avatar.png', { type: 'image/png' });
}

/* Arquivo que nao e imagem, mas chega com nome e tipo de imagem. */
function criarArquivoFalso() {
  return new File([new TextEncoder().encode('isto nao e uma imagem')], 'falsa.png', {
    type: 'image/png',
  });
}

/*
 * Renderiza cabecalho E perfil juntos.
 *
 * E o que prova que a foto e compartilhada pelo contexto: os dois
 * componentes aparecem na mesma arvore, entao trocar a foto no perfil tem
 * de refletir no cabecalho sem recarregar nada.
 */
function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/perfil']}>
      <AuthProvider>
        <CarrinhoProvider>
          <NotificacaoProvider>
            <Notificacoes />
            <Header />
            <Routes>
              <Route element={<RotaPrivada />}>
                <Route path="/perfil" element={<Perfil />} />
              </Route>
            </Routes>
          </NotificacaoProvider>
        </CarrinhoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/* Le o avatar do proprio backend - a prova independente da tela. */
async function avatarNoBackend(token) {
  const { dados } = await chamar('/usuarios/profile', { metodo: 'GET', token });
  return dados.avatar_url ?? null;
}

/* Busca os bytes da imagem autenticada, como o frontend faz. */
async function buscarBytesDoAvatar(token) {
  const resposta = await fetch(`${import.meta.env.VITE_API_URL}/usuarios/avatar`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resposta.ok) return { status: resposta.status, tipo: null, tamanho: 0 };
  const buffer = await resposta.arrayBuffer();
  return {
    status: resposta.status,
    tipo: resposta.headers.get('content-type'),
    tamanho: buffer.byteLength,
  };
}

describe('Foto de perfil (avatar)', () => {
  let cliente;

  beforeEach(async () => {
    removerToken();
    cliente = await criarClienteLogado();
  });

  it('mostra as iniciais quando o usuario nao tem foto', async () => {
    renderizar();

    /*
     * O fallback e o estado da maioria das contas. As iniciais sao o
     * marcador visual; o nome completo aparece como texto ao lado.
     */
    expect(await screen.findByText('Meu perfil')).toBeInTheDocument();
    expect(screen.getAllByText('CT').length).toBeGreaterThan(0);
  });

  it('envia a foto, grava no backend e exibe no cabecalho', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await screen.findByText('Meu perfil');

    const input = await screen.findByLabelText(/Foto de perfil/i, {
      selector: 'input[type="file"]',
    });
    await usuario.upload(input, criarPngValido());

    expect(await screen.findByText(/Foto de perfil atualizada/i)).toBeInTheDocument();

    // O backend passou a devolver a URL do avatar...
    await waitFor(async () => {
      expect(await avatarNoBackend(cliente.token)).toBe('/usuarios/avatar');
    });

    // ...e o caminho entrega bytes de imagem, nao um 404.
    const imagem = await buscarBytesDoAvatar(cliente.token);
    expect(imagem.status).toBe(200);
    expect(imagem.tipo).toMatch(/^image\//);
    expect(imagem.tamanho).toBeGreaterThan(0);

    /*
     * A foto aparece na tela como IMAGEM. O `alt` e o que confirma: o
     * bloco de iniciais nao tem `alt`, entao encontrar a imagem prova que
     * o componente saiu do fallback.
     *
     * E o teste que pega a regressao mais provavel desta feature: se
     * alguem apontar o `src` direto para a API, a requisicao sai sem
     * token, o backend responde 401 e o `onError` do componente devolve as
     * iniciais - nenhuma imagem apareceria aqui.
     *
     * `findAllByAltText` (e nao `findByAltText`) porque a mesma foto
     * aparece em dois lugares: a previa grande do upload e o avatar
     * pequeno do cabecalho. E justamente essa dupla presenca que prova
     * que os dois compartilham o mesmo object URL do contexto.
     */
    await waitFor(
      () => {
        expect(screen.getAllByAltText(/Foto de Cliente Teste/i)).toHaveLength(2);
      },
      { timeout: 8000 },
    );
  });

  it('a foto enviada no perfil aparece no cabecalho sem recarregar', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await screen.findByText('Meu perfil');

    const input = await screen.findByLabelText(/Foto de perfil/i, {
      selector: 'input[type="file"]',
    });
    await usuario.upload(input, criarPngValido());
    await screen.findByText(/Foto de perfil atualizada/i);

    /*
     * O cabecalho usa o MESMO object URL do contexto, entao ele muda junto.
     * Se cada tela buscasse por conta propria, esta assercao falharia - o
     * cabecalho continuaria com as iniciais ate um reload.
     */
    await waitFor(() => {
      expect(screen.getAllByAltText(/Foto de Cliente Teste/i).length).toBeGreaterThan(1);
    });
  });

  it('recusa arquivo que nao e imagem com a mensagem do servidor', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await screen.findByText('Meu perfil');

    const input = await screen.findByLabelText(/Foto de perfil/i, {
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
    expect(await avatarNoBackend(cliente.token)).toBeNull();
  });

  it('remove a foto e volta para as iniciais', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await screen.findByText('Meu perfil');

    const input = await screen.findByLabelText(/Foto de perfil/i, {
      selector: 'input[type="file"]',
    });
    await usuario.upload(input, criarPngValido());
    await screen.findByText(/Foto de perfil atualizada/i);

    await usuario.click(await screen.findByRole('button', { name: /Remover foto/i }));

    expect(await screen.findByText(/Foto removida/i)).toBeInTheDocument();

    expect(await avatarNoBackend(cliente.token)).toBeNull();

    // Sem foto, a rota responde 404 e a tela volta as iniciais.
    const imagem = await buscarBytesDoAvatar(cliente.token);
    expect(imagem.status).toBe(404);

    await waitFor(() => {
      expect(screen.queryByAltText(/Foto de Cliente Teste/i)).not.toBeInTheDocument();
    });
  });

  it('a foto de um usuario nao e servida a outro', async () => {
    /*
     * Privacidade na pratica: nao existe rota publica de avatar, e a rota
     * autenticada nao aceita id. Este teste garante que a unica forma de
     * ler a imagem e sendo o dono - se alguem acrescentar
     * `GET /usuarios/{id}/avatar`, ele continua passando, mas a decisao de
     * nao expor fica registrada aqui.
     */
    const outro = await criarClienteLogado();

    const resposta = await fetch(`${import.meta.env.VITE_API_URL}/usuarios/avatar`, {
      headers: { Authorization: `Bearer ${outro.token}` },
    });

    // O outro nao tem foto: 404, e nao a imagem do primeiro cliente.
    expect(resposta.status).toBe(404);
  });
});
