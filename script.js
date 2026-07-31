/*
 * Camada de armazenamento compatível com navegador comum.
 * Mantém a mesma interface usada pelo projeto original:
 * window.storage.get(chave) e window.storage.set(chave, valor).
 *
 * Nesta Sprint 1, os dados ficam salvos somente neste navegador.
 * A sincronização entre duas pessoas será adicionada depois com Firebase.
 */
if (!window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(key);
      return value === null ? null : { value };
    },
    async set(key, value) {
      localStorage.setItem(key, String(value));
      return { value: String(value) };
    },
    async delete(key) {
      localStorage.removeItem(key);
    }
  };
}

const STORAGE_KEY = 'anime-list-items';
let items = [];
let filter = 'all';
let searchTerm = '';
let sortMode = 'priority';
let pendingDeleteId = null;
let draggedId = null;
let myName = '';
const NAME_KEY = 'my-name';
const PROFILES_KEY = 'shared-profiles';
const PHOTOS_KEY = 'profile-photos';
let profiles = [];
let photos = {};
let pendingProfile = null;
let pendingPhotoDataUrl = null;
let selectedAnime = null;
let animeSearchTimer = null;
let animeSearchRequest = 0;
let activeAnimeSearchTerm = '';

async function loadProfiles() {
  try {
    const result = await window.storage.get(PROFILES_KEY, true);
    profiles = result ? JSON.parse(result.value) : [];
  } catch (e) {
    profiles = [];
  }
  try {
    const result = await window.storage.get(PHOTOS_KEY, true);
    photos = result ? JSON.parse(result.value) : {};
  } catch (e) {
    photos = {};
  }
}

async function savePhoto(name, dataUrl) {
  photos[name] = dataUrl;
  try {
    await window.storage.set(PHOTOS_KEY, JSON.stringify(photos), true);
  } catch (e) {}
}

