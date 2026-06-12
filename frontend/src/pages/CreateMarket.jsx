import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createMarket } from "../eth";

export default function CreateMarket({ account, onConnect, notify }) {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [outcomes, setOutcomes] = useState(["", ""]);
  const [closeDate, setCloseDate] = useState("");
  const [creatorFee, setCreatorFee] = useState("1");
  const [busy, setBusy] = useState(false);

  function setOutcome(i, value) {
    setOutcomes((prev) => prev.map((o, j) => (j === i ? value : o)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!account) return onConnect();
    const labels = outcomes.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || labels.length < 2) {
      return notify("Preencha a pergunta e pelo menos 2 desfechos.", "error");
    }
    const close = Math.floor(new Date(closeDate).getTime() / 1000);
    if (!close || close <= Date.now() / 1000) {
      return notify("A data de fechamento precisa estar no futuro.", "error");
    }

    setBusy(true);
    try {
      await createMarket({
        question: [question.trim(), ...labels].join("\n"),
        outcomeCount: labels.length,
        closeTime: close,
        resolutionDeadline: close + 3 * 24 * 3600,
        creatorFeeBps: Math.round(Number(creatorFee) * 100),
      });
      notify("Mercado criado! O oráculo está aberto 🔮", "success");
      navigate("/");
    } catch (err) {
      notify(err.shortMessage || err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="create-page">
      <h2 className="section-title">✦ Criar um mercado</h2>
      <p style={{ color: "var(--text-dim)", marginBottom: 24, lineHeight: 1.6 }}>
        Qualquer pessoa pode abrir um oráculo. Como criador(a), você recebe até 1% do
        pool perdedor quando o mercado é resolvido.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="input-label">A pergunta (evento futuro, verificável)</label>
          <input
            className="input"
            placeholder="Ex.: Quem vence a Copa do Mundo FIFA 2026?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="input-label">Desfechos possíveis (2 a 8)</label>
          {outcomes.map((o, i) => (
            <div key={i} className="outcome-input-row">
              <input
                className="input"
                placeholder={`Desfecho ${i + 1}`}
                value={o}
                onChange={(e) => setOutcome(i, e.target.value)}
              />
              {outcomes.length > 2 && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setOutcomes((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {outcomes.length < 8 && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setOutcomes((prev) => [...prev, ""])}
            >
              + adicionar desfecho
            </button>
          )}
        </div>

        <div className="form-group">
          <label className="input-label">Previsões encerram em</label>
          <input
            className="input"
            type="datetime-local"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="input-label">Sua taxa de criador (% do pool perdedor, máx. 1%)</label>
          <input
            className="input"
            type="number"
            min="0"
            max="1"
            step="0.25"
            value={creatorFee}
            onChange={(e) => setCreatorFee(e.target.value)}
          />
        </div>

        <button className="btn btn-gold" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Invocando o oráculo…" : account ? "Criar mercado" : "Conectar carteira para criar"}
        </button>
        <p className="fine-print" style={{ marginTop: 12 }}>
          O prazo de resolução é definido automaticamente em 3 dias após o fechamento.
          Sem resolução nesse prazo (+7 dias de carência), todos são reembolsados.
        </p>
      </form>
    </div>
  );
}
