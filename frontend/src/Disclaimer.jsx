import { useEffect, useState } from "react";

// Aviso (disclaimer) exibido na primeira visita; o usuário precisa aceitar.
// A escolha fica guardada no navegador (localStorage) para não repetir.
const KEY = "divinatio_disclaimer_v1";

export default function Disclaimer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      /* sem localStorage — segue assim mesmo */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="disclaimer-overlay">
      <div className="disclaimer-card">
        <h2>
          <span className="orb">🔮</span> Antes de entrar
        </h2>
        <div className="disclaimer-body">
          <p>
            O <strong>DIVINATIO</strong> é uma plataforma de <strong>mercados de
            previsão peer-to-peer</strong>: você aposta contra <strong>outros
            usuários</strong>, nunca contra a plataforma. O DIVINATIO atua apenas
            como <strong>intermediador</strong> — não é uma casa de apostas e não
            é contraparte de nenhuma posição.
          </p>
          <ul>
            <li>
              ⚠️ <strong>Estágio inicial (beta).</strong> O contrato inteligente
              <strong> não passou por auditoria de segurança independente</strong> e
              pode conter falhas. Use por sua conta e risco.
            </li>
            <li>
              💸 <strong>Risco de perda.</strong> Previsões envolvem risco de
              perder o valor apostado. <strong>Não é aconselhamento financeiro.</strong>
            </li>
            <li>
              ⚖️ Você é responsável por cumprir as <strong>leis da sua
              jurisdição</strong> e por seus tributos. Disponível apenas para
              <strong> maiores de 18 anos</strong>.
            </li>
            <li>
              🔑 Suas apostas e fundos ficam <strong>na blockchain</strong>, na sua
              própria carteira e no contrato em escrow — a plataforma não tem acesso
              ao seu dinheiro.
            </li>
          </ul>
          <p className="disclaimer-fine">
            Ao continuar, você declara ter lido e concordado com o acima.
          </p>
        </div>
        <button className="btn btn-gold" onClick={accept}>
          Li e concordo — entrar
        </button>
      </div>
    </div>
  );
}
