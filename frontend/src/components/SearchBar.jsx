import { useEffect, useState } from 'react';

/*
 * Campo de busca.
 *
 * O envio e por formulario (Enter ou botao), e nao a cada tecla: buscar
 * a cada caractere dispararia uma requisicao por letra digitada e a
 * resposta mais lenta poderia chegar depois da mais rapida, mostrando
 * resultado de um termo que o usuario ja abandonou.
 */
export default function SearchBar({ valorInicial = '', aoBuscar, placeholder }) {
  const [termo, setTermo] = useState(valorInicial);

  /* Acompanha mudanca externa (ex.: limpar filtros). */
  useEffect(() => {
    setTermo(valorInicial);
  }, [valorInicial]);

  function enviar(evento) {
    evento.preventDefault();
    aoBuscar(termo.trim());
  }

  return (
    <form className="busca" onSubmit={enviar} role="search">
      <label htmlFor="busca-produtos" className="sr-only">
        Buscar produtos
      </label>
      <input
        id="busca-produtos"
        type="search"
        className="busca__entrada"
        placeholder={placeholder || 'Buscar por produto, produtor ou cidade...'}
        value={termo}
        onChange={(evento) => setTermo(evento.target.value)}
      />
      <button type="submit" className="botao botao--primario">
        Buscar
      </button>
    </form>
  );
}