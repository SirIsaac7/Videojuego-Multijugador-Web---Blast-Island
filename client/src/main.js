import Phaser from 'phaser';
import { ArenaScene } from './scenes/ArenaScene.js';
import { ARENAS, getArena } from './data/arenas.js';
import { getDatabaseInfo, getLeaderboard, recordMatch } from './data/localDatabase.js';
import { SoundManager } from './audio/soundManager.js';

const $ = id => document.getElementById(id);
const sounds = new SoundManager();
let game = null; let roster = []; let lobbyRaf = 0; let countdownTimer = 0; let activeScene = null; let isPaused = false; let settingsFromPause = false; let settingsFromMenu = false; let rankingFromMenu = false;
const SETTINGS_KEY = 'blast-island.settings.v1';
let settings = { volume: .7, quality: 'high', fps: 60 };
try { settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }; } catch {}
const joinedPads = new Map(); const previousLobbyButtons = new Map();
const menu = $('menu'); const lobby = $('lobby'); const gameWrap = $('game-wrap');
let deferredInstallPrompt = null;
let creditsFromMenu = false;
const status = message => { $('status').textContent = message; };
const toast = message => { const el = $('toast'); el.textContent = message; el.classList.add('show'); window.setTimeout(() => el.classList.remove('show'), 1800); };
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function playerOne() { return { id: 'local-p1', name: $('nickname').value.trim().slice(0, 16) || 'Jugador 1', skin: $('skin').value, inputType: 'keyboard', gamepadIndex: null }; }
function gamepads() { return Array.from(navigator.getGamepads?.() || []).filter(Boolean); }
function anyButtonPressed(pad) { return pad.buttons.some(button => button.pressed || button.value > .55) || Math.abs(pad.axes[0] || 0) > .45 || Math.abs(pad.axes[1] || 0) > .45; }