function resizeImageFile(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function nameColor(name) {
  const colors = ['#a78bfa', '#f4b942', '#d4537e', '#5dcaa5', '#f0997b'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

function createAvatarEl(name, photoUrl, sizeClass) {
  if (photoUrl) {
    const img = document.createElement('img');
    img.className = 'avatar' + (sizeClass ? ' ' + sizeClass : '');
    img.src = photoUrl;
    img.alt = name;
    return img;
  }
  const div = document.createElement('div');
  div.className = 'avatar' + (sizeClass ? ' ' + sizeClass : '');
  div.style.background = nameColor(name);
  div.textContent = getInitials(name);
  return div;
}

async function addProfile(name) {
  if (!profiles.includes(name)) {
    profiles.push(name);
    try {
      await window.storage.set(PROFILES_KEY, JSON.stringify(profiles), true);
    } catch (e) {}
  }
}

async function loadMyName() {
  try {
    const result = await window.storage.get(NAME_KEY, false);
    myName = result ? result.value : '';
  } catch (e) {
    myName = '';
  }
  await loadProfiles();
  renderNameSection();
}

async function saveMyName(name) {
  myName = name;
  try {
    await window.storage.set(NAME_KEY, name, false);
  } catch (e) {}
  renderNameSection();
}

function renderNameSection() {
  const section = document.getElementById('nameSection');
  section.innerHTML = '';
  section.className = myName ? 'name-section' : 'name-section profile-picker';

  if (myName) {
    const avatar = createAvatarEl(myName, photos[myName]);
    avatar.classList.add('avatar-clickable');
    avatar.title = 'Trocar foto';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.onchange = async () => {
      if (!fileInput.files[0]) return;
      const dataUrl = await resizeImageFile(fileInput.files[0], 160);
      await savePhoto(myName, dataUrl);
      renderNameSection();
    };
    avatar.onclick = () => fileInput.click();

    const span = document.createElement('span');
    span.innerHTML = 'Você é <span class="name-display"></span>';
    span.querySelector('.name-display').textContent = myName;
    const changeBtn = document.createElement('button');
    changeBtn.className = 'name-change';
    changeBtn.textContent = 'trocar perfil';
    changeBtn.onclick = () => { myName = ''; pendingProfile = null; renderNameSection(); };
    section.appendChild(avatar);
    section.appendChild(fileInput);
    section.appendChild(span);
    section.appendChild(changeBtn);
    return;
  }

  if (pendingProfile) {
    const wrap = document.createElement('div');
    wrap.className = 'profile-confirm';
    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'center';
    topRow.style.gap = '10px';
    const avatar = createAvatarEl(pendingProfile, photos[pendingProfile]);
    const text = document.createElement('div');
    text.className = 'profile-confirm-text';
    text.innerHTML = 'Você está selecionando o perfil <span class="name-display"></span>, continuar?';
    text.querySelector('.name-display').textContent = pendingProfile;
    topRow.appendChild(avatar);
    topRow.appendChild(text);
    const actions = document.createElement('div');
    actions.className = 'profile-confirm-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'primary';
    confirmBtn.textContent = 'Sim, sou eu';
    confirmBtn.onclick = () => { const name = pendingProfile; pendingProfile = null; saveMyName(name); };
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'secondary';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.onclick = () => { pendingProfile = null; renderNameSection(); };
    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    wrap.appendChild(topRow);
    wrap.appendChild(actions);
    section.appendChild(wrap);
    return;
  }

  const title = document.createElement('div');
  title.className = 'profile-picker-title';
  title.textContent = profiles.length
    ? 'Quem é você?'
    : 'Ninguém criou um perfil ainda. Crie o seu:';
  section.appendChild(title);

  if (profiles.length) {
    const options = document.createElement('div');
    options.className = 'profile-options';
    profiles.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'profile-btn';
      const avatar = createAvatarEl(name, photos[name], 'avatar-sm');
      avatar.style.width = '26px';
      avatar.style.height = '26px';
      avatar.style.fontSize = '11px';
      const label = document.createElement('span');
      label.textContent = name;
      btn.appendChild(avatar);
      btn.appendChild(label);
      btn.onclick = () => { pendingProfile = name; renderNameSection(); };
      options.appendChild(btn);
    });
    section.appendChild(options);
  }

  const newRow = document.createElement('div');
  newRow.className = 'profile-new';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Criar novo perfil';
  input.maxLength = 40;
  const btn = document.createElement('button');
  btn.className = 'primary';
  btn.textContent = 'Criar';
  const submit = async () => {
    const val = input.value.trim();
    if (!val) return;
    await addProfile(val);
    if (pendingPhotoDataUrl) {
      await savePhoto(val, pendingPhotoDataUrl);
      pendingPhotoDataUrl = null;
    }
    await saveMyName(val);
  };
  btn.onclick = submit;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  newRow.appendChild(input);
  newRow.appendChild(btn);
  section.appendChild(newRow);

  const photoRow = document.createElement('div');
  photoRow.className = 'photo-upload-row';
  const previewAvatar = createAvatarEl('?', pendingPhotoDataUrl);
  const photoFileInput = document.createElement('input');
  photoFileInput.type = 'file';
  photoFileInput.accept = 'image/*';
  const pickBtn = document.createElement('button');
  pickBtn.className = 'photo-pick-btn';
  pickBtn.textContent = pendingPhotoDataUrl ? 'Trocar foto' : 'Adicionar foto (opcional)';
  pickBtn.onclick = () => photoFileInput.click();
  photoFileInput.onchange = async () => {
    if (!photoFileInput.files[0]) return;
    pendingPhotoDataUrl = await resizeImageFile(photoFileInput.files[0], 160);
    renderNameSection();
  };
  photoRow.appendChild(previewAvatar);
  photoRow.appendChild(photoFileInput);
  photoRow.appendChild(pickBtn);
  section.appendChild(photoRow);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getAvailableEpisodes(item) {
  if (typeof item.availableEps === 'number' && item.availableEps > 0) return item.availableEps;
  if (typeof item.totalEps === 'number' && item.totalEps > 0) return item.totalEps;
  return null;
}

function getStatus(item) {
  const current = Number(item.currentEp) || 0;
  const available = getAvailableEpisodes(item);
  const isFinished = item.anilistStatus === 'FINISHED';

  if (!item.anilistStatus && item.watched) return 'watched';
  if (isFinished && available && current >= available) return 'watched';
  if (!isFinished && available && current >= available && current > 0) return 'upToDate';
  if (current > 0) return 'watching';
  return 'pending';
}

function getStatusLabel(item) {
  const status = getStatus(item);
  if (status === 'watched') return 'Concluído';
  if (status === 'upToDate') return 'Em dia';
  if (status === 'watching') return 'Assistindo';
  return 'Para assistir';
}

function getNewEpisodeCount(item) {
  const available = getAvailableEpisodes(item);
  const caughtUpAt = Number(item.caughtUpAvailableEps) || 0;
  const current = Number(item.currentEp) || 0;
  const isReleasing = item.anilistStatus === 'RELEASING';

  if (!isReleasing || !available || !caughtUpAt) return 0;
  if (available <= caughtUpAt || current >= available) return 0;
  return Math.max(0, available - current);
}

function getNextAiringInfo(item) {
  const airingAt = Number(item.nextAiringAt) || 0;
  if (!airingAt) {
    return {
      relative: 'Data prevista para o próximo episódio ainda não definida',
      exact: '',
      urgency: 'unknown'
    };
  }

  const target = airingAt * 1000;
  const diff = target - Date.now();
  const absDiff = Math.max(0, diff);
  const hours = Math.ceil(absDiff / 3600000);
  const days = Math.ceil(absDiff / 86400000);

  let relative;
  let urgency;

  if (diff <= 0) {
    relative = 'O próximo episódio já deve estar disponível';
    urgency = 'now';
  } else if (hours <= 1) {
    relative = 'Novo episódio em menos de 1 hora';
    urgency = 'now';
  } else if (hours < 12) {
    relative = `Novo episódio em ${hours} horas`;
    urgency = 'urgent';
  } else if (hours < 24) {
    relative = 'Novo episódio ainda hoje';
    urgency = 'soon';
  } else if (hours < 48) {
    relative = 'Novo episódio amanhã';
    urgency = 'soon';
  } else {
    relative = `Novo episódio em ${days} dias`;
    urgency = days <= 7 ? 'medium' : 'far';
  }

  const exact = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(target));

  return { relative, exact: `Previsto para ${exact}`, urgency };
}


async function loadItems() {
  const statusEl = document.getElementById('status');
  try {
    const result = await window.storage.get(STORAGE_KEY, true);
    items = result ? JSON.parse(result.value) : [];
    items.forEach(i => {
      if (typeof i.currentEp !== 'number') i.currentEp = 0;
      if (typeof i.totalEps !== 'number') i.totalEps = null;
      if (typeof i.availableEps !== 'number') i.availableEps = i.totalEps;
      if (typeof i.nextAiringEpisode !== 'number') i.nextAiringEpisode = null;
      if (typeof i.nextAiringAt !== 'number') i.nextAiringAt = null;
      if (typeof i.episodesUpdatedAt !== 'number') i.episodesUpdatedAt = null;
      if (typeof i.caughtUpAvailableEps !== 'number') {
        const available = getAvailableEpisodes(i);
        i.caughtUpAvailableEps = i.anilistStatus === 'RELEASING' && available && (Number(i.currentEp) || 0) >= available
          ? available
          : null;
      }
      if (typeof i.suggestedBy !== 'string') i.suggestedBy = '';
      if (typeof i.watchedAt !== 'number') i.watchedAt = null;
      if (typeof i.note !== 'string') i.note = '';
      if (typeof i.favorite !== 'boolean') i.favorite = false;
      if (typeof i.addedAt !== 'number') i.addedAt = Date.now();
      if (!i.titles || typeof i.titles !== 'object') i.titles = { english: null, romaji: i.name || null, native: null };
      if (typeof i.poster !== 'string') i.poster = null;
      if (typeof i.banner !== 'string') i.banner = null;
      if (typeof i.synopsis !== 'string') i.synopsis = '';
      if (!Array.isArray(i.genres)) i.genres = [];
      if (!Array.isArray(i.studios)) i.studios = i.studio ? [i.studio] : [];
      if (typeof i.studio !== 'string') i.studio = i.studios[0] || null;
      if (typeof i.score !== 'number') i.score = null;
      if (typeof i.year !== 'number') i.year = null;
      if (typeof i.season !== 'string') i.season = null;
      if (typeof i.seasonLabel !== 'string') i.seasonLabel = formatAnimeSeason(i.season);
      if (typeof i.anilistStatus !== 'string') i.anilistStatus = null;
      if (typeof i.releaseStatus !== 'string') i.releaseStatus = formatAnimeStatus(i.anilistStatus);
      if (i.trailer && typeof i.trailer === 'object' && !i.trailer.url) i.trailer.url = buildTrailerUrl(i.trailer);
    });
  } catch (e) {
    items = [];
  }
  statusEl.textContent = 'Dados salvos neste navegador. A sincronização compartilhada será ativada em uma próxima etapa.';
  render();
  refreshAniListEpisodeData();
}

async function saveItems() {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(items), true);
  } catch (e) {
    document.getElementById('status').textContent = 'Não consegui salvar agora. Tenta de novo.';
  }
}

