import { useRef, useState } from 'react';
import { enviarAvatar, removerAvatar } from '../services/avatar.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import { MensagemErro } from './ui.jsx';
import Avatar from './Avatar.jsx';
import './avatar.css';

/*
 * Upload da foto de perfil (qualquer conta autenticada).
 *
 * QUEM SABE SE HA FOTO E O CONTEXTO, NAO ESTE COMPONENTE
 *
 * `avatarUrl` vem do AuthContext, que e quem busca a imagem uma unica vez
 * para o cabecalho e o perfil (ver a nota la). Este componente so decide
 * quando enviar, remover e exibir a previa local - nao guarda uma copia do
 * estado "tem foto", que poderia divergir do resto da tela.
 *
 * POR QUE VALIDAR NO CLIENTE SE O SERVIDOR JA VALIDA
 *
 * Nao e para substituir a validacao do servidor - ela continua sendo a
 * unica que decide (o cliente pode ser contornado). E para o usuario nao
 * pagar o custo de descobrir o erro pelo caminho longo: sem isto, quem
 * escolhesse uma foto de 12 MB enviaria 12 MB pela rede de celular do
 * sitio para receber um "muito grande" no fim. A checagem aqui evita o
 * envio inutil; a do servidor continua valendo para quem ignorar esta.
 *
 * Os limites abaixo espelham o backend (5 MB, JPEG/PNG/WebP). Se mudarem
 * la, precisam mudar aqui tambem - e por isso estao em constantes nomeadas
 * em vez de numeros soltos no meio do JSX.
 */

const TAMANHO_MAXIMO_MB = 5;
const TAMANHO_MAXIMO_BYTES = TAMANHO_MAXIMO_MB * 1024 * 1024;
const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'];

export default function UploadAvatar({ nome }) {
  const { avatarUrl, recarregarAvatar } = useAuth();
  const { sucesso } = useNotificacao();
  const inputRef = useRef(null);

  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState(null);

  /*
   * `prevista` guarda a URL da imagem escolhida, ainda nao enviada.
   *
   * Sem isto, a previa so apareceria depois do upload terminar - e o
   * usuario ficaria olhando as iniciais sem saber se a escolha funcionou.
   * Com `URL.createObjectURL`, a imagem aparece no instante da escolha.
   */
  const [prevista, setPrevista] = useState(null);

  function limparPrevista() {
    if (prevista) {
      // Sem revogar, o blob fica na memoria da aba ate o reload.
      URL.revokeObjectURL?.(prevista);
      setPrevista(null);
    }
  }

  /*
   * A previa local e um extra, nao o upload.
   *
   * `createObjectURL` nao existe em todo ambiente que executa este
   * componente (jsdom nos testes, navegadores antigos). Deixar a chamada
   * estourar derrubaria o envio inteiro - o usuario perderia o upload por
   * causa da miniatura. Sem suporte, o envio segue e a imagem so aparece
   * depois que o servidor responder.
   */
  function criarPrevista(arquivo) {
    if (typeof URL.createObjectURL !== 'function') return null;
    return URL.createObjectURL(arquivo);
  }

  function validar(arquivo) {
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      return 'Formato não aceito. Envie uma imagem JPG, PNG ou WebP.';
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      const mb = (arquivo.size / 1024 / 1024).toFixed(1);
      return `A imagem tem ${mb} MB e o limite é ${TAMANHO_MAXIMO_MB} MB. Reduza a imagem e tente novamente.`;
    }
    return null;
  }

  async function escolher(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    setErro(null);

    const problema = validar(arquivo);
    if (problema) {
      setErro(new Error(problema));
      // Limpa o input: sem isto, escolher o MESMO arquivo de novo nao
      // dispara `change` (o valor nao mudou) e o usuario fica sem reacao.
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    limparPrevista();
    setPrevista(criarPrevista(arquivo));
    setEnviando(true);

    try {
      await enviarAvatar(arquivo);
      sucesso('Foto de perfil atualizada!');
      // O contexto refaz a busca e o cabecalho passa a exibir a foto nova.
      recarregarAvatar();
      limparPrevista();
    } catch (falha) {
      // O servidor pode recusar por um motivo que o cliente nao previu
      // (imagem corrompida, por exemplo). A mensagem dele e mais
      // especifica que qualquer texto generico daqui.
      setErro(falha);
      limparPrevista();
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remover() {
    setErro(null);
    setRemovendo(true);
    try {
      await removerAvatar();
      sucesso('Foto removida. Voltamos a exibir suas iniciais.');
      limparPrevista();
      recarregarAvatar();
    } catch (falha) {
      setErro(falha);
    } finally {
      setRemovendo(false);
    }
  }

  const ocupado = enviando || removendo;
  const urlExibida = prevista || avatarUrl;

  return (
    <div className="campo avatar-upload">
      {/*
       * <label> de verdade, com htmlFor apontando para o input - e nao um
       * <span>. E o que associa o texto ao campo: sem isso, clicar no
       * rotulo nao abre o seletor de arquivos e leitores de tela anunciam
       * um campo sem nome. O input esta visualmente escondido (mas
       * presente), entao o rotulo e a unica forma de identifica-lo.
       */}
      <label className="campo__rotulo" htmlFor="avatar_usuario">
        Foto de perfil
      </label>

      <div className="avatar-upload__conteudo">
        <Avatar nome={nome} url={urlExibida} tamanho="lg" />

        <div className="avatar-upload__acoes">
          <p className="campo__dica">
            Uma foto sua para identificar a conta. JPG, PNG ou WebP, até{' '}
            {TAMANHO_MAXIMO_MB} MB. Sem foto, mostramos suas iniciais.
          </p>

          {/*
           * O input fica escondido e e acionado pelo botao: um
           * <input type="file"> cru tem aparencia que varia por navegador
           * e nao aceita o estilo do projeto.
           *
           * `accept` filtra o seletor de arquivos, mas nao e validacao -
           * o usuario pode trocar para "todos os arquivos". Por isso
           * `validar` roda de novo no `change`.
           */}
          <input
            ref={inputRef}
            id="avatar_usuario"
            className="avatar-upload__input"
            type="file"
            accept={TIPOS_ACEITOS.join(',')}
            onChange={escolher}
            disabled={ocupado}
          />

          <div className="avatar-upload__botoes">
            {/*
             * Um <button> de verdade, e nao um <label> estilizado como
             * botao. A diferenca nao e cosmetica: um <label> nao recebe
             * foco pelo Tab e nao responde a Enter/Espaco, entao quem
             * navega por teclado ficaria sem conseguir enviar a foto. O
             * button aciona o input escondido pelo ref.
             */}
            <button
              type="button"
              className="botao botao--secundario"
              onClick={() => inputRef.current?.click()}
              disabled={ocupado}
            >
              {enviando ? 'Enviando...' : avatarUrl ? 'Trocar foto' : 'Enviar foto'}
            </button>

            {avatarUrl && (
              <button
                type="button"
                className="botao botao--perigo"
                onClick={remover}
                disabled={ocupado}
              >
                {removendo ? 'Removendo...' : 'Remover foto'}
              </button>
            )}
          </div>
        </div>
      </div>

      {erro && <MensagemErro erro={erro} />}
    </div>
  );
}
