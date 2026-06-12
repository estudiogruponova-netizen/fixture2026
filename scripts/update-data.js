const fs = require('fs');
const path = require('path');

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const API_BASE = 'https://api.football-data.org/v4';
const FIXTURE_PATH = path.join(__dirname, 'base-fixture.json');
const OUT_PATH = path.join(__dirname, '..', 'data.json');

const localFixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

const TEAM_ALIASES = {
  'México': ['Mexico'],
  'Sudáfrica': ['South Africa'],
  'Corea del Sur': ['Korea Republic', 'South Korea', 'Korea'],
  'Chequia': ['Czechia', 'Czech Republic'],
  'Canadá': ['Canada'],
  'Bosnia y Herzegovina': ['Bosnia and Herzegovina'],
  'Catar': ['Qatar'],
  'Suiza': ['Switzerland'],
  'Brasil': ['Brazil'],
  'Marruecos': ['Morocco'],
  'Haití': ['Haiti'],
  'Escocia': ['Scotland'],
  'Estados Unidos': ['United States', 'USA', 'United States of America'],
  'Paraguay': ['Paraguay'],
  'Australia': ['Australia'],
  'Turquía': ['Turkey', 'Türkiye', 'Turkiye'],
  'Alemania': ['Germany'],
  'Curazao': ['Curaçao', 'Curacao'],
  'Costa de Marfil': ['Côte d’Ivoire', 'Côte d\'Ivoire', 'Cote d’Ivoire', 'Cote dIvoire', 'Ivory Coast'],
  'Ecuador': ['Ecuador'],
  'Países Bajos': ['Netherlands', 'Holland'],
  'Japón': ['Japan'],
  'Suecia': ['Sweden'],
  'Túnez': ['Tunisia'],
  'Bélgica': ['Belgium'],
  'Egipto': ['Egypt'],
  'Irán': ['Iran', 'IR Iran'],
  'Nueva Zelanda': ['New Zealand'],
  'España': ['Spain'],
  'Cabo Verde': ['Cape Verde'],
  'Arabia Saudita': ['Saudi Arabia'],
  'Uruguay': ['Uruguay'],
  'Francia': ['France'],
  'Senegal': ['Senegal'],
  'Irak': ['Iraq'],
  'Noruega': ['Norway'],
  'Argentina': ['Argentina'],
  'Argelia': ['Algeria'],
  'Austria': ['Austria'],
  'Jordania': ['Jordan'],
  'Portugal': ['Portugal'],
  'RD Congo': ['Congo DR', 'DR Congo', 'Democratic Republic of Congo', 'Congo Democratic Republic'],
  'Uzbekistán': ['Uzbekistan'],
  'Colombia': ['Colombia'],
  'Inglaterra': ['England'],
  'Croacia': ['Croatia'],
  'Ghana': ['Ghana'],
  'Panamá': ['Panama']
};

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliases(localName) {
  return [localName, ...(TEAM_ALIASES[localName] || [])].map(normalize);
}

function sameTeam(localName, apiName) {
  const api = normalize(apiName);
  return aliases(localName).some(a => a === api || api.includes(a) || a.includes(api));
}

function findLocalMatch(apiMatch) {
  const apiHome = apiMatch.homeTeam?.name || apiMatch.homeTeam?.shortName || '';
  const apiAway = apiMatch.awayTeam?.name || apiMatch.awayTeam?.shortName || '';

  return localFixtures.find(local =>
    sameTeam(local.home, apiHome) && sameTeam(local.away, apiAway)
  ) || localFixtures.find(local =>
    sameTeam(local.home, apiAway) && sameTeam(local.away, apiHome)
  );
}

function statusEs(status) {
  const s = String(status || '').toUpperCase();
  if (['LIVE', 'IN_PLAY', 'PAUSED'].includes(s)) return 'En vivo';
  if (s === 'FINISHED') return 'Finalizado';
  if (['POSTPONED', 'SUSPENDED', 'CANCELLED'].includes(s)) return 'Suspendido';
  return 'Programado';
}

function scoreText(match) {
  const ft = match.score?.fullTime || {};
  const rt = match.score?.regularTime || {};
  const ht = match.score?.halfTime || {};
  const home = ft.home ?? rt.home ?? ht.home;
  const away = ft.away ?? rt.away ?? ht.away;
  if (home === null || home === undefined || away === null || away === undefined) return 'VS';
  return `${home} - ${away}`;
}