function fillArenas() {
  $('arena').innerHTML = ARENAS.map(arena => `<option value="${arena.id}">${escapeHtml(arena.name)}</option>`).join('');
  updateArenaDescription();
}
function confirmStartMatch() {
  if (roster.length === 1 && !roster.some(player => player.inputType === 'ai')) {
    lobby.classList.add('hidden');
    $('soloConfirm').classList.remove('hidden');
    return;
  }
  showRules();
}
function addMasterAI() {
  if (!roster.some(player => player.inputType === 'ai')) {
    roster.push({
      id: 'local-master-ai',
      name: 'IA Maestra',
      skin: 'coral',
      inputType: 'ai',
      gamepadIndex: null
    });
  }
  $('soloConfirm').classList.add('hidden');
  renderLobby();
  showRules();
}
function updateArenaDescription() { $('arenaDescription').textContent = getArena($('arena').value).description; }
function renderLeaderboard() {
  const leaderboard = getLeaderboard(); const info = getDatabaseInfo();
  $('databaseInfo').textContent = `${info.players} perfil(es) · ${info.matches} partida(s) guardada(s) en este navegador`;
  const ranks = ['rank-first', 'rank-second', 'rank-third'];
  const medals = ['🥇 1.º', '🥈 2.º', '🥉 3.º'];
  $('leaderboardRows').innerHTML = leaderboard.length ? leaderboard.map((player, index) => {
    const rankClass = ranks[index] || 'rank-standard';
    const medal = medals[index] || `${index + 1}.`;
    return `<li class="${rankClass}" style="--rank-delay:${Math.min(index, 8) * 70}ms"><i class="rank-medal">${medal}</i><b>${escapeHtml(player.name)}</b><span>${player.wins} victoria(s) · ${player.games} partida(s)</span></li>`;
  }).join('') : '<li class="empty">Aún no hay partidas registradas.</li>';
}
function renderLobby() {
  $('playerCount').textContent = `${roster.length} / 4`;
  $('lobbyInfo').textContent = roster.some(player => player.inputType === 'ai') ? 'La IA Maestra está lista para enfrentarte.' : roster.length === 1 ? 'Conecta un mando para un segundo jugador o comienza para jugar contra la IA Maestra.' : `${roster.length} jugadores listos para combatir.`;
  $('players').innerHTML = roster.map(player => { const device = player.inputType === 'keyboard' ? '⌨ Teclado' : player.inputType === 'ai' ? '🤖 Inteligencia artificial' : `🎮 Mando ${player.gamepadIndex + 1}`; return `<li><span><input class="player-name" data-player-id="${player.id}" value="${escapeHtml(player.name)}" maxlength="16" aria-label="Nombre de ${escapeHtml(player.name)}" ${player.inputType === 'ai' ? 'readonly' : ''}><small>${device}</small></span><i>LISTO</i></li>`; }).join('');
}
function applySettings() {
  sounds.setVolume(settings.volume); document.documentElement.dataset.quality = settings.quality;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
function openSettings() {
  settingsFromPause = isPaused;
  settingsFromMenu = !settingsFromPause && !menu.classList.contains('hidden');
  if (settingsFromPause) $('pauseMenu').classList.add('hidden');
  if (settingsFromMenu) menu.classList.add('hidden');
  $('settingsVolume').value = settings.volume; $('settingsQuality').value = settings.quality; $('settingsFps').value = settings.fps;
  $('ranking').classList.add('hidden');
  $('settings').classList.remove('hidden');
}
function pauseGame() {
  if (isPaused || !activeScene?.matchStarted || activeScene.finished) return;
  isPaused = true;
  activeScene.scene.pause();
  sounds.pauseMusic();
  $('pauseMenu').classList.remove('hidden');
}
function resumeGame() {
  $('pauseMenu').classList.add('hidden');
  $('settings').classList.add('hidden');
  if (!isPaused) return;
  isPaused = false;
  activeScene?.scene.resume();
  sounds.resumeMusic();
}
function pollLobbyPads() {
  if (lobby.classList.contains('hidden')) return;
  for (const pad of gamepads()) {
    if (joinedPads.has(pad.index)) continue;
    const pressed = anyButtonPressed(pad); const wasPressed = previousLobbyButtons.get(pad.index) || false; previousLobbyButtons.set(pad.index, pressed);
    if (pressed && !wasPressed && roster.length < 4) {
      const playerNumber = roster.length + 1; const player = { id: `local-p${playerNumber}`, name: `Jugador ${playerNumber}`, skin: ['cyan', 'coral', 'lime', 'violet'][playerNumber - 1], inputType: 'gamepad', gamepadIndex: pad.index, gamepadId: pad.id };
      roster.push(player); joinedPads.set(pad.index, player.id); sounds.effect('join'); renderLobby(); toast(`${player.name} se unió`);
    }
  }
  lobbyRaf = requestAnimationFrame(pollLobbyPads);
}
function showLobby() {
  sounds.unlock(); sounds.startMenuMusic(); sounds.effect('ui'); $('soloConfirm').classList.add('hidden'); menu.classList.add('hidden'); lobby.classList.remove('hidden'); gameWrap.classList.add('hidden');
  roster = [playerOne()]; joinedPads.clear(); previousLobbyButtons.clear(); fillArenas(); renderLobby(); cancelAnimationFrame(lobbyRaf); lobbyRaf = requestAnimationFrame(pollLobbyPads);
}
function returnToMenu() {
  window.clearTimeout(countdownTimer); countdownTimer = 0; $('countdown').classList.add('hidden');
  isPaused = false; activeScene = null; menu.classList.remove('menu-configuring'); $('pauseMenu').classList.add('hidden'); $('settings').classList.add('hidden');
  $('ranking').classList.add('hidden'); settingsFromPause = false; settingsFromMenu = false; rankingFromMenu = false;
  if (game) { game.destroy(true); game = null; }
  sounds.stopMusic(); cancelAnimationFrame(lobbyRaf); $('rules').classList.add('hidden'); $('soloConfirm').classList.add('hidden'); $('results').classList.add('hidden'); gameWrap.classList.add('hidden'); lobby.classList.add('hidden'); menu.classList.remove('hidden'); $('mainActions').classList.remove('hidden'); $('menuOptions').classList.add('hidden'); roster = []; renderLeaderboard(); sounds.startMenuMusic();
}
function finishGame(result, arena) {
  const winner = result.players.find(player => player.id === result.winnerId);
  const soloPlayer = result.players.length === 1 ? result.players[0] : null;
  activeScene = null; isPaused = false; $('pauseMenu').classList.add('hidden');
  recordMatch({ ...result, players: result.players.filter(player => player.inputType !== 'ai'), arenaId: arena.id, mode: $('mode').value }); sounds.stopMusic();
  const resultsPanel = $('results');
  resultsPanel.classList.toggle('result-victory', !!winner);
  resultsPanel.classList.toggle('result-draw', !winner && !soloPlayer);
  resultsPanel.classList.toggle('result-solo', !!soloPlayer);
  resultsPanel.querySelector('.eyebrow').textContent = winner ? '¡TENEMOS CAMPEÓN!' : soloPlayer ? 'FIN DE LA PARTIDA' : 'PARTIDA TERMINADA';
  $('resultEmblem').textContent = winner ? '🏆' : soloPlayer ? '💥' : '🤝';
  $('resultTitle').textContent = winner ? `¡${winner.name} gana!` : soloPlayer ? `¡${soloPlayer.name} fue eliminado!` : '¡Empate!';
  $('resultSummary').textContent = `${arena.name} · ${Math.floor(result.durationMs / 60000).toString().padStart(2, '0')}:${Math.floor(result.durationMs / 1000 % 60).toString().padStart(2, '0')}`;
  const playerResults = $('resultPlayers');
  playerResults.replaceChildren();
  for (const [index, player] of result.players.entries()) {
    const card = document.createElement('div');
    card.className = `result-player ${player.id === winner?.id ? 'champion' : player.alive ? 'survivor' : 'defeated'}`;
    card.style.animationDelay = `${index * 100}ms`;
    const icon = document.createElement('span');
    icon.className = 'result-player-icon';
    icon.textContent = player.id === winner?.id ? '👑' : player.alive ? '🎮' : '☠';
    const name = document.createElement('strong');
    name.textContent = player.name;
    const status = document.createElement('small');
    status.textContent = player.id === winner?.id ? 'CAMPEÓN' : player.alive ? 'EN PIE' : soloPlayer ? 'FIN DE LA PARTIDA' : 'ELIMINADO';
    card.append(icon, name, status);
    playerResults.append(card);
  }
  const fireworks = $('resultFireworks');
  fireworks.replaceChildren();
  if (winner) {
    const colors = ['#65e8e5', '#ffd166', '#ff718d', '#a88bff', '#92f29b'];
    for (let burst = 0; burst < 5; burst++) {
      for (let particle = 0; particle < 12; particle++) {
        const spark = document.createElement('i');
        const angle = (Math.PI * 2 * particle) / 12;
        const distance = 55 + ((particle * 17 + burst * 11) % 70);
        spark.className = 'firework-spark';
        spark.style.left = `${12 + burst * 19}%`;
        spark.style.top = `${22 + (burst % 2) * 25}%`;
        spark.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
        spark.style.setProperty('--spark-y', `${Math.sin(angle) * distance}px`);
        spark.style.setProperty('--spark-color', colors[(particle + burst) % colors.length]);
        spark.style.setProperty('--spark-delay', `${burst * 180 + (particle % 4) * 35}ms`);
        fireworks.append(spark);
      }
    }
  }
  $('results').classList.remove('hidden'); renderLeaderboard();
}
function showRules() {
  if (!roster.length) { roster = [playerOne()]; renderLobby(); }
  const arena = getArena($('arena').value);
  const modes = { ffa: 'Todos contra todos', teams: 'Combate por equipos' };
  const opponentInfo = roster.some(player => player.inputType === 'ai') ? ' · Rival: IA Maestra' : '';
  $('rulesMatchInfo').textContent = `${modes[$('mode').value] || 'Partida local'} · ${arena.name}${opponentInfo}. ${arena.description}`;
  cancelAnimationFrame(lobbyRaf);
  lobby.classList.add('hidden');
  $('soloConfirm').classList.add('hidden');
  $('results').classList.add('hidden');
  gameWrap.classList.add('hidden');
  $('rules').classList.remove('hidden');
}
function startCountdown(scene) {
  activeScene = scene;
  const overlay = $('countdown');
  const value = $('countdownValue');
  const numbers = ['3', '2', '1'];
  let index = 0;
  overlay.classList.remove('hidden');
  const tick = () => {
    if (index >= numbers.length) {
      overlay.classList.add('hidden');
      countdownTimer = 0;
      scene.startMatch();
      return;
    }
    value.textContent = numbers[index++];
    value.style.animation = 'none';
    void value.offsetWidth;
    value.style.animation = '';
    countdownTimer = window.setTimeout(tick, 900);
  };
  tick();
}
function startGame() {
  if (isMobileDevice() && window.matchMedia('(orientation: portrait)').matches) {
    $('rules').classList.add('hidden');
    $('rotatePrompt').classList.remove('hidden');
    return;
  }
  $('rotatePrompt').classList.add('hidden');
  const arena = getArena($('arena').value); sounds.unlock(); sounds.effect('ui'); sounds.startPlaylist(arena.music);
  if (game) game.destroy(true); cancelAnimationFrame(lobbyRaf); $('rules').classList.add('hidden'); $('results').classList.add('hidden'); lobby.classList.add('hidden'); menu.classList.add('hidden'); gameWrap.classList.remove('hidden'); $('hudTimer').textContent = '00:00'; $('hudMode').textContent = `${$('mode').selectedOptions[0].text.toUpperCase()} · ${arena.name.toUpperCase()}`;
  isPaused = false; activeScene = null; $('pauseMenu').classList.add('hidden');
  game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', backgroundColor: '#101827', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 800, height: 520 }, resolution: settings.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : 1, fps: { target: Number(settings.fps) }, physics: { default: 'arcade', arcade: { debug: false } }, input: { gamepad: true }, scene: [new ArenaScene({ players: roster.map(player => ({ ...player })), mode: $('mode').value, arena, quality: settings.quality, sounds, onToast: toast, onFinish: result => finishGame(result, arena), onReady: startCountdown, onPause: pauseGame })], render: { antialias: settings.quality === 'high', roundPixels: false } });
}
function isMobileDevice() {
  return window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function handleDeviceOrientationChange() {
  if ($('rotatePrompt').classList.contains('hidden') ||
    window.matchMedia('(orientation: portrait)').matches) return;
  $('rotatePrompt').classList.add('hidden');
  startGame();
}

$('openLobbyBtn').onclick = showLobby; $('startBtn').onclick = confirmStartMatch; $('backBtn').onclick = returnToMenu; $('exitGame').onclick = returnToMenu;
$('pauseTouch').onclick = pauseGame;
$('soloConfirmYes').onclick = addMasterAI; $('soloConfirmNo').onclick = () => { $('soloConfirm').classList.add('hidden'); lobby.classList.remove('hidden'); lobbyRaf = requestAnimationFrame(pollLobbyPads); };
$('resumeGameBtn').onclick = resumeGame;
$('pauseSettingsBtn').onclick = openSettings;
$('pauseExitBtn').onclick = returnToMenu;
$('rulesStartBtn').onclick = startGame;
$('rulesBackBtn').onclick = () => { $('rules').classList.add('hidden'); lobby.classList.remove('hidden'); lobbyRaf = requestAnimationFrame(pollLobbyPads); };
window.addEventListener('orientationchange', handleDeviceOrientationChange);
window.addEventListener('resize', handleDeviceOrientationChange);
$('playMenuBtn').onclick = () => { sounds.unlock(); sounds.effect('ui'); menu.classList.add('menu-configuring'); $('mainActions').classList.add('hidden'); $('menuOptions').classList.remove('hidden'); };
$('exitAppBtn').onclick = () => { window.close(); status('Puedes cerrar esta pestaña para salir del juego.'); };
$('openCreditsBtn').onclick = () => {
  creditsFromMenu = !menu.classList.contains('hidden');
  if (creditsFromMenu) menu.classList.add('hidden');
  $('credits').classList.remove('hidden');
};
$('closeCreditsBtn').onclick = () => {
  $('credits').classList.add('hidden');
  if (creditsFromMenu) menu.classList.remove('hidden');
  creditsFromMenu = false;
};
$('installAppBtn').onclick = async () => {
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    status('Blast Island ya está instalada en este dispositivo.');
    return;
  }
  if (!deferredInstallPrompt) {
    status(/iPad|iPhone|iPod/.test(navigator.userAgent)
      ? 'En Safari: toca Compartir y elige «Añadir a pantalla de inicio».'
      : 'Para instalar, abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio».');
    return;
  }
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  $('installAppBtn').disabled = true;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    status(choice.outcome === 'accepted'
      ? 'Instalación iniciada. Ya puedes abrir Blast Island desde tus aplicaciones.'
      : 'Instalación cancelada. Puedes intentarlo cuando quieras.');
  } catch (error) {
    console.error('No se pudo iniciar la instalación de Blast Island.', error);
    status('No se pudo iniciar la instalación. Usa el menú del navegador para añadir la app.');
  } finally {
    $('installAppBtn').disabled = false;
  }
};
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $('installAppBtn').textContent = 'Instalar aplicación';
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  $('installAppBtn').textContent = 'Aplicación instalada';
  $('installAppBtn').disabled = true;
  status('Blast Island se instaló correctamente.');
});
$('showRankingBtn').onclick = () => {
  sounds.unlock(); sounds.effect('ui'); renderLeaderboard();
  rankingFromMenu = !menu.classList.contains('hidden');
  if (rankingFromMenu) menu.classList.add('hidden');
  $('settings').classList.add('hidden');
  $('ranking').classList.remove('hidden');
};
$('closeRankingBtn').onclick = () => {
  $('ranking').classList.add('hidden');
  if (rankingFromMenu) menu.classList.remove('hidden');
  rankingFromMenu = false;
};
$('arena').onchange = updateArenaDescription;
$('menuFromResultsBtn').onclick = returnToMenu; $('playAgainBtn').onclick = showRules;
$('openSettingsBtn').onclick = openSettings; $('closeSettingsBtn').onclick = () => {
  $('settings').classList.add('hidden');
  if (settingsFromPause && isPaused) $('pauseMenu').classList.remove('hidden');
  else if (settingsFromMenu) menu.classList.remove('hidden');
  settingsFromPause = false; settingsFromMenu = false;
};
$('settingsVolume').oninput = event => { settings.volume = Number(event.target.value); applySettings(); };
$('settingsQuality').onchange = event => { settings.quality = event.target.value; applySettings(); };
$('settingsFps').onchange = event => { settings.fps = Number(event.target.value); applySettings(); };
$('fullscreenBtn').onclick = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); };
$('players').oninput = event => { if (!event.target.matches('.player-name')) return; const player = roster.find(item => item.id === event.target.dataset.playerId); if (player) player.name = event.target.value.trim().slice(0, 16) || 'Jugador'; };

window.addEventListener('gamepadconnected', event => status(`Mando detectado: ${event.gamepad.id}. Entra a configurar jugadores y pulsa un botón para unirte.`));
window.addEventListener('gamepaddisconnected', event => { const playerId = joinedPads.get(event.gamepad.index); if (playerId) { joinedPads.delete(event.gamepad.index); if (!lobby.classList.contains('hidden')) { roster = roster.filter(player => player.id !== playerId); renderLobby(); } toast('Se desconectó un mando'); } previousLobbyButtons.delete(event.gamepad.index); });

const touch = { x: 0, y: 0, jump: false, pick: false, throw: false }; window.arenaTouch = touch;
const stick = $('stick'); const knob = $('stick-knob'); let dragging = false;
let stickPointerId = null;
function moveStick(event) { const rect = stick.getBoundingClientRect(); let dx = event.clientX - (rect.left + rect.width / 2); let dy = event.clientY - (rect.top + rect.height / 2); const length = Math.hypot(dx, dy); const max = Math.min(rect.width * .3, rect.height * .3); if (length > max) { dx = dx / length * max; dy = dy / length * max; } touch.x = dx / max; touch.y = dy / max; knob.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`; }
stick.addEventListener('pointerdown', event => { event.preventDefault(); dragging = true; stickPointerId = event.pointerId; stick.setPointerCapture(event.pointerId); moveStick(event); }); stick.addEventListener('pointermove', event => { if (dragging && event.pointerId === stickPointerId) moveStick(event); });
const resetStick = event => {
  if (event?.pointerId !== undefined && stickPointerId !== null && event.pointerId !== stickPointerId) return;
  dragging = false; stickPointerId = null; touch.x = touch.y = 0; knob.style.transform = '';
};
stick.addEventListener('pointerup', resetStick);
stick.addEventListener('pointercancel', resetStick);
stick.addEventListener('lostpointercapture', resetStick);
window.addEventListener('pointerup', resetStick);
window.addEventListener('pointercancel', resetStick);
window.addEventListener('blur', resetStick);
document.addEventListener('visibilitychange', () => { if (document.hidden) resetStick(); });
for (const [id, key] of [['jumpTouch', 'jump'], ['pickTouch', 'pick'], ['throwTouch', 'throw']]) { $(id).addEventListener('pointerdown', () => { touch[key] = true; }); $(id).addEventListener('pointerup', () => { touch[key] = false; }); $(id).addEventListener('pointercancel', () => { touch[key] = false; }); }
renderLeaderboard();
applySettings();
sounds.startMenuMusic();
if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
  $('installAppBtn').textContent = 'Aplicación instalada';
  $('installAppBtn').disabled = true;
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('/sw.js')
    .catch(error => console.error('No se pudo registrar el modo instalable de Blast Island.', error));
}
const resumeMenuMusic = () => {
  if (gameWrap.classList.contains('hidden')) sounds.startMenuMusic();
};
window.addEventListener('pointerdown', resumeMenuMusic);
window.addEventListener('keydown', resumeMenuMusic);