function renderStats() {
  const bar = document.getElementById('statsBar');
  bar.innerHTML = '';
  if (items.length === 0) return;

  const watchedCount = items.filter(i => getStatus(i) === 'watched').length;
  const upToDateCount = items.filter(i => getStatus(i) === 'upToDate').length;
  const watchingCount = items.filter(i => getStatus(i) === 'watching').length;
  const pendingCount = items.filter(i => getStatus(i) === 'pending').length;
  const favoriteCount = items.filter(i => i.favorite).length;
  const episodesWatched = items.reduce((sum, i) => sum + (i.currentEp || 0), 0);
  const estimatedHours = Math.round((episodesWatched * 24) / 60);

  const stats = [
    { num: items.length, label: 'Na lista' },
    { num: watchedCount, label: 'Concluídos' },
    { num: upToDateCount, label: 'Em dia' },
    { num: watchingCount, label: 'Assistindo' },
    { num: pendingCount, label: 'Na fila' },
    { num: favoriteCount, label: 'Favoritos' },
    { num: estimatedHours + 'h', label: 'Tempo estimado' },
  ];

  stats.forEach(s => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    const num = document.createElement('div');
    num.className = 'stat-num';
    num.textContent = s.num;
    const label = document.createElement('div');
    label.className = 'stat-label';
    label.textContent = s.label;
    card.appendChild(num);
    card.appendChild(label);
    bar.appendChild(card);
  });
}

function renderContinueCard() {
  const card = document.getElementById('continueCard');
  const watching = items
    .filter(i => getNewEpisodeCount(i) > 0)
    .sort((a, b) => getNewEpisodeCount(b) - getNewEpisodeCount(a) || (b.episodesUpdatedAt || 0) - (a.episodesUpdatedAt || 0))[0];

  if (!watching) {
    card.hidden = true;
    card.dataset.id = '';
    return;
  }

  const available = getAvailableEpisodes(watching);
  const newEpisodes = getNewEpisodeCount(watching);
  const pct = available
    ? Math.min(100, Math.round((watching.currentEp / available) * 100))
    : 0;

  card.hidden = false;
  card.dataset.id = watching.id;
  document.getElementById('continueName').textContent = watching.name;
  document.getElementById('continueInfo').textContent = newEpisodes === 1
    ? `Saiu 1 episódio novo. Você está no episódio ${watching.currentEp} de ${available} disponíveis.`
    : `Saíram ${newEpisodes} episódios novos. Você está no episódio ${watching.currentEp} de ${available} disponíveis.`;
  document.getElementById('continueProgress').style.width = pct + '%';
  document.getElementById('continuePct').textContent = pct + '%';
  const continueBtn = document.getElementById('continueBtn');
  continueBtn.textContent = newEpisodes === 1 ? '▶ Assistir novo episódio' : `▶ Assistir próximo (${newEpisodes} pendentes)`;

  const continueCover = document.getElementById('continueCover');
  const animeArt = getAnimeArt(watching.name, watching);
  continueCover.textContent = animeArt?.poster ? '' : getInitials(watching.name);
  continueCover.style.backgroundImage = animeArt?.poster
    ? `linear-gradient(rgba(10, 7, 16, 0.08), rgba(10, 7, 16, 0.35)), url("${animeArt.poster}")`
    : `linear-gradient(145deg, ${nameColor(watching.name)}, color-mix(in srgb, ${nameColor(watching.name)} 58%, #16121f 42%))`;
  continueCover.style.backgroundSize = animeArt?.poster ? 'cover' : '';
  continueCover.style.backgroundPosition = animeArt?.poster ? 'center' : '';
  card.style.setProperty('--continue-accent', animeArt?.accent || nameColor(watching.name));
  card.classList.toggle('has-anime-art', Boolean(animeArt));
}


function renderDashboard() {
  const watching = items.filter(i => ['watching', 'upToDate'].includes(getStatus(i))).length;
  const favorites = items.filter(i => i.favorite).length;
  const completed = items.filter(i => getStatus(i) === 'watched').length;

  document.getElementById('dashWatching').textContent = watching;
  document.getElementById('dashFavorites').textContent = favorites;
  document.getElementById('dashCompleted').textContent = completed;

  renderFavoriteShowcase();
}
/* Identidade visual local dos animes */
const ANIME_ART = {
  'frieren': {
    background: 'assets/covers/backgrounds/frieren.jpg',
    poster: 'assets/covers/posters/frieren.jpg',
    accent: '#78A8FF'
  },
  'one piece': {
    background: 'assets/covers/backgrounds/one-piece.jpg',
    poster: 'assets/covers/posters/one-piece.jpg',
    accent: '#E95F55'
  }
};