function goalLine(goal) {
  const minute = goal.minute || goal.minute === 0 ? `${goal.minute}${goal.injuryTime ? '+' + goal.injuryTime : ''}’` : '';
  const scorer = goal.scorer?.name || goal.scorer || 'Gol';
  const team = goal.team?.name ? ` (${goal.team.name})` : '';
  const type = goal.type && goal.type !== 'REGULAR' ? `, ${goal.type}` : '';
  return `${scorer}${team} ${minute}${type}`.trim();
}

function goalsText(match) {
  const goals = Array.isArray(match.goals) ? match.goals : [];
  if (goals.length) return goals.map(goalLine).join('. ') + '.';
  const status = statusEs(match.status);
  if (status === 'Finalizado' && scoreText(match) !== 'VS') {
    return 'Resultado actualizado por API. El detalle de goleadores no está disponible en el plan actual.';
  }
  if (status === 'En vivo') return 'Goles y eventos: actualizando desde API.';
  return 'Goles: se cargarán cuando empiece o termine el partido.';
}

function summaryText(local, match) {
  const status = statusEs(match.status);
  const score = scoreText(match);
  const home = local.home;
  const away = local.away;
  let text;

  if (status === 'Finalizado' && score !== 'VS') {
    const [h, a] = score.split(' - ').map(Number);
    if (h > a) text = `${home} venció ${score} a ${away} por el Grupo ${local.group}. Resultado actualizado automáticamente con datos de la API.`;
    else if (a > h) text = `${away} venció ${score} a ${home} por el Grupo ${local.group}. Resultado actualizado automáticamente con datos de la API.`;
    else text = `${home} y ${away} empataron ${score} por el Grupo ${local.group}. Resultado actualizado automáticamente con datos de la API.`;
  } else if (status === 'En vivo') {
    text = `${home} vs ${away} está en juego por el Grupo ${local.group}. Marcador actual: ${score}.`;
  } else {
    text = `Cruce del Grupo ${local.group}: ${home} vs ${away} en ${local.venue}. Partido de fase de grupos con puntos clave para encaminar la clasificación.`;
  }

  return text.slice(0, 300);
}

async function fetchWorldCupMatches() {
  if (!TOKEN) throw new Error('Falta el secret FOOTBALL_DATA_TOKEN');

  const urls = [
    `${API_BASE}/competitions/WC/matches?season=2026`,
    `${API_BASE}/competitions/WC/matches?dateFrom=2026-06-11&dateTo=2026-07-19`,
    `${API_BASE}/matches?competitions=WC&dateFrom=2026-06-11&dateTo=2026-07-19`
  ];

  let lastError = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'X-Auth-Token': TOKEN,
          'X-Unfold-Goals': 'true'
        }
      });

      const text = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 220)}`);

      const data = JSON.parse(text);
      if (Array.isArray(data.matches)) return data.matches;
    } catch (err) {
      lastError = err;
      console.warn(`No pude usar ${url}: ${err.message}`);
    }
  }

  throw lastError || new Error('No hubo respuesta válida de football-data.org');
}

async function main() {
  const previous = fs.existsSync(OUT_PATH)
    ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'))
    : { results: {} };

  const results = { ...(previous.results || {}) };
  let matches = [];
  let error = null;

  try {
    matches = await fetchWorldCupMatches();

    for (const apiMatch of matches) {
      const local = findLocalMatch(apiMatch);
      if (!local) continue;

      results[local.id] = {
        score: scoreText(apiMatch),
        status: statusEs(apiMatch.status),
        goals: goalsText(apiMatch),
        summary: summaryText(local, apiMatch),
        source: 'football-data.org',
        apiMatchId: apiMatch.id || null,
        utcDate: apiMatch.utcDate || null
      };
    }
  } catch (err) {
    error = err.message;
    console.error(err);
  }

  const output = {
    updatedAt: new Date().toISOString(),
    source: 'football-data.org',
    automatic: true,
    matchedResults: Object.keys(results).length,
    apiMatchesRead: matches.length,
    lastError: error,
    results
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`data.json actualizado. Resultados: ${Object.keys(results).length}. Partidos leídos API: ${matches.length}.`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
