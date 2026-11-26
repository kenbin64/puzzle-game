import { reactions } from './reactions.mjs';

export function installGameExperience(game) {
  const media = new URL(`${game}/`, import.meta.url).href;
  const sharedScore = ['dots-and-boxes', 'puzzlemaker', 'cubicles'].includes(game);
  const inviteGame = sharedScore;
  const guide = media + 'guide.html';
  const preference = 'bfx-music-off:' + game;
  const seen = 'bfx-intro-seen:' + game;
  const storage = (store, key, value) => {
    try {
      if (value !== undefined) store.setItem(key, value);
      return store.getItem(key);
    } catch { return null; }
  };
  let muted = storage(localStorage, preference) === '1';
  if (game === 'fasttrack') {
    try { muted ||= JSON.parse(sessionStorage.getItem('kg_session') || '{}').music_off === true; } catch {}
  }
  let hasTable = false;
  let localChoice = false;
  const audio = sharedScore ? new Audio(media + 'score.mp3') : null;
  if (audio) { audio.preload = 'none'; audio.volume = 0.32; }
  const toolbar = document.createElement('nav');
  toolbar.className = 'bfx-tools';
  toolbar.dataset.game = game;
  toolbar.setAttribute('aria-label', 'Game controls');
  toolbar.innerHTML = `
    <img src="${media}logo.svg" alt="">
    <a class="bfx-tool" href="${guide}" target="_blank" rel="noopener" title="Rules, gameplay and credits" aria-label="Rules, gameplay and credits">?</a>
    ${sharedScore ? '<button class="bfx-tool" type="button" data-music></button>' : ''}
    ${inviteGame ? '<button class="bfx-tool" type="button" data-emoji title="Emoji Reactions" aria-label="Emoji Reactions" aria-expanded="false" hidden>🙂</button><div class="bfx-picker" aria-label="Emoji reactions" hidden></div>' : ''}`;
  document.body.append(toolbar);
  const musicButton = toolbar.querySelector('[data-music]');
  const emoji = toolbar.querySelector('[data-emoji]');
  const tray = toolbar.querySelector('.bfx-picker');
  const feed = document.createElement('div');
  feed.className = 'bfx-reactions';
  feed.setAttribute('aria-live', 'polite');
  document.body.append(feed);

  const intro = document.createElement('dialog');
  intro.className = 'bfx-intro';
  intro.setAttribute('aria-label', 'Game introduction');
  intro.innerHTML = `<video playsinline preload="none" poster="${media}shot-1.webp"></video>
    <footer><button type="button" data-intro-music></button><button type="button" autofocus data-enter>Skip intro</button></footer>`;
  document.body.append(intro);
  const video = intro.querySelector('video');
  const introMusic = intro.querySelector('[data-intro-music]');
  function updateMusic() {
    const label = muted ? 'Music off' : 'Music on';
    video.muted = muted || !localChoice;
    introMusic.textContent = muted || video.muted ? 'Enable music' : 'Mute music';
    if (musicButton) {
      musicButton.textContent = muted ? '🔇' : '🎵';
      musicButton.setAttribute('aria-label', label + ' on this device');
      musicButton.title = label + ' on this device';
      musicButton.setAttribute('aria-pressed', String(!muted));
    }
    if (!audio) return;
    if (muted || intro.open) audio.pause();
    else audio.play().catch(() => {});
  }

  function chooseMusic(value) {
    muted = value;
    localChoice = true;
    storage(localStorage, preference, muted ? '1' : '0');
    updateMusic();
  }
  if (musicButton) musicButton.onclick = () => {
    if (!muted && audio.ended) { audio.currentTime = 0; updateMusic(); return; }
    chooseMusic(!muted);
  };
  introMusic.onclick = () => chooseMusic(!(muted || video.muted));
  intro.querySelector('[data-enter]').onclick = () => intro.close();
  video.onended = () => intro.close();
  video.onerror = () => intro.close();
  intro.addEventListener('close', () => {
    video.pause();
    updateMusic();
  });
  window.addEventListener('pointerdown', () => {
    if (!intro.open && audio?.paused && !audio.ended) updateMusic();
  }, { passive: true });

  function showIntro() {
    if (storage(sessionStorage, seen) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    storage(sessionStorage, seen, '1');
    video.src = media + 'intro.mp4';
    video.muted = true;
    intro.showModal();
    updateMusic();
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
  }

  if (tray) {
    const hideTray = () => { tray.hidden = true; emoji.setAttribute('aria-expanded', 'false'); };
    emoji.onclick = () => { tray.hidden = !tray.hidden; emoji.setAttribute('aria-expanded', String(!tray.hidden)); };
    for (const reaction of reactions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = reaction.emoji;
      button.title = reaction.label;
      button.setAttribute('aria-label', reaction.label);
      button.onclick = () => {
        window.dispatchEvent(new CustomEvent('bfx:send-reaction', { detail: reaction.id }));
        hideTray();
        emoji.focus();
      };
      tray.append(button);
    }
    document.addEventListener('pointerdown', event => { if (!toolbar.contains(event.target)) hideTray(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTray(); });
    window.addEventListener('bfx:reaction', ({ detail }) => {
      const reaction = reactions.find(item => item.id === detail.id);
      if (!reaction) return;
      const toast = document.createElement('div');
      toast.textContent = `${reaction.emoji} ${detail.name} · ${reaction.label}`;
      feed.append(toast);
      while (feed.children.length > 3) feed.firstElementChild.remove();
      setTimeout(() => toast.remove(), 4400);
    });
  }

  window.addEventListener('bfx:table-start', ({ detail }) => {
    if (hasTable) return;
    hasTable = true;
    muted = detail.musicOff === true;
    localChoice = true;
    if (emoji) { emoji.hidden = false; emoji.style.display = ''; }
    showIntro();
    updateMusic();
  });
  if (emoji) emoji.style.display = 'none';
  const query = new URLSearchParams(location.search);
  if ((game === 'fasttrack' && location.pathname.endsWith('/3d.html')) || (!query.has('code') && !query.has('table'))) showIntro();
  updateMusic();
}

const entry = document.querySelector('script[data-bfx-game]');
if (entry) installGameExperience(entry.dataset.bfxGame);