function normalizeAnimeName(name) {
  return name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getAnimeArt(name, item = null) {
  if (item && (item.poster || item.banner)) {
    return {
      poster: item.poster || null,
      background: item.banner || item.poster || null,
      accent: item.accent || '#7C4DFF'
    };
  }
  return ANIME_ART[normalizeAnimeName(name)] || null;
}

function posterGradient(name) {
  const base = nameColor(name);
  return {
    a: base,
    b: `color-mix(in srgb, ${base} 55%, #16121f 45%)`
  };
}

function renderFavoriteShowcase() {
  const section = document.getElementById('favoritesShowcase');
  const row = document.getElementById('favoritePosters');
  const favorites = items.filter(i => i.favorite).slice(0, 4);

  row.innerHTML = '';
  section.hidden = favorites.length === 0;

  favorites.forEach(item => {
    const card = document.createElement('article');
    card.className = 'poster-card';
    card.dataset.id = item.id;

    const art = document.createElement('div');
    art.className = 'poster-art';
    const animeArt = getAnimeArt(item.name, item);
    if (animeArt?.poster) {
      art.classList.add('has-image');
      art.style.backgroundImage = `url("${animeArt.poster}")`;
      art.style.setProperty('--poster-accent', animeArt.accent);
    } else {
      const gradient = posterGradient(item.name);
      art.style.setProperty('--poster-a', gradient.a);
      art.style.setProperty('--poster-b', gradient.b);
      art.textContent = getInitials(item.name);
    }

    const star = document.createElement('span');
    star.className = 'poster-star';
    star.textContent = '★';
    art.appendChild(star);

    const name = document.createElement('span');
    name.className = 'poster-name';
    name.textContent = item.name;

    card.appendChild(art);
    card.appendChild(name);
    card.onclick = () => focusAnimeCard(item.id);
    row.appendChild(card);
  });
}

function focusAnimeCard(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  filter = 'all';
  searchTerm = '';
  document.getElementById('searchBox').value = '';
  document.querySelectorAll('.filters button').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'all');
  });

  render();

  requestAnimationFrame(() => {
    const row = document.querySelector(`.item[data-id="${id}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('random-highlight');
    setTimeout(() => row.classList.remove('random-highlight'), 1300);
  });
}

function rotateHeroQuote() {
  const quotes = [
    'Cada episódio é uma nova história compartilhada.',
    'Toda grande maratona começa com um primeiro episódio.',
    'Boas histórias ficam ainda melhores quando são divididas.',
    'Sua próxima aventura pode estar a um clique de distância.',
    'Alguns mundos cabem em vinte e quatro minutos.'
  ];
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  document.getElementById('heroQuote').textContent = quote;
}

function getSortedItems(list) {
  const result = [...list];

  if (sortMode === 'name') {
    result.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  } else if (sortMode === 'progress') {
    result.sort((a, b) => {
      const pa = a.totalEps ? a.currentEp / a.totalEps : a.currentEp || 0;
      const pb = b.totalEps ? b.currentEp / b.totalEps : b.currentEp || 0;
      return pb - pa;
    });
  } else if (sortMode === 'recent') {
    result.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  } else if (sortMode === 'favorites') {
    result.sort((a, b) => Number(b.favorite) - Number(a.favorite));
  }

  return result;
}

let hasRenderedAnimeList = false;
let previousVisibleAnimeIds = new Set();

function render() {
  renderStats();
  renderContinueCard();
  renderDashboard();

  const list = document.getElementById('list');
  list.innerHTML = '';

  let visible = items;

  if (filter === 'favorites') {
    visible = visible.filter(i => i.favorite);
  } else if (filter !== 'all') {
    visible = visible.filter(i => getStatus(i) === filter);
  }

  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    visible = visible.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.note || '').toLowerCase().includes(q) ||
      (i.suggestedBy || '').toLowerCase().includes(q)
    );
  }

  visible = getSortedItems(visible);
  const currentVisibleAnimeIds = new Set(visible.map(item => String(item.id)));

  if (visible.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = items.length === 0
      ? 'Nenhum anime na lista ainda. Adicionem o primeiro acima.'
      : 'Nada por aqui nesse filtro.';
    list.appendChild(p);
    previousVisibleAnimeIds = currentVisibleAnimeIds;
    hasRenderedAnimeList = true;
    return;
  }

  visible.forEach((item, index) => {
    const status = getStatus(item);
    const animeArt = getAnimeArt(item.name, item);

    const row = document.createElement('div');
    row.className = 'item' + (status === 'watched' ? ' watched' : '');
    row.dataset.id = item.id;

    const isNewlyVisible = !previousVisibleAnimeIds.has(String(item.id));
    if (!hasRenderedAnimeList || isNewlyVisible) {
      row.classList.add('item-enter');
      row.style.setProperty('--item-enter-delay', `${Math.min(index, 7) * 38}ms`);
    }

    if (animeArt) {
      row.classList.add('has-cover');
      row.style.setProperty('--item-cover', `url("${animeArt.background}")`);
      row.style.setProperty('--anime-accent', animeArt.accent);
    }

    row.draggable = true;

    row.addEventListener('dragstart', () => {
      draggedId = item.id;
      row.classList.add('dragging');
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
    });

    row.addEventListener('dragover', event => {
      event.preventDefault();
      row.classList.add('drag-over');
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });

    row.addEventListener('drop', event => {
      event.preventDefault();
      row.classList.remove('drag-over');
      reorderItems(draggedId, item.id);
    });

    const cardLayout = document.createElement('div');
    cardLayout.className = 'anime-card-layout';

    let posterMeta = null;

    if (animeArt?.poster) {
      cardLayout.classList.add('has-poster');

      posterMeta = document.createElement('div');
      posterMeta.className = 'anime-card-poster-column';

      const poster = document.createElement('img');
      poster.className = 'anime-card-poster';
      poster.src = animeArt.poster;
      poster.alt = `Capa de ${item.name}`;
      poster.loading = 'lazy';

      posterMeta.appendChild(poster);
      cardLayout.appendChild(posterMeta);
    }

    const cardContent = document.createElement('div');
    cardContent.className = 'anime-card-content';

    const top = document.createElement('div');
    top.className = 'item-top';

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');

    const check = document.createElement('div');
    check.className = 'check' + (status === 'watched' ? ' on' : '');
    check.textContent = status === 'watched' ? '✓' : '';
    check.setAttribute('role', 'button');
    check.setAttribute('tabindex', '0');
    check.setAttribute('aria-label', status === 'watched'
      ? 'Marcar como não assistido'
      : 'Marcar como assistido'
    );
    check.onclick = () => toggleWatched(item.id);
    check.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleWatched(item.id);
      }
    };

    const nameWrap = document.createElement('div');
    nameWrap.className = 'name-wrap';

    const titleLine = document.createElement('div');
    titleLine.className = 'anime-title-line';

    const name = document.createElement('div');
    name.className = 'name' + (status === 'watched' ? ' watched' : '');
    name.textContent = item.name;
    titleLine.appendChild(name);

    const statusBadge = document.createElement('span');
    statusBadge.className = `anime-status-badge status-${status}`;
    statusBadge.textContent = getStatusLabel(item);
    titleLine.appendChild(statusBadge);
    nameWrap.appendChild(titleLine);

    const availableEpisodes = getAvailableEpisodes(item);
    const epInfo = document.createElement('div');
    epInfo.className = 'ep-info';
    epInfo.textContent = availableEpisodes
      ? `Ep. ${item.currentEp} de ${availableEpisodes} disponíveis`
      : `Ep. ${item.currentEp} · total desconhecido`;

    if (posterMeta) {
      posterMeta.appendChild(epInfo);
    } else {
      nameWrap.appendChild(epInfo);
    }

    if (status === 'upToDate' && item.anilistStatus === 'RELEASING') {
      const airingInfo = getNextAiringInfo(item);
      const nextAiring = document.createElement('div');
      nextAiring.className = `next-airing next-airing-${airingInfo.urgency}`;

      const countdown = document.createElement('strong');
      countdown.textContent = `⏳ ${airingInfo.relative}`;
      nextAiring.appendChild(countdown);

      if (airingInfo.exact) {
        const date = document.createElement('span');
        date.textContent = `📅 ${airingInfo.exact}`;
        nextAiring.appendChild(date);
      }

      nameWrap.appendChild(nextAiring);
    }

    if (item.suggestedBy) {
      const suggester = document.createElement('div');
      suggester.className = 'suggester';

      const avatar = createAvatarEl(
        item.suggestedBy,
        photos[item.suggestedBy],
        'avatar-sm'
      );

      suggester.appendChild(avatar);
      suggester.appendChild(
        document.createTextNode(`Sugerido por ${item.suggestedBy}`)
      );
      nameWrap.appendChild(suggester);
    }

    if (status === 'watched' && item.watchedAt) {
      const watchedDate = document.createElement('div');
      watchedDate.className = 'watched-date';
      watchedDate.textContent = `Assistido em ${formatDate(item.watchedAt)}`;
      nameWrap.appendChild(watchedDate);
    }

    if (item.note) {
      const noteEl = document.createElement('div');
      noteEl.className = 'note';
      noteEl.textContent = item.note;
      noteEl.title = 'Clique para editar';
      noteEl.onclick = () => startEditNote(item.id, noteEl);
      nameWrap.appendChild(noteEl);
    } else {
      const addNote = document.createElement('span');
      addNote.className = 'note-add-link';
      addNote.textContent = '+ nota';
      addNote.onclick = () => startEditNote(item.id, addNote);
      nameWrap.appendChild(addNote);
    }

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const favorite = document.createElement('button');
    favorite.className = 'favorite-btn' + (item.favorite ? ' on' : '');
    favorite.textContent = item.favorite ? '★' : '☆';
    favorite.setAttribute(
      'aria-label',
      item.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
    );
    favorite.title = item.favorite
      ? 'Remover dos favoritos'
      : 'Adicionar aos favoritos';
    favorite.onclick = () => toggleFavorite(item.id);

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Remover');
    del.onclick = () => handleDeleteClick(item.id);

    actions.appendChild(favorite);
    actions.appendChild(del);

    top.appendChild(handle);
    top.appendChild(check);
    top.appendChild(nameWrap);
    top.appendChild(actions);

    const stamp = document.createElement('div');
    stamp.className = 'stamp';
    stamp.textContent = 'VISTO';

    cardContent.appendChild(top);
    cardContent.appendChild(stamp);

    {
      const available = getAvailableEpisodes(item);
      const pct = available
        ? Math.min(100, Math.round((item.currentEp / available) * 100))
        : 0;

      if (available) {
        const progressWrap = document.createElement('div');
        progressWrap.className = 'progress-wrap';

        const track = document.createElement('div');
        track.className = 'bar-track';

        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = pct + '%';

        track.appendChild(fill);

        const pctLabel = document.createElement('div');
        pctLabel.className = 'pct';
        pctLabel.textContent = pct + '%';

        progressWrap.appendChild(track);
        progressWrap.appendChild(pctLabel);
        cardContent.appendChild(progressWrap);
      }

      const epControls = document.createElement('div');
      epControls.className = 'ep-controls';

      const stepper = document.createElement('div');
      stepper.className = 'stepper';

      const minus = document.createElement('button');
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'Episódio anterior');
      minus.onclick = () => setEpisode(item.id, item.currentEp - 1);

      const epInput = document.createElement('input');
      epInput.type = 'number';
      epInput.className = 'episode-input';
      epInput.min = '0';
      if (available) epInput.max = String(available);
      epInput.value = String(item.currentEp || 0);
      epInput.setAttribute('aria-label', `Episódio atual de ${item.name}`);
      epInput.title = 'Clique e digite o episódio atual';
      const commitEpisode = () => {
        const value = Number.parseInt(epInput.value, 10);
        setEpisode(item.id, Number.isFinite(value) ? value : item.currentEp);
      };
      epInput.addEventListener('change', commitEpisode);
      epInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          epInput.blur();
        }
      });

      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'Assisti mais um episódio');
      plus.disabled = Boolean(available && item.currentEp >= available);
      plus.onclick = () => setEpisode(item.id, item.currentEp + 1);

      stepper.appendChild(minus);
      stepper.appendChild(epInput);
      stepper.appendChild(plus);

      epControls.appendChild(stepper);
      cardContent.appendChild(epControls);
    }

    cardLayout.appendChild(cardContent);
    row.appendChild(cardLayout);
    list.appendChild(row);
  });

  previousVisibleAnimeIds = currentVisibleAnimeIds;
  hasRenderedAnimeList = true;
}

function startEditNote(id, triggerEl) {
  const target = items.find(i => i.id === id);
  if (!target) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'note-edit';
  input.maxLength = 140;
  input.value = target.note || '';
  input.placeholder = 'ex: assistir dublado';
  triggerEl.replaceWith(input);
  input.focus();
  input.select();
  const save = async () => {
    target.note = input.value.trim();
    render();
    await saveItems();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { render(); }
  });
}

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

function stripHtml(text = '') {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return (doc.body.textContent || '').trim();
}

function normalizeAnimeTitle(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, ' ')
    .trim();
}

function animeTitle(media, searchTerm = activeAnimeSearchTerm) {
  const query = normalizeAnimeTitle(searchTerm);
  const candidates = [
    ...(Array.isArray(media.synonyms) ? media.synonyms : []),
    media.title?.english,
    media.title?.romaji,
    media.title?.userPreferred,
    media.title?.native
  ].filter(Boolean);

  if (query) {
    const exactMatch = candidates.find(title => normalizeAnimeTitle(title) === query);
    if (exactMatch) return exactMatch;

    const startsWithMatch = candidates.find(title => normalizeAnimeTitle(title).startsWith(query));
    if (startsWithMatch) return startsWithMatch;
  }

  return media.title?.english
    || media.title?.userPreferred
    || media.title?.romaji
    || media.title?.native
    || candidates[0]
    || 'Anime sem título';
}

function formatAnimeStatus(status) {
  const labels = { FINISHED: 'Finalizado', RELEASING: 'Em exibição', NOT_YET_RELEASED: 'Ainda não lançado', CANCELLED: 'Cancelado', HIATUS: 'Em pausa' };
  return labels[status] || status || 'Status desconhecido';
}

function formatAnimeSeason(season) {
  const labels = { WINTER: 'Inverno', SPRING: 'Primavera', SUMMER: 'Verão', FALL: 'Outono' };
  return labels[season] || season || null;
}

function buildTrailerUrl(trailer) {
  if (!trailer?.id || !trailer?.site) return null;
  const site = trailer.site.toLowerCase();
  if (site === 'youtube') return `https://www.youtube.com/watch?v=${trailer.id}`;
  if (site === 'dailymotion') return `https://www.dailymotion.com/video/${trailer.id}`;
  return null;
}

async function refreshAniListEpisodeData() {
  const ids = items.map(item => item.anilistId).filter(Number.isFinite);
  if (!ids.length) return;

  const query = `
    query ($ids: [Int]) {
      Page(page: 1, perPage: 50) {
        media(id_in: $ids, type: ANIME) {
          id
          episodes
          status
          nextAiringEpisode { episode airingAt }
        }
      }
    }`;

  try {
    const response = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { ids } })
    });
    if (!response.ok) return;
    const payload = await response.json();
    const mediaList = payload.data?.Page?.media || [];
    let changed = false;

    mediaList.forEach(media => {
      const item = items.find(entry => entry.anilistId === media.id);
      if (!item) return;
      const previousAvailable = getAvailableEpisodes(item);
      const wasUpToDate = getStatus(item) === 'upToDate';
      if (wasUpToDate && previousAvailable) item.caughtUpAvailableEps = previousAvailable;
      const nextEpisode = media.nextAiringEpisode?.episode || null;
      const nextAiringAt = media.nextAiringEpisode?.airingAt || null;
      const calculatedAvailable = nextEpisode && nextEpisode > 1 ? nextEpisode - 1 : null;
      const available = media.status === 'RELEASING'
        ? (calculatedAvailable || media.episodes || item.totalEps || null)
        : (media.episodes || item.totalEps || calculatedAvailable || null);

      if (item.anilistStatus !== media.status) changed = true;
      if (item.totalEps !== (media.episodes || item.totalEps || null)) changed = true;
      if (item.availableEps !== available) changed = true;
      if (item.nextAiringEpisode !== nextEpisode) changed = true;
      if (item.nextAiringAt !== nextAiringAt) changed = true;

      item.anilistStatus = media.status || item.anilistStatus;
      item.releaseStatus = formatAnimeStatus(item.anilistStatus);
      if (media.episodes) item.totalEps = media.episodes;
      item.availableEps = available;
      item.nextAiringEpisode = nextEpisode;
      item.nextAiringAt = nextAiringAt;
      item.episodesUpdatedAt = Date.now();

      const currentStatus = getStatus(item);
      item.watched = currentStatus === 'watched';
      if (currentStatus !== 'watched') item.watchedAt = null;
      if (currentStatus === 'upToDate' && available) item.caughtUpAvailableEps = available;

      if (previousAvailable && available && available > previousAvailable && item.currentEp < available) {
        changed = true;
      }
    });

    if (changed) {
      render();
      await saveItems();
      showToast('Episódios disponíveis atualizados pelo AniList.');
    }
  } catch (error) {
    console.warn('Não foi possível atualizar os episódios agora.', error);
  }
}

