const STORAGE_KEY = 'blast-island.local-database.v1';

function emptyDatabase() { return { players: {}, matches: [] }; }
function read() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return value && typeof value === 'object' ? { ...emptyDatabase(), ...value } : emptyDatabase();
  } catch { return emptyDatabase(); }
}
function write(database) { localStorage.setItem(STORAGE_KEY, JSON.stringify(database)); }
function playerKey(name) { return name.trim().toLocaleLowerCase('es').replace(/\s+/g, ' ').slice(0, 40); }

export function recordMatch({ players, winnerId, arenaId, mode, durationMs }) {
  const database = read();
  const playedAt = new Date().toISOString();
  for (const player of players) {
    const key = playerKey(player.name);
    const previous = database.players[key] || { name: player.name, games: 0, wins: 0, updatedAt: playedAt };
    database.players[key] = { ...previous, name: player.name, games: previous.games + 1, wins: previous.wins + (player.id === winnerId ? 1 : 0), updatedAt: playedAt };
  }
  database.matches.unshift({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, playedAt, arenaId, mode, durationMs, winnerId, players: players.map(player => ({ id: player.id, name: player.name, won: player.id === winnerId })) });
  database.matches = database.matches.slice(0, 100);
  write(database);
}

export function getLeaderboard(limit = 10) {
  return Object.values(read().players).sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name, 'es')).slice(0, limit);
}
export function getDatabaseInfo() { const database = read(); return { players: Object.keys(database.players).length, matches: database.matches.length }; }
