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

function getStatus(item) {
  if (item.watched) return 'watched';
  if (item.currentEp && item.currentEp > 0) return 'watching';
  return 'pending';
}

async function loadItems() {
  const statusEl = document.getElementById('status');
  try {
    const result = await window.storage.get(STORAGE_KEY, true);
    items = result ? JSON.parse(result.value) : [];
    items.forEach(i => {
      if (typeof i.currentEp !== 'number') i.currentEp = 0;
      if (typeof i.totalEps !== 'number') i.totalEps = null;
      if (typeof i.suggestedBy !== 'string') i.suggestedBy = '';
      if (typeof i.watchedAt !== 'number') i.watchedAt = null;
      if (typeof i.note !== 'string') i.note = '';
      if (typeof i.favorite !== 'boolean') i.favorite = false;
      if (typeof i.addedAt !== 'number') i.addedAt = Date.now();
    });
  } catch (e) {
    items = [];
  }
  statusEl.textContent = 'Dados salvos neste navegador. A sincronização compartilhada será ativada em uma próxima etapa.';
  render();
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
  const watchingCount = items.filter(i => getStatus(i) === 'watching').length;
  const pendingCount = items.filter(i => getStatus(i) === 'pending').length;
  const favoriteCount = items.filter(i => i.favorite).length;
  const episodesWatched = items.reduce((sum, i) => sum + (i.currentEp || 0), 0);
  const estimatedHours = Math.round((episodesWatched * 24) / 60);

  const stats = [
    { num: items.length, label: 'Na lista' },
    { num: watchedCount, label: 'Assistidos' },
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
    .filter(i => getStatus(i) === 'watching')
    .sort((a, b) => (b.currentEp || 0) - (a.currentEp || 0))[0];

  if (!watching) {
    card.hidden = true;
    card.dataset.id = '';
    return;
  }

  const pct = watching.totalEps
    ? Math.min(100, Math.round((watching.currentEp / watching.totalEps) * 100))
    : 0;

  card.hidden = false;
  card.dataset.id = watching.id;
  document.getElementById('continueName').textContent = watching.name;
  document.getElementById('continueInfo').textContent = watching.totalEps
    ? `Você está no episódio ${watching.currentEp} de ${watching.totalEps}.`
    : `Você está no episódio ${watching.currentEp}.`;
  document.getElementById('continueProgress').style.width = pct + '%';
  document.getElementById('continuePct').textContent = pct + '%';
  document.getElementById('continueCover').textContent = getInitials(watching.name);
  document.getElementById('continueCover').style.background =
    `linear-gradient(145deg, ${nameColor(watching.name)}, color-mix(in srgb, ${nameColor(watching.name)} 58%, #16121f 42%))`;
}


function renderDashboard() {
  const watching = items.filter(i => getStatus(i) === 'watching').length;
  const favorites = items.filter(i => i.favorite).length;
  const completed = items.filter(i => getStatus(i) === 'watched').length;

  document.getElementById('dashWatching').textContent = watching;
  document.getElementById('dashFavorites').textContent = favorites;
  document.getElementById('dashCompleted').textContent = completed;

  renderFavoriteShowcase();
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
    const gradient = posterGradient(item.name);
    art.style.setProperty('--poster-a', gradient.a);
    art.style.setProperty('--poster-b', gradient.b);
    art.textContent = getInitials(item.name);

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

  if (visible.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = items.length === 0
      ? 'Nenhum anime na lista ainda. Adicionem o primeiro acima.'
      : 'Nada por aqui nesse filtro.';
    list.appendChild(p);
    return;
  }

  visible.forEach(item => {
    const status = getStatus(item);
    const row = document.createElement('div');
    row.className = 'item' + (status === 'watched' ? ' watched' : '');
    row.dataset.id = item.id;
    row.draggable = true;
    row.addEventListener('dragstart', () => {
      draggedId = item.id;
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', e => {
      e.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      reorderItems(draggedId, item.id);
    });

    const top = document.createElement('div');
    top.className = 'item-top';

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-hidden', 'true');

    const check = document.createElement('div');
    check.className = 'check' + (status === 'watched' ? ' on' : '');
    check.textContent = status === 'watched' ? '✓' : '';
    check.onclick = () => toggleWatched(item.id);

    const nameWrap = document.createElement('div');
    nameWrap.className = 'name-wrap';

    const name = document.createElement('div');
    name.className = 'name' + (status === 'watched' ? ' watched' : '');
    name.textContent = item.name;
    nameWrap.appendChild(name);

    if (item.totalEps) {
      const epInfo = document.createElement('div');
      epInfo.className = 'ep-info';
      epInfo.textContent = `Ep. ${item.currentEp} de ${item.totalEps}`;
      nameWrap.appendChild(epInfo);
    }

    if (item.suggestedBy) {
      const sug = document.createElement('div');
      sug.className = 'suggester';
      const avatar = createAvatarEl(item.suggestedBy, photos[item.suggestedBy], 'avatar-sm');
      sug.appendChild(avatar);
      sug.appendChild(document.createTextNode(`Sugerido por ${item.suggestedBy}`));
      nameWrap.appendChild(sug);
    }

    if (status === 'watched' && item.watchedAt) {
      const wd = document.createElement('div');
      wd.className = 'watched-date';
      wd.textContent = `Assistido em ${formatDate(item.watchedAt)}`;
      nameWrap.appendChild(wd);
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

    const stamp = document.createElement('div');
    stamp.className = 'stamp';
    stamp.textContent = 'VISTO';

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const favorite = document.createElement('button');
    favorite.className = 'favorite-btn' + (item.favorite ? ' on' : '');
    favorite.textContent = item.favorite ? '★' : '☆';
    favorite.setAttribute('aria-label', item.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
    favorite.title = item.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    favorite.onclick = () => toggleFavorite(item.id);

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Remover');
    del.onclick = () => handleDeleteClick(item.id);

    top.appendChild(handle);
    top.appendChild(check);
    top.appendChild(nameWrap);
    actions.appendChild(favorite);
    actions.appendChild(del);
    top.appendChild(actions);
    row.appendChild(top);
    row.appendChild(stamp);

    if (item.totalEps) {
      const pct = Math.min(100, Math.round((item.currentEp / item.totalEps) * 100));

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
      row.appendChild(progressWrap);

      const epControls = document.createElement('div');
      epControls.className = 'ep-controls';
      const stepper = document.createElement('div');
      stepper.className = 'stepper';

      const minus = document.createElement('button');
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'Episódio anterior');
      minus.onclick = () => setEpisode(item.id, item.currentEp - 1);

      const epLabel = document.createElement('span');
      epLabel.textContent = `Ep. ${item.currentEp}`;

      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'Assisti mais um episódio');
      plus.onclick = () => setEpisode(item.id, item.currentEp + 1);

      stepper.appendChild(minus);
      stepper.appendChild(epLabel);
      stepper.appendChild(plus);
      epControls.appendChild(stepper);
      row.appendChild(epControls);
    }

    list.appendChild(row);
  });
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

async function addItem() {
  const input = document.getElementById('newName');
  const totalInput = document.getElementById('newTotal');
  const noteInput = document.getElementById('newNote');
  const value = input.value.trim();
  if (!value) return;
  const totalRaw = totalInput.value.trim();
  const totalEps = totalRaw ? Math.max(0, parseInt(totalRaw, 10)) : null;
  const note = noteInput.value.trim();
  items.push({ id: uid(), name: value, totalEps, currentEp: 0, watched: false, watchedAt: null, suggestedBy: myName, note, favorite: false, addedAt: Date.now() });
  input.value = '';
  totalInput.value = '';
  noteInput.value = '';
  render();
  await saveItems();
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
  const max = target.totalEps || Infinity;
  target.currentEp = Math.max(0, Math.min(newEp, max));
  if (target.totalEps && target.currentEp >= target.totalEps) {
    target.watched = true;
    target.watchedAt = target.watchedAt || Date.now();
  } else if (target.watched && target.currentEp < (target.totalEps || Infinity)) {
    target.watched = false;
    target.watchedAt = null;
  }
  render();
  if (target.watched) flashStamp(id);
  await saveItems();
}

async function toggleWatched(id) {
  const target = items.find(i => i.id === id);
  if (!target) return;
  target.watched = !target.watched;
  if (target.watched) {
    if (target.totalEps) target.currentEp = target.totalEps;
    target.watchedAt = Date.now();
  } else {
    target.watchedAt = null;
  }
  render();
  if (target.watched) flashStamp(id);
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

function handleDeleteClick(id) {
  const target = items.find(i => i.id === id);
  if (!target) return;
  pendingDeleteId = id;
  document.getElementById('deleteText').textContent = `Deseja excluir "${target.name}" da lista?`;
  document.getElementById('deleteModal').hidden = false;
}

function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById('deleteModal').hidden = true;
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
  items = items.filter(i => i.id !== id);
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
    getStatus(i) === 'watched' ? 'Assistido' : getStatus(i) === 'watching' ? 'Assistindo' : 'Para assistir',
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

document.getElementById('addBtn').onclick = addItem;
document.getElementById('newName').addEventListener('keydown', e => {
  if (e.key === 'Enter') addItem();
});
document.getElementById('newTotal').addEventListener('keydown', e => {
  if (e.key === 'Enter') addItem();
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