async function searchAniList(search) {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title { romaji english native userPreferred }
          synonyms
          coverImage { large extraLarge color }
          bannerImage
          description(asHtml: false)
          episodes
          genres
          averageScore
          season
          seasonYear
          status
          studios(isMain: true) { nodes { name } }
          trailer { id site thumbnail }
          nextAiringEpisode { episode airingAt }
        }
      }
    }`;
  const response = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { search } })
  });
  if (!response.ok) throw new Error(`AniList respondeu com status ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors[0].message);
  return payload.data?.Page?.media || [];
}

function clearAnimeSelection() {
  selectedAnime = null;
}

function isAnimeSaved(media) {
  return items.some(item => item.anilistId === media.id);
}

async function addAnimeFromResult(media, button) {
  if (isAnimeSaved(media)) return;

  const nextEpisode = media.nextAiringEpisode?.episode || null;
  const nextAiringAt = media.nextAiringEpisode?.airingAt || null;
  const calculatedAvailable = nextEpisode && nextEpisode > 1 ? nextEpisode - 1 : null;
  const totalEps = media.episodes || calculatedAvailable || null;
  const availableEps = media.status === 'RELEASING'
    ? (calculatedAvailable || media.episodes || totalEps)
    : (media.episodes || totalEps);
  const note = '';
  const title = animeTitle(media, activeAnimeSearchTerm);

  items.push({
    id: uid(),
    anilistId: media.id,
    name: title,
    titles: {
      english: media.title?.english || null,
      romaji: media.title?.romaji || null,
      native: media.title?.native || null,
      preferred: media.title?.userPreferred || null,
      synonyms: Array.isArray(media.synonyms) ? media.synonyms : []
    },
    poster: media.coverImage?.extraLarge || media.coverImage?.large || null,
    banner: media.bannerImage || null,
    accent: media.coverImage?.color || '#7C4DFF',
    synopsis: stripHtml(media.description || ''),
    genres: Array.isArray(media.genres) ? media.genres : [],
    score: typeof media.averageScore === 'number' ? media.averageScore : null,
    studios: media.studios?.nodes?.map(studio => studio.name).filter(Boolean) || [],
    studio: media.studios?.nodes?.[0]?.name || null,
    year: media.seasonYear || null,
    season: media.season || null,
    seasonLabel: formatAnimeSeason(media.season),
    anilistStatus: media.status || null,
    releaseStatus: formatAnimeStatus(media.status),
    trailer: media.trailer ? {
      id: media.trailer.id || null,
      site: media.trailer.site || null,
      thumbnail: media.trailer.thumbnail || null,
      url: buildTrailerUrl(media.trailer)
    } : null,
    totalEps,
    availableEps,
    nextAiringEpisode: nextEpisode,
    nextAiringAt,
    episodesUpdatedAt: Date.now(),
    currentEp: 0,
    watched: false,
    watchedAt: null,
    suggestedBy: myName,
    note,
    favorite: false,
    addedAt: Date.now()
  });

  button.textContent = 'Salvo na sua lista';
  button.disabled = true;
  button.classList.add('is-saved');

  const searchInput = document.getElementById('newName');
  const searchResults = document.getElementById('animeSearchResults');
  searchInput.value = '';
  searchResults.hidden = true;
  searchResults.innerHTML = '';
  document.getElementById('animeSearchHint').textContent = 'Digite o nome e escolha o anime correto.';
  activeAnimeSearchTerm = '';

  render();
  await saveItems();
  showToast(`${title} adicionado à lista`);
}

