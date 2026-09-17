import { ESTADOS } from '../utils/estados.js';

/*
 * Campos do endereco de entrega.
 *
 * Extraido do checkout porque a mesma lista de campos e usada em dois
 * lugares: no checkout (primeiro endereco) e na gestao de enderecos do
 * perfil. Manter duas copias significaria corrigir a validacao ou os
 * limites de tamanho em dois arquivos, e esquecer um deles.
 *
 * O componente nao guarda estado: recebe `valores` e `alterar` do
 * formulario de quem o usa. `idPrefixo` evita ids duplicados quando
 * mais de um formulario de endereco estiver montado na mesma tela.
 */
export default function EnderecoFormulario({ valores, alterar, idPrefixo = 'endereco' }) {
  const id = (campo) => `${idPrefixo}-${campo}`;

  return (
    <>
      <div className="campo">
        <label className="campo__rotulo" htmlFor={id('nome_destinatario')}>
          Quem recebe <span className="campo__obrigatorio">*</span>
        </label>
        <input
          id={id('nome_destinatario')}
          className="campo__entrada"
          value={valores.nome_destinatario}
          onChange={(evento) => alterar('nome_destinatario', evento.target.value)}
        />
      </div>

      <div className="campo campo__linha campo__linha--2">
        <div className="campo">
          <label className="campo__rotulo" htmlFor={id('cep')}>
            CEP <span className="campo__obrigatorio">*</span>
          </label>
          <input
            id={id('cep')}
            className="campo__entrada"
            placeholder="13010100"
            inputMode="numeric"
            value={valores.cep}
            onChange={(evento) => alterar('cep', evento.target.value)}
          />
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor={id('bairro')}>
            Bairro <span className="campo__obrigatorio">*</span>
          </label>
          <input
            id={id('bairro')}
            className="campo__entrada"
            value={valores.bairro}
            onChange={(evento) => alterar('bairro', evento.target.value)}
          />
        </div>
      </div>

      <div className="campo campo__linha campo__linha--2">
        <div className="campo">
          <label className="campo__rotulo" htmlFor={id('rua')}>
            Rua <span className="campo__obrigatorio">*</span>
          </label>
          <input
            id={id('rua')}
            className="campo__entrada"
            value={valores.rua}
            onChange={(evento) => alterar('rua', evento.target.value)}
          />
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor={id('numero')}>
            Numero <span className="campo__obrigatorio">*</span>
          </label>
          <input
            id={id('numero')}
            className="campo__entrada"
            value={valores.numero}
            onChange={(evento) => alterar('numero', evento.target.value)}
          />
        </div>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor={id('complemento')}>
          Complemento
        </label>
        <input
          id={id('complemento')}
          className="campo__entrada"
          value={valores.complemento}
          onChange={(evento) => alterar('complemento', evento.target.value)}
        />
      </div>

      <div className="campo campo__linha campo__linha--2">
        <div className="campo">
          <label className="campo__rotulo" htmlFor={id('cidade')}>
            Cidade <span className="campo__obrigatorio">*</span>
          </label>
          <input
            id={id('cidade')}
            className="campo__entrada"
            value={valores.cidade}
            onChange={(evento) => alterar('cidade', evento.target.value)}
          />
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor={id('estado')}>
            Estado <span className="campo__obrigatorio">*</span>
          </label>
          <select
            id={id('estado')}
            className="campo__selecao"
            value={valores.estado}
            onChange={(evento) => alterar('estado', evento.target.value)}
          >
            <option value="">--</option>
            {ESTADOS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}

/* Campos obrigatorios, na mesma ordem em que a validacao e feita. */
export const CAMPOS_OBRIGATORIOS_ENDERECO = [
  'nome_destinatario',
  'cep',
  'rua',
  'numero',
  'bairro',
  'cidade',
  'estado',
];

/* Endereco em branco para um formulario novo. */
export const ENDERECO_VAZIO = {
  nome_destinatario: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
};