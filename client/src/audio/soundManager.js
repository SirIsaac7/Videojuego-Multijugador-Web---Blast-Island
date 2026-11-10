export class SoundManager {
  constructor() { this.context = null; this.music = null; this.menuAudio = null; this.playlist = []; this.track = 0; this.menuTimer = null; this.menuStep = 0; this.volume = 0.7; }
  setVolume(value) { this.volume = Math.max(0, Math.min(1, Number(value))); if (this.music) this.music.volume = .35 * this.volume; if (this.menuAudio) this.menuAudio.volume = .24 * this.volume; }
  unlock() { if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)(); if (this.context.state === 'suspended') this.context.resume(); }
  effect(name) {
    this.unlock();
    const notes = { ui: [660, .06], join: [520, .08], pick: [720, .06], throw: [280, .09], blast: [95, .18], eliminate: [180, .16], lose: [125, .42], win: [880, .2], thunder: [58, .48], shield: [520, .2] };
    const [frequency, duration] = notes[name] || notes.ui;
    const oscillator = this.context.createOscillator(); const gain = this.context.createGain();
    oscillator.type = name === 'shield' ? 'sine' : name === 'blast' || name === 'thunder' || name === 'lose' ? 'sawtooth' : 'square'; oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(name === 'shield' ? 1040 : Math.max(35, frequency * .72), this.context.currentTime + duration);
    gain.gain.setValueAtTime((name === 'thunder' ? .045 : .07) * this.volume, this.context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination); oscillator.start(); oscillator.stop(this.context.currentTime + duration);
  }
  startMenuMusic() {
    if (this.menuTimer) { this.unlock(); return; }
    if (this.menuAudio) {
      if (this.menuAudio.paused) {
        const audio = this.menuAudio;
        audio.play().catch(error => {
          if (this.menuAudio === audio && error.name !== 'NotAllowedError') {
            console.error('No se pudo reproducir la música del menú.', error);
          }
        });
      }
      return;
    }
    const audio = new Audio('/audio/menu-theme.mp3');
    audio.loop = true;
    audio.volume = .24 * this.volume;
    this.menuAudio = audio;
    audio.addEventListener('error', () => {
      if (this.menuAudio !== audio) return;
      this.menuAudio = null;
      console.error('No se pudo cargar la música del menú en /audio/menu-theme.mp3.');
      this.startFallbackMenuMusic();
    }, { once: true });
    audio.play().catch(error => {
      if (this.menuAudio !== audio || audio.error) return;
      if (error.name === 'NotAllowedError') return;
      console.error('No se pudo reproducir la música del menú; se usará la melodía de respaldo.', error);
      this.menuAudio = null;
      this.startFallbackMenuMusic();
    });
  }
  startFallbackMenuMusic() {
    if (this.menuTimer) return;
    this.unlock();
    const melody = [220, 277.18, 329.63, 440, 329.63, 277.18, 246.94, 329.63];
    const playNote = () => {
      const oscillator = this.context.createOscillator(); const gain = this.context.createGain(); const frequency = melody[this.menuStep++ % melody.length];
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
      gain.gain.setValueAtTime(.018 * this.volume, this.context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, this.context.currentTime + .62);
      oscillator.connect(gain).connect(this.context.destination); oscillator.start(); oscillator.stop(this.context.currentTime + .64);
    };
    playNote(); this.menuTimer = window.setInterval(playNote, 480);
  }
  stopMenuMusic() {
    if (this.menuTimer) { window.clearInterval(this.menuTimer); this.menuTimer = null; }
    if (this.menuAudio) {
      const audio = this.menuAudio;
      this.menuAudio = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }
  startPlaylist(files = []) { this.stopMenuMusic(); this.stopMusic(); this.playlist = files.filter(Boolean); this.track = 0; if (this.playlist.length) this.playTrack(); }
  playTrack() { this.music = new Audio(this.playlist[this.track]); this.music.volume = .35 * this.volume; this.music.addEventListener('ended', () => { this.track = (this.track + 1) % this.playlist.length; this.playTrack(); }); this.music.addEventListener('error', () => { this.track = (this.track + 1) % this.playlist.length; if (this.playlist.length > 1) this.playTrack(); }); this.music.play().catch(() => {}); }
  pauseMusic() { this.music?.pause(); }
  resumeMusic() { if (this.music?.paused) this.music.play().catch(() => {}); }
  stopMusic() { if (this.music) { this.music.pause(); this.music.src = ''; this.music = null; } }
}