function renderAnimeResults(results) {
  const container = document.getElementById('animeSearchResults');
  container.innerHTML = '';
  if (!results.length) {
    container.innerHTML = '<p class="anime-search-empty">Nenhum anime encontrado.</p>';
    container.hidden = false;
    return;
  }

  results.forEach(media => {
    const card = document.createElement('article');
    card.className = 'anime-result';
    const title = animeTitle(media, activeAnimeSearchTerm);
    const saved = isAnimeSaved(media);
    card.innerHTML = `
      <img src="${media.coverImage?.large || media.coverImage?.extraLarge || ''}" alt="Capa de ${title}">
      <span class="anime-result-info">
        <strong>${title}</strong>
        <small>${media.title?.romaji && normalizeAnimeTitle(media.title.romaji) !== normalizeAnimeTitle(title) ? media.title.romaji + ' · ' : ''}${media.seasonYear || 'Ano desconhecido'} · ${media.episodes || (media.nextAiringEpisode?.episode ? media.nextAiringEpisode.episode - 1 : '?')} episódios disponíveis</small>
      </span>
      <button type="button" class="anime-result-add${saved ? ' is-saved' : ''}" ${saved ? 'disabled' : ''}>
        ${saved ? 'Salvo na sua lista' : 'Adicionar'}
      </button>`;

    const addButton = card.querySelector('.anime-result-add');
    addButton.onclick = () => addAnimeFromResult(media, addButton);
    container.appendChild(card);
  });
  container.hidden = false;
}

async function runAnimeSearch() {
  const value = document.getElementById('newName').value.trim();
  const hint = document.getElementById('animeSearchHint');
  const results = document.getElementById('animeSearchResults');

  if (value.length < 2) {
    activeAnimeSearchTerm = '';
    results.hidden = true;
    results.innerHTML = '';
    hint.textContent = value.length ? 'Digite pelo menos 2 letras.' : 'Digite o nome e escolha o anime correto.';
    return;
  }

  const requestId = ++animeSearchRequest;
  activeAnimeSearchTerm = value;
  hint.textContent = 'Pesquisando no AniList...';
  results.hidden = true;
  try {
    const media = await searchAniList(value);
    if (requestId !== animeSearchRequest || document.getElementById('newName').value.trim() !== value) return;
    renderAnimeResults(media);
    hint.textContent = 'Adicione o anime correto diretamente pelo resultado.';
  } catch (error) {
    if (requestId !== animeSearchRequest) return;
    results.innerHTML = '<p class="anime-search-empty">Não foi possível consultar o AniList. Confira sua internet e tente novamente.</p>';
    results.hidden = false;
    hint.textContent = 'Falha na pesquisa.';
    console.error(error);
  }
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR');
}

async function reorderItems(draggedItemId, targetItemId) {
  if (!draggedItemId || draggedItemId === targetItemId) return;
  const fromIndex = items.findIndex(i => i.id === draggedItemId);
  const toIndex = items.findIndex(i => i.id === targetItemId);
  if (fromIndex === -1 || toIndex === -1) return;
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  draggedId = null;
  render();
  await saveItems();
}

async function setEpisode(id, newEp) {
  const target = items.find(i => i.id === id);
  if (!target) return;
  const available = getAvailableEpisodes(target);
  const parsed = Number.parseInt(newEp, 10);
  const safeValue = Number.isFinite(parsed) ? parsed : target.currentEp || 0;
  target.currentEp = Math.max(0, available ? Math.min(safeValue, available) : safeValue);

  const status = getStatus(target);
  if (status === 'upToDate' && available) target.caughtUpAvailableEps = available;
  target.watched = status === 'watched';
  if (status === 'watched') target.watchedAt = target.watchedAt || Date.now();
  else target.watchedAt = null;

  render();
  if (status === 'watched') flashStamp(id);
  await saveItems();
}

async function toggleWatched(id) {
  const target = items.find(i => i.id === id);
  if (!target) return;
  const available = getAvailableEpisodes(target);
  const status = getStatus(target);

  if (status === 'watched' || status === 'upToDate') {
    target.currentEp = Math.max(0, (available || target.currentEp || 1) - 1);
    target.watched = false;
    target.watchedAt = null;
  } else if (available) {
    target.currentEp = available;
    target.watched = target.anilistStatus === 'FINISHED';
    target.watchedAt = target.watched ? Date.now() : null;
  } else {
    showToast('Defina o episódio manualmente; o total ainda é desconhecido.');
    return;
  }

  const updatedStatus = getStatus(target);
  if (updatedStatus === 'upToDate' && available) target.caughtUpAvailableEps = available;

  render();
  if (updatedStatus === 'watched') flashStamp(id);
  await saveItems();
}

function flashStamp(id) {
  requestAnimationFrame(() => {
    const row = document.querySelector(`.item[data-id="${id}"]`);
    const s = row && row.querySelector('.stamp');
    if (s) {
      s.classList.add('show');
      setTimeout(() => s.classList.remove('show'), 900);
    }
  });
}

let pendingDeleteTimeout = null;

let lastFocusedBeforeModal = null;

function handleDeleteClick(id) {
  const target = items.find(i => i.id === id);
  if (!target) return;
  pendingDeleteId = id;
  document.getElementById('deleteText').textContent = `Deseja excluir "${target.name}" da lista?`;
  const modal = document.getElementById('deleteModal');
  lastFocusedBeforeModal = document.activeElement;
  modal.classList.remove('is-closing');
  modal.hidden = false;
  requestAnimationFrame(() => document.getElementById('cancelDeleteBtn').focus());
}

