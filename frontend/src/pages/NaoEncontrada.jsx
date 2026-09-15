import { Link } from 'react-router-dom';
import './NaoEncontrada.css';

/* Pagina 404. */
export default function NaoEncontrada() {
  return (
    <div className="container nao-encontrada">
      <h1 className="nao-encontrada__codigo">404</h1>
      <h2>Pagina nao encontrada</h2>
      <p className="nao-encontrada__texto">
        O endereco que voce tentou abrir nao existe ou foi movido.
      </p>
      <Link to="/" className="nao-encontrada__link">
        Voltar para a pagina inicial
      </Link>
    </div>
  );
}