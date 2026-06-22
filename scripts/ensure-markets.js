const hre = require("hardhat");
const { ethers } = hre;

// Garante um número-alvo de mercados no contrato Divinatio JÁ implantado, SEM
// reimplantar nada. Lê marketCount() e cria apenas os mercados que faltam para
// chegar ao alvo (idempotente: rodar de novo não duplica).
//
// Uso (na Railway, modo público):
//   ENSURE_MARKETS=100 CONTRACT_ADDRESS=0x... PRIVATE_KEY=0x... \
//   npx hardhat run scripts/ensure-markets.js --network base
//
// Os mercados são um catálogo CURADO (sem nenhuma previsão fake): só a pergunta
// e o prazo. Cada item: { q: "Pergunta\nOpção1\nOpção2...", days: <prazo> }.
// As N primeiras entradas coincidem com as criadas no deploy inicial, então a
// criação começa a partir do índice atual (marketCount) e segue a lista.
const MARKETS = [
  // --- 0..15: mesmas do deploy inicial (deploy-public.js) ---
  { q: "Quem vence a Copa do Mundo FIFA 2026?\nBrasil\nArgentina\nFrança\nEspanha\nInglaterra\nOutro", days: 80 },
  { q: "Campeão do Brasileirão 2026\nFlamengo\nPalmeiras\nBotafogo\nCorinthians\nOutro", days: 200 },
  { q: "A Libertadores 2026 fica com um clube brasileiro?\nSim\nNão", days: 210 },
  { q: "Bola de Ouro 2026\nVini Jr.\nMbappé\nHaaland\nOutro", days: 150 },
  { q: "Champions League 2025/26\nReal Madrid\nManchester City\nBayern\nPSG\nOutro", days: 120 },
  { q: "Fórmula 1 — campeão de 2026\nVerstappen\nNorris\nLeclerc\nOutro", days: 240 },
  { q: "NBA — campeão de 2026\nCeltics\nThunder\nNuggets\nOutro", days: 90 },
  { q: "Quem vence o BBB 26?\nNordeste\nSudeste\nSul/Centro-Oeste/Norte", days: 60 },
  { q: "Algum filme brasileiro indicado a Melhor Filme no Oscar 2027?\nSim\nNão", days: 300 },
  { q: "Eleição presidencial 2026 vai a 2º turno?\nSim\nNão", days: 150 },
  { q: "Spotify Wrapped Brasil 2026 — artista mais ouvido\nAna Castela\nHenrique & Juliano\nLuan Pereira\nOutro", days: 180 },
  { q: "Bitcoin fecha 2026 acima de US$ 150 mil?\nSim\nNão", days: 200 },
  { q: "GTA 6 é lançado dentro de 2026?\nSim\nNão", days: 260 },
  { q: "A Seleção Brasileira chega à final da Copa 2026?\nSim\nNão", days: 80 },
  { q: "Palmeiras e Corinthians na final do Paulistão 2026?\nSim\nNão", days: 40 },
  { q: "Anitta emplaca um hit no top 10 global em 2026?\nSim\nNão", days: 220 },

  // --- 16+: novos mercados ---
  // Futebol nacional/internacional
  { q: "Quem é o artilheiro do Brasileirão 2026?\nPedro\nCalleri\nOutro", days: 200 },
  { q: "O Flamengo contrata um técnico estrangeiro em 2026?\nSim\nNão", days: 120 },
  { q: "Neymar disputa a Copa do Mundo 2026 pela Seleção?\nSim\nNão", days: 70 },
  { q: "Quem vence a Copa do Brasil 2026?\nFlamengo\nPalmeiras\nCruzeiro\nAtlético-MG\nOutro", days: 230 },
  { q: "Messi joga a Copa do Mundo 2026?\nSim\nNão", days: 70 },
  { q: "Campeão da Premier League 2025/26\nLiverpool\nArsenal\nManchester City\nOutro", days: 120 },
  { q: "Campeão de La Liga 2025/26\nReal Madrid\nBarcelona\nAtlético\nOutro", days: 120 },
  { q: "Campeão da Serie A italiana 2025/26\nInter\nNapoli\nJuventus\nOutro", days: 120 },
  { q: "Campeão da Bundesliga 2025/26\nBayern\nLeverkusen\nOutro", days: 120 },
  { q: "Quem vence o Mundial de Clubes seguinte?\nReal Madrid\nClube brasileiro\nManchester City\nOutro", days: 300 },
  { q: "O Corinthians termina o Brasileirão 2026 no G6?\nSim\nNão", days: 200 },
  { q: "O São Paulo termina o Brasileirão 2026 no G6?\nSim\nNão", days: 200 },
  { q: "Algum clube paulista cai para a Série B em 2026?\nSim\nNão", days: 200 },
  { q: "Carlo Ancelotti continua técnico da Seleção até o fim da Copa 2026?\nSim\nNão", days: 80 },

  // Outros esportes
  { q: "Verstappen vence o GP do Brasil de F1 2026?\nSim\nNão", days: 250 },
  { q: "Algum piloto brasileiro pontua na F1 em 2026?\nSim\nNão", days: 250 },
  { q: "Quem vence Wimbledon 2026 (masculino)?\nAlcaraz\nSinner\nDjokovic\nOutro", days: 200 },
  { q: "Quem vence Roland Garros 2026 (masculino)?\nAlcaraz\nSinner\nOutro", days: 150 },
  { q: "O Brasil ganha alguma medalha de ouro na próxima Olimpíada?\nSim\nNão", days: 320 },
  { q: "Quem vence o Super Bowl seguinte?\nChiefs\n49ers\nOutro", days: 240 },
  { q: "Charles Oliveira vence sua próxima luta no UFC?\nSim\nNão", days: 90 },
  { q: "Algum brasileiro é campeão de um cinturão do UFC em 2026?\nSim\nNão", days: 300 },

  // Cripto e economia
  { q: "Ethereum fecha 2026 acima de US$ 6 mil?\nSim\nNão", days: 200 },
  { q: "Bitcoin atinge uma nova máxima histórica em 2026?\nSim\nNão", days: 200 },
  { q: "Solana fecha 2026 acima de US$ 400?\nSim\nNão", days: 200 },
  { q: "O dólar fecha 2026 acima de R$ 6,00?\nSim\nNão", days: 200 },
  { q: "A Selic termina 2026 acima de 12% ao ano?\nSim\nNão", days: 200 },
  { q: "A inflação (IPCA) de 2026 fica acima de 5%?\nSim\nNão", days: 220 },
  { q: "O Ibovespa atinge 160 mil pontos em 2026?\nSim\nNão", days: 220 },
  { q: "O Brasil aprova a regulamentação do mercado de cripto em 2026?\nSim\nNão", days: 250 },
  { q: "Algum ETF de Solana é aprovado nos EUA em 2026?\nSim\nNão", days: 240 },
  { q: "O ouro fecha 2026 acima de US$ 3 mil a onça?\nSim\nNão", days: 200 },

  // Política e mundo
  { q: "Quem é eleito presidente do Brasil em 2026?\nSituação\nOposição\nOutro", days: 200 },
  { q: "Lula é candidato à reeleição em 2026?\nSim\nNão", days: 120 },
  { q: "O PT elege o governador de São Paulo em 2026?\nSim\nNão", days: 200 },
  { q: "Há mudança de partido no governo federal após a eleição de 2026?\nSim\nNão", days: 210 },
  { q: "Algum acordo de paz duradouro é assinado na guerra da Ucrânia em 2026?\nSim\nNão", days: 250 },
  { q: "O preço médio da gasolina no Brasil passa de R$ 7/litro em 2026?\nSim\nNão", days: 200 },
  { q: "O salário mínimo brasileiro passa de R$ 1.700 em 2026?\nSim\nNão", days: 180 },

  // Tecnologia e IA
  { q: "A OpenAI lança o GPT-6 em 2026?\nSim\nNão", days: 250 },
  { q: "A Apple lança óculos de realidade aumentada em 2026?\nSim\nNão", days: 280 },
  { q: "Algum carro 100% autônomo é liberado para venda no Brasil em 2026?\nSim\nNão", days: 300 },
  { q: "A Tesla entrega o robô Optimus a clientes em 2026?\nSim\nNão", days: 300 },
  { q: "A Nvidia continua valendo mais de US$ 3 trilhões no fim de 2026?\nSim\nNão", days: 220 },
  { q: "Alguma IA passa de forma amplamente reconhecida no Teste de Turing em 2026?\nSim\nNão", days: 280 },
  { q: "O TikTok continua disponível nos EUA no fim de 2026?\nSim\nNão", days: 240 },

  // Entretenimento e cultura
  { q: "Qual filme leva o Oscar de Melhor Filme em 2027?\nProdução de estúdio\nProdução independente\nOutro", days: 300 },
  { q: "A novela das 21h da Globo bate recorde de audiência em 2026?\nSim\nNão", days: 200 },
  { q: "Algum artista brasileiro faz show no Coachella 2026?\nSim\nNão", days: 120 },
  { q: "O Rock in Rio 2026 esgota os ingressos no primeiro dia de venda?\nSim\nNão", days: 150 },
  { q: "Taylor Swift anuncia turnê no Brasil para 2026/27?\nSim\nNão", days: 220 },
  { q: "Quem ganha o Grammy de Álbum do Ano em 2027?\nPop\nHip-hop\nOutro", days: 300 },
  { q: "Algum jogo brasileiro ganha prêmio no The Game Awards 2026?\nSim\nNão", days: 300 },
  { q: "GTA 6 vende mais de 30 milhões de cópias no primeiro mês?\nSim\nNão", days: 320 },
  { q: "A próxima novela da Globo tem um remake?\nSim\nNão", days: 180 },
  { q: "Anitta lança um álbum em 2026?\nSim\nNão", days: 240 },
  { q: "Algum brasileiro vence o BBB 26 vindo do Norte/Nordeste?\nSim\nNão", days: 60 },

  // Mercado, negócios e Brasil
  { q: "A Petrobras paga dividendos extraordinários em 2026?\nSim\nNão", days: 220 },
  { q: "Alguma big tech anuncia data center no Brasil em 2026?\nSim\nNão", days: 250 },
  { q: "O Nubank ultrapassa 120 milhões de clientes em 2026?\nSim\nNão", days: 240 },
  { q: "O PIX começa a funcionar via aproximação (NFC) de forma ampla em 2026?\nSim\nNão", days: 220 },
  { q: "O Brasil entra oficialmente para a OCDE em 2026?\nSim\nNão", days: 300 },
  { q: "Algum unicórnio (startup avaliada em US$ 1 bi) brasileiro surge em 2026?\nSim\nNão", days: 260 },
  { q: "O turismo internacional bate recorde no Brasil em 2026?\nSim\nNão", days: 280 },

  // Clima e ciência
  { q: "2026 é declarado o ano mais quente já registrado?\nSim\nNão", days: 330 },
  { q: "Alguma missão leva humanos além da órbita da Lua em 2026?\nSim\nNão", days: 300 },
  { q: "A SpaceX faz um voo orbital completo da Starship em 2026?\nSim\nNão", days: 240 },
  { q: "Algum furacão categoria 5 se forma no Atlântico em 2026?\nSim\nNão", days: 250 },

  // Mais esportes/variados para completar
  { q: "O Brasil é campeão da próxima Copa América/edição seguinte?\nSim\nNão", days: 320 },
  { q: "Algum clube carioca é campeão estadual em 2026?\nFlamengo\nFluminense\nVasco\nBotafogo", days: 60 },
  { q: "O Grêmio ou o Inter é campeão gaúcho em 2026?\nGrêmio\nInter\nOutro", days: 60 },
  { q: "O Atlético-MG conquista um título nacional em 2026?\nSim\nNão", days: 250 },
  { q: "O Cruzeiro termina o Brasileirão 2026 no G6?\nSim\nNão", days: 200 },
  { q: "O Vasco termina o Brasileirão 2026 fora do Z4?\nSim\nNão", days: 200 },
  { q: "O Santos retorna à Série A em 2026?\nSim\nNão", days: 200 },
  { q: "Algum estreante vence uma corrida de F1 em 2026?\nSim\nNão", days: 250 },
  { q: "O Brasil vence o vôlei na próxima competição mundial?\nSim\nNão", days: 280 },
  { q: "Rebeca Andrade ganha medalha na próxima grande competição de ginástica?\nSim\nNão", days: 280 },
  { q: "O surfe brasileiro tem campeão mundial em 2026?\nSim\nNão", days: 300 },
  { q: "Algum tenista brasileiro entra no top 50 da ATP em 2026?\nSim\nNão", days: 260 },
  { q: "O Brasil sedia algum grande evento esportivo internacional em 2026?\nSim\nNão", days: 280 },
  { q: "A próxima edição do Lollapalooza Brasil esgota?\nSim\nNão", days: 200 },
  { q: "O Palmeiras conquista algum título em 2026?\nSim\nNão", days: 250 },
  { q: "O Flamengo conquista algum título em 2026?\nSim\nNão", days: 250 },
  { q: "Algum jogo da Seleção Brasileira na Copa 2026 vai para os pênaltis?\nSim\nNão", days: 90 },
  { q: "A final da Copa do Mundo 2026 tem prorrogação?\nSim\nNão", days: 90 },
  { q: "Quem termina 2026 como melhor do mundo (The Best FIFA)?\nVini Jr.\nMbappé\nHaaland\nOutro", days: 320 },
  { q: "O Brasil termina as Eliminatórias/Copa 2026 invicto na fase de grupos?\nSim\nNão", days: 85 },
  { q: "Algum streamer/criador brasileiro passa de 50 milhões de inscritos em 2026?\nSim\nNão", days: 260 },
  { q: "O preço do café continua em alta no Brasil no fim de 2026?\nSim\nNão", days: 220 },
];

async function main() {
  const target = Number(process.env.ENSURE_MARKETS || process.env.MARKET_TARGET || 100);
  if (!process.env.CONTRACT_ADDRESS) {
    throw new Error("CONTRACT_ADDRESS não definido — aponte para o contrato já implantado.");
  }
  // Normaliza o endereço (trim + checksum) para evitar o caminho de resolveName
  // do ethers v6 caso a variável venha com espaço.
  const address = ethers.getAddress(process.env.CONTRACT_ADDRESS.trim());

  const [deployer] = await ethers.getSigners();
  const divinatio = await ethers.getContractAt("Divinatio", address, deployer);

  const current = Number(await divinatio.marketCount());
  console.log(`Contrato ${address} — mercados atuais: ${current} | alvo: ${target}`);

  if (current >= target) {
    console.log("Já há mercados suficientes — nada a criar.");
    return;
  }
  if (target > MARKETS.length) {
    console.log(`Aviso: alvo ${target} > catálogo (${MARKETS.length}); vou criar até ${MARKETS.length}.`);
  }

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const DAY = 24 * 60 * 60;
  const end = Math.min(target, MARKETS.length);

  let created = 0;
  for (let i = current; i < end; i++) {
    const m = MARKETS[i];
    const close = now + m.days * DAY;
    const outcomeCount = m.q.split("\n").length - 1;
    try {
      await (
        await divinatio.createMarket(m.q, outcomeCount, close, close + 2 * DAY, 100)
      ).wait();
      created++;
      if (created % 10 === 0) console.log(`  ...${created} criados`);
    } catch (e) {
      console.error(`Falha ao criar o mercado #${i} (${m.q.split("\n")[0]}):`, e.shortMessage || e.message);
      throw e; // para aqui; ao reiniciar, continua de onde parou (idempotente)
    }
  }
  const finalCount = Number(await divinatio.marketCount());
  console.log(`OK: ${created} mercados novos criados. Total agora: ${finalCount}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