function closeDeleteModal() {
  pendingDeleteId = null;
  const modal = document.getElementById('deleteModal');
  if (modal.hidden || modal.classList.contains('is-closing')) return;

  modal.classList.add('is-closing');
  setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove('is-closing');
    if (lastFocusedBeforeModal instanceof HTMLElement) lastFocusedBeforeModal.focus();
    lastFocusedBeforeModal = null;
  }, 170);
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  closeDeleteModal();
  await removeItem(id);
  showToast('Anime removido');
}

async function toggleFavorite(id) {
  const target = items.find(i => i.id === id);
  if (!target) return;
  target.favorite = !target.favorite;
  render();
  await saveItems();
  showToast(target.favorite ? 'Adicionado aos favoritos ⭐' : 'Removido dos favoritos');
}

function chooseRandomAnime() {
  const candidates = items.filter(i => getStatus(i) !== 'watched');
  if (!candidates.length) {
    showToast(items.length ? 'Todos os animes já foram assistidos!' : 'Adicione algum anime primeiro.');
    return;
  }

  filter = 'all';
  document.querySelectorAll('.filters button').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'all');
  });

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  render();

  requestAnimationFrame(() => {
    const row = document.querySelector(`.item[data-id="${chosen.id}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('random-highlight');
    setTimeout(() => row.classList.remove('random-highlight'), 1300);
    showToast(`🎲 Que tal assistir: ${chosen.name}?`);
  });
}

async function removeItem(id) {
  const row = document.querySelector(`.item[data-id="${id}"]`);
  if (row && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    row.classList.add('item-removing');
    await new Promise(resolve => setTimeout(resolve, 190));
  }

  items = items.filter(i => i.id !== id);
  previousVisibleAnimeIds.delete(String(id));
  render();
  await saveItems();
}

const THEME_KEY = 'theme-preference';

async function loadTheme() {
  let theme = 'dark';
  try {
    const result = await window.storage.get(THEME_KEY, false);
    theme = result ? result.value : 'dark';
  } catch (e) {
    theme = 'dark';
  }
  applyTheme(theme);
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    document.getElementById('themeBtn').textContent = '☀';
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('themeBtn').textContent = '☾';
  }
}

async function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const newTheme = isLight ? 'dark' : 'light';
  applyTheme(newTheme);
  try {
    await window.storage.set(THEME_KEY, newTheme, false);
  } catch (e) {}
}

document.getElementById('themeBtn').onclick = toggleTheme;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2500);
}

async function copyShareLink() {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copiado para área de transferência');
  } catch (e) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast('Link copiado para área de transferência');
    } catch (e2) {
      showToast('Não consegui copiar automaticamente');
    }
  }
}

function csvEscape(value) {
  const str = String(value == null ? '' : value);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function exportList() {
  const headers = ['Nome', 'Status', 'Episodio atual', 'Total de episodios', 'Sugerido por', 'Nota', 'Assistido em'];
  const rows = items.map(i => [
    i.name,
    getStatusLabel(i),
    i.currentEp || 0,
    i.totalEps || '',
    i.suggestedBy || '',
    i.note || '',
    i.watchedAt ? formatDate(i.watchedAt) : ''
  ]);
  const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lista-de-animes.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Lista exportada');
}

document.getElementById('exportBtn').onclick = exportList;

document.getElementById('shareBtn').onclick = copyShareLink;

document.getElementById('searchBox').addEventListener('input', e => {
  searchTerm = e.target.value.trim();
  render();
});

document.getElementById('newName').addEventListener('input', () => {
  clearAnimeSelection();
  clearTimeout(animeSearchTimer);
  animeSearchRequest++;

  const input = document.getElementById('newName');
  const results = document.getElementById('animeSearchResults');
  const hint = document.getElementById('animeSearchHint');
  const value = input.value.trim();

  if (value.length < 2) {
    activeAnimeSearchTerm = '';
    results.hidden = true;
    results.innerHTML = '';
    hint.textContent = value.length ? 'Digite pelo menos 2 letras.' : 'Digite o nome e escolha o anime correto.';
    return;
  }

  hint.textContent = 'Aguardando você terminar de digitar...';
  animeSearchTimer = setTimeout(runAnimeSearch, 450);
});
document.getElementById('newName').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runAnimeSearch();
  }
});

document.getElementById('heroAddBtn').onclick = () => {
  document.getElementById('newName').scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => document.getElementById('newName').focus(), 450);
};

document.getElementById('heroRandomBtn').onclick = chooseRandomAnime;

document.getElementById('showAllFavoritesBtn').onclick = () => {
  filter = 'favorites';
  document.querySelectorAll('.filters button').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === 'favorites');
  });
  render();
  document.getElementById('list').scrollIntoView({ behavior: 'smooth' });
};

document.getElementById('sortSelect').addEventListener('change', e => {
  sortMode = e.target.value;
  render();
});

document.getElementById('randomBtn').onclick = chooseRandomAnime;
document.getElementById('bottomRandom').onclick = chooseRandomAnime;

document.getElementById('continueBtn').onclick = () => {
  const id = document.getElementById('continueCard').dataset.id;
  const target = items.find(i => i.id === id);
  if (target) setEpisode(id, target.currentEp + 1);
};

document.getElementById('cancelDeleteBtn').onclick = closeDeleteModal;
document.getElementById('confirmDeleteBtn').onclick = confirmDelete;
document.getElementById('deleteModal').addEventListener('click', e => {
  if (e.target.id === 'deleteModal') closeDeleteModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDeleteModal();
});

document.querySelectorAll('[data-jump]').forEach(btn => {
  btn.onclick = () => {
    const target = btn.dataset.jump;
    if (target === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    if (target === 'list') document.getElementById('list').scrollIntoView({ behavior: 'smooth' });
    if (target === 'profile') document.getElementById('nameSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
});

document.querySelectorAll('.filters button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filter = btn.dataset.filter;
    render();
  };
});

rotateHeroQuote();
loadTheme();
loadMyName();
loadItems();

// Mantém a contagem regressiva atualizada enquanto o aplicativo estiver aberto.
setInterval(() => {
  if (items.some(item => getStatus(item) === 'upToDate' && item.anilistStatus === 'RELEASING')) {
    render();
  }
}, 60000);
