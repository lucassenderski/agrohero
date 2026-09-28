import './Footer.css';
import SaudeRodape from './SaudeRodape.jsx';

export default function Footer() {
  const ano = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer__interno">
        <div className="footer__marca">
          <strong>Agro Hero</strong>
          <span>TOLEDO - PR</span>
          <p>Conectando agricultores familiares e consumidores de orgânicos com carinho.</p>
        </div>
        <div>
          <h2>Navegação</h2>
          <a href="/produtos">Marketplace de orgânicos</a>
          <a href="/categorias">Categorias</a>
          <a href="/agricultores">Agricultores familiares</a>
        </div>
        <div>
          <h2>Segurança & deploy</h2>
          <span>Cadastro seguro & LGPD</span>
          <span>Pagamento na retirada: PIX, cartao ou dinheiro</span>
          <span>© {ano} Agro Hero</span>
        </div>
      </div>
      <div className="container footer__base">
        <SaudeRodape />
        <span className="footer__credito">
          Criado por Lucas Senderski · RU: 4758862
        </span>
      </div>
    </footer>
  );
}