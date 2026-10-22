(function () {
  'use strict';

  // Načtení metod z globálního ColorEngine (podporuje i lokální otevření přes file://)
  const {
    hexToRgb,
    rgbToHex,
    rgbToHsl,
    rgbToCmyk,
    mixDigital,
    mixPigment,
    getHarmonies,
    getColorName,
    serializeToUrlParams,
    parseFromUrlParams
  } = window.ColorEngine || {};

// ==========================================
// VÝCHOZÍ STAV A KONSTANTY
// ==========================================

const DEFAULT_SLOTS = [
  { id: 'slot-1', hex: '#0055FF', weight: 1 }, // Modrá
  { id: 'slot-2', hex: '#FFDD00', weight: 1 }, // Žlutá
  { id: 'slot-3', hex: '#FF0055', weight: 1 }  // Karmínová
];

const PRESETS = {
  painter: [
    { hex: '#DC2626', weight: 1 }, // Červená
    { hex: '#FACC15', weight: 1 }, // Žlutá
    { hex: '#2563EB', weight: 1 }  // Modrá
  ],
  cmyk: [
    { hex: '#06B6D4', weight: 1 }, // Cyan
    { hex: '#EC4899', weight: 1 }, // Magenta
    { hex: '#EAB308', weight: 1 }  // Yellow
  ],
  warm: [
    { hex: '#EF4444', weight: 2 }, // Červená
    { hex: '#F97316', weight: 2 }, // Oranžová
    { hex: '#FDE047', weight: 1 }  // Žlutá
  ],
  ocean: [
    { hex: '#1E3A8A', weight: 2 }, // Tmavomodrá
    { hex: '#0284C7', weight: 2 }, // Světlemodrá
    { hex: '#10B981', weight: 1 }  // Mořská zeleň
  ]
};

let state = {
  mode: 'pigment', // 'pigment' nebo 'rgb'
  slots: [...DEFAULT_SLOTS],
  liveMix: true,
  currentResult: null,
  history: [],
  savedRecipes: []
};

// ==========================================
// DOM ELEMENTY
// ==========================================

const slotsContainer = document.getElementById('slotsContainer');
const slotCountBadge = document.getElementById('slotCountBadge');
const addSlotBtn = document.getElementById('addSlotBtn');
const resetBtn = document.getElementById('resetBtn');
const presetSelect = document.getElementById('presetSelect');
const btnModePigment = document.getElementById('btnModePigment');
const btnModeRgb = document.getElementById('btnModeRgb');
const modeIndicatorTag = document.getElementById('modeIndicatorTag');
const themeToggleBtn = document.getElementById('themeToggleBtn');

const resultSwatchBox = document.getElementById('resultSwatchBox');
const colorNameDisplay = document.getElementById('colorNameDisplay');
const hexValue = document.getElementById('hexValue');
const rgbValue = document.getElementById('rgbValue');
const hslValue = document.getElementById('hslValue');
const cmykValue = document.getElementById('cmykValue');

const shareUrlBtn = document.getElementById('shareUrlBtn');
const saveRecipeBtn = document.getElementById('saveRecipeBtn');
const removeFavoriteBtn = document.getElementById('removeFavoriteBtn');
const harmonyContainer = document.getElementById('harmonyContainer');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const savedRecipesWrapper = document.getElementById('savedRecipesWrapper');
const savedRecipesList = document.getElementById('savedRecipesList');
const clearSavedBtn = document.getElementById('clearSavedBtn');
const toastContainer = document.getElementById('toastContainer');

// ==========================================
// INICIALIZACE
// ==========================================

function init() {
  loadStorage();
  initTheme();
  handleUrlParams();

  // Události
  addSlotBtn.addEventListener('click', addSlot);
  resetBtn.addEventListener('click', resetSlots);
  presetSelect.addEventListener('change', handlePresetChange);

  btnModePigment.addEventListener('click', () => setMode('pigment'));
  btnModeRgb.addEventListener('click', () => setMode('rgb'));
  themeToggleBtn.addEventListener('click', toggleTheme);

  shareUrlBtn.addEventListener('click', shareUrl);
  saveRecipeBtn.addEventListener('click', saveCurrentRecipe);
  if (removeFavoriteBtn) removeFavoriteBtn.addEventListener('click', removeCurrentFavorite);
  clearHistoryBtn.addEventListener('click', clearHistory);
  if (clearSavedBtn) clearSavedBtn.addEventListener('click', clearSavedRecipes);

  setupCopyButtons();

  renderSlots();
  executeMix(false);
  renderHistory();
  renderSavedRecipes();
}

// ==========================================
// SPRÁVA SLOTŮ
// ==========================================

function renderSlots() {
  slotsContainer.innerHTML = '';
  const totalWeight = state.slots.reduce((acc, s) => acc + s.weight, 0);

  state.slots.forEach((slot, index) => {
    const percent = Math.round((slot.weight / totalWeight) * 100);
    const slotEl = document.createElement('div');
    slotEl.className = 'slot-item';

    slotEl.innerHTML = `
      ${state.slots.length > 2 ? `
        <button type="button" class="slot-delete-btn" data-index="${index}" title="Odebrat složku">
          &times;
        </button>
      ` : ''}

      <div class="color-swatch-wrapper" style="background-color: ${slot.hex}">
        <input type="color" value="${slot.hex}" data-index="${index}" class="color-picker-input">
      </div>

      <div class="slot-inputs">
        <div class="hex-input-group">
          <input type="text" value="${slot.hex}" maxlength="7" data-index="${index}" class="hex-input" spellcheck="false">
          <button type="button" class="eyedropper-btn" data-index="${index}" title="Nalézt barvu kapátkem z obrazovky">
            💉
          </button>
        </div>

        <div class="ratio-control">
          <div class="ratio-label">
            <span>Dávkování: <strong>${slot.weight}x</strong></span>
            <span class="ratio-percent">${percent}%</span>
          </div>
          <input type="range" min="1" max="10" value="${slot.weight}" data-index="${index}" class="ratio-slider">
        </div>
      </div>
    `;

    slotsContainer.appendChild(slotEl);
  });

  // Aktualizace tlačítek a počítadla
  slotCountBadge.textContent = `${state.slots.length} / 8`;
  addSlotBtn.disabled = state.slots.length >= 8;

  attachSlotListeners();
}

function attachSlotListeners() {
  // Color Picker
  slotsContainer.querySelectorAll('.color-picker-input').forEach(input => {
    input.addEventListener('input', e => {
      const idx = parseInt(e.target.dataset.index, 10);
      state.slots[idx].hex = e.target.value.toUpperCase();
      // Aktualizovat swatch a text input bez celého re-renderu
      const slotEl = e.target.closest('.slot-item');
      slotEl.querySelector('.color-swatch-wrapper').style.backgroundColor = state.slots[idx].hex;
      slotEl.querySelector('.hex-input').value = state.slots[idx].hex;
      executeMix(false);
    });
  });

  // Ruční HEX vstup
  slotsContainer.querySelectorAll('.hex-input').forEach(input => {
    input.addEventListener('change', e => {
      const idx = parseInt(e.target.dataset.index, 10);
      let val = e.target.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        state.slots[idx].hex = val.toUpperCase();
        renderSlots();
        executeMix(false);
      } else {
        showToast('Neplatný HEX formát (např. #FF5500)');
        e.target.value = state.slots[idx].hex;
      }
    });
  });

  // EyeDropper API (kapátko z obrazovky)
  slotsContainer.querySelectorAll('.eyedropper-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      if (!window.EyeDropper) {
        showToast('Kapátko EyeDropper není v tomto prohlížeči podporováno (vyžaduje např. Chrome/Edge).');
        return;
      }
      try {
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        if (result && result.sRGBHex) {
          state.slots[idx].hex = result.sRGBHex.toUpperCase();
          renderSlots();
          executeMix(false);
          showToast(`Nabr Cyber-kapátkem: ${state.slots[idx].hex}`);
        }
      } catch (err) {
        // Uživatel stiskl ESC nebo zrušil výběr
      }
    });
  });

  // Posuvník váhy / poměru
  slotsContainer.querySelectorAll('.ratio-slider').forEach(slider => {
    slider.addEventListener('input', e => {
      const idx = parseInt(e.target.dataset.index, 10);
      state.slots[idx].weight = parseInt(e.target.value, 10);
      
      // Přepočítat procenta pro všechny sloty
      const totalWeight = state.slots.reduce((acc, s) => acc + s.weight, 0);
      slotsContainer.querySelectorAll('.slot-item').forEach((item, i) => {
        const pct = Math.round((state.slots[i].weight / totalWeight) * 100);
        item.querySelector('.ratio-label strong').textContent = `${state.slots[i].weight}x`;
        item.querySelector('.ratio-percent').textContent = `${pct}%`;
      });

      executeMix(false);
    });
  });

  // Odstranění slotu
  slotsContainer.querySelectorAll('.slot-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      if (state.slots.length > 2) {
        state.slots.splice(idx, 1);
        renderSlots();
        executeMix(true);
      }
    });
  });
}

function addSlot() {
  if (state.slots.length >= 8) return;
  const palette = ['#10B981', '#8B5CF6', '#F97316', '#06B6D4', '#EC4899', '#84CC16'];
  const nextColor = palette[state.slots.length % palette.length];
  state.slots.push({
    id: `slot-${Date.now()}`,
    hex: nextColor,
    weight: 1
  });
  renderSlots();
  executeMix(true);
}

function resetSlots() {
  if (window.location.search) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  
  presetSelect.value = '';
  state.slots = JSON.parse(JSON.stringify(DEFAULT_SLOTS));
  
  setMode('pigment');
  renderSlots();
  showToast('Aplikace byla obnovena do výchozího stavu');
}

function handlePresetChange(e) {
  const key = e.target.value;
  if (!key || !PRESETS[key]) return;
  state.slots = PRESETS[key].map((item, idx) => ({
    id: `slot-${Date.now()}-${idx}`,
    hex: item.hex,
    weight: item.weight
  }));
  renderSlots();
  executeMix(true);
  e.target.value = '';
  showToast('Předvolba byla načtena');
}

// ==========================================
// MÍCHACÍ LOGIKA
// ==========================================

function setMode(mode) {
  state.mode = mode;
  btnModePigment.classList.toggle('active', mode === 'pigment');
  btnModeRgb.classList.toggle('active', mode === 'rgb');

  modeIndicatorTag.textContent = mode === 'pigment'
    ? 'Fyzikální pigmentová směs'
    : 'Digitální aditivní světlo (RGB)';

  executeMix(true);
}

function executeMix(recordHistory = false) {
  const result = state.mode === 'pigment'
    ? mixPigment(state.slots)
    : mixDigital(state.slots);

  const rgb = { r: result.r, g: result.g, b: result.b };
  const hex = result.hex;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);
  const name = getColorName(hex);

  state.currentResult = { rgb, hex, hsl, cmyk, name };

  // Aktualizace DOM
  resultSwatchBox.style.backgroundColor = hex;
  colorNameDisplay.textContent = name;
  hexValue.textContent = hex;
  rgbValue.textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  hslValue.textContent = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  cmykValue.textContent = `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`;

  renderHarmonies(hex);
  updateFavoriteButtonState();

  if (recordHistory) {
    addToHistory({
      hex,
      name,
      mode: state.mode,
      slots: JSON.parse(JSON.stringify(state.slots)),
      timestamp: Date.now()
    });
  }
}

function animateMix() {
  resultSwatchBox.style.transform = 'scale(0.95)';
  setTimeout(() => {
    resultSwatchBox.style.transform = 'scale(1.05)';
    setTimeout(() => {
      resultSwatchBox.style.transform = 'scale(1)';
    }, 150);
  }, 100);
}

// ==========================================
// BAREVNÉ HARMONIE
// ==========================================

function renderHarmonies(hex) {
  const harmonies = getHarmonies(hex);
  harmonyContainer.innerHTML = '';

  const groups = harmonies.isAchromatic
    ? [
        { title: 'Světlostní kontrast (Protipól):', items: harmonies.complementary },
        { title: 'Tónový přechod (Škála):', items: harmonies.analogous },
        { title: 'Doporučené akcentní barvy:', items: harmonies.triadic },
        { title: 'Stupně jasu (Světlost):', items: harmonies.monochromatic }
      ]
    : [
        { title: 'Komplementární (Doplňková):', items: harmonies.complementary },
        { title: 'Analogická (Sousedící tóny):', items: harmonies.analogous },
        { title: 'Barevná triáda (Trojúhelník):', items: harmonies.triadic },
        { title: 'Monochromatická paleta:', items: harmonies.monochromatic }
      ];

  groups.forEach(group => {
    const row = document.createElement('div');
    row.className = 'harmony-row';

    const title = document.createElement('div');
    title.className = 'harmony-title';
    title.textContent = group.title;
    row.appendChild(title);

    const swatches = document.createElement('div');
    swatches.className = 'harmony-swatches';

    group.items.forEach(item => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'harmony-item';
      chip.title = `${item.label}: ${item.hex} (Klikněte pro zkopírování)`;
      chip.innerHTML = `
        <span class="harmony-dot" style="background-color: ${item.hex};"></span>
        <span>${item.hex}</span>
      `;
      chip.addEventListener('click', () => {
        copyToClipboard(item.hex, `Barva ${item.hex} zkopírována`);
      });
      swatches.appendChild(chip);
    });

    row.appendChild(swatches);
    harmonyContainer.appendChild(row);
  });
}

// ==========================================
// HISTORIE A OBLÍBENÉ SMĚSI
// ==========================================

function addToHistory(item) {
  // Zabránit duplicitám hned za sebou
  if (state.history.length > 0 && state.history[0].hex === item.hex && state.history[0].mode === item.mode) {
    return;
  }
  state.history.unshift(item);
  if (state.history.length > 10) state.history.pop();
  saveStorage();
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = '';
  if (state.history.length === 0) {
    historyList.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">Zatím žádné namíchané barvy</span>';
    return;
  }

  state.history.forEach((entry, idx) => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.title = `${entry.name} (${entry.mode.toUpperCase()}) - klikněte pro načtení`;
    el.innerHTML = `
      <div class="history-swatch" style="background-color: ${entry.hex};"></div>
      <span class="history-hex">${entry.hex}</span>
    `;
    el.addEventListener('click', () => restoreRecipe(entry));
    historyList.appendChild(el);
  });
}

function clearHistory() {
  state.history = [];
  saveStorage();
  renderHistory();
  showToast('Historie byla vymazána');
}

function saveCurrentRecipe() {
  if (!state.currentResult) return;
  const name = prompt('Zadejte název pro tuto recepturu:', state.currentResult.name) || state.currentResult.name;
  const recipe = {
    name,
    hex: state.currentResult.hex,
    mode: state.mode,
    slots: JSON.parse(JSON.stringify(state.slots)),
    timestamp: Date.now()
  };
  state.savedRecipes.unshift(recipe);
  saveStorage();
  renderSavedRecipes();
  updateFavoriteButtonState();
  showToast(`Receptura "${name}" uložena!`);
}

function renderSavedRecipes() {
  if (state.savedRecipes.length === 0) {
    savedRecipesWrapper.style.display = 'none';
    updateFavoriteButtonState();
    return;
  }
  savedRecipesWrapper.style.display = 'block';
  savedRecipesList.innerHTML = '';

  state.savedRecipes.forEach((recipe, idx) => {
    const el = document.createElement('div');
    el.className = 'history-item';
    el.title = `Uloženo: ${recipe.name} - klikněte pro načtení`;
    el.innerHTML = `
      <button type="button" class="history-item-remove" data-index="${idx}" title="Odebrat z oblíbených">
        &times;
      </button>
      <div class="history-swatch" style="background-color: ${recipe.hex};"></div>
      <span class="history-hex" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px;">
        ${recipe.name}
      </span>
    `;

    el.addEventListener('click', () => restoreRecipe(recipe));

    const removeBtn = el.querySelector('.history-item-remove');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeSavedRecipe(idx);
    });

    savedRecipesList.appendChild(el);
  });

  updateFavoriteButtonState();
}

function removeSavedRecipe(index) {
  if (index >= 0 && index < state.savedRecipes.length) {
    const removed = state.savedRecipes.splice(index, 1)[0];
    saveStorage();
    renderSavedRecipes();
    showToast(`Receptura "${removed.name || removed.hex}" odebrána z oblíbených`);
  }
}

function clearSavedRecipes() {
  if (state.savedRecipes.length === 0) return;
  state.savedRecipes = [];
  saveStorage();
  renderSavedRecipes();
  showToast('Oblíbené recepty byly vymazány');
}

function removeCurrentFavorite() {
  if (!state.currentResult) return;
  const currentHex = state.currentResult.hex.toUpperCase();
  const idx = state.savedRecipes.findIndex(r => r.hex.toUpperCase() === currentHex);
  if (idx !== -1) {
    removeSavedRecipe(idx);
  }
}

function updateFavoriteButtonState() {
  if (!removeFavoriteBtn) return;
  if (!state.currentResult) {
    removeFavoriteBtn.style.display = 'none';
    return;
  }
  const currentHex = state.currentResult.hex.toUpperCase();
  const isSaved = state.savedRecipes.some(r => r.hex.toUpperCase() === currentHex);
  removeFavoriteBtn.style.display = isSaved ? 'inline-flex' : 'none';
}

function restoreRecipe(recipe) {
  state.mode = recipe.mode;
  state.slots = JSON.parse(JSON.stringify(recipe.slots));
  btnModePigment.classList.toggle('active', state.mode === 'pigment');
  btnModeRgb.classList.toggle('active', state.mode === 'rgb');
  modeIndicatorTag.textContent = state.mode === 'pigment'
    ? 'Fyzikální pigmentová směs'
    : 'Digitální aditivní světlo (RGB)';
  renderSlots();
  executeMix(false);
  animateMix();
  showToast(`Načteno: ${recipe.name || recipe.hex}`);
}

// ==========================================
// URL SDÍLENÍ
// ==========================================

function shareUrl() {
  const query = serializeToUrlParams(state.mode, state.slots);
  const shareUrl = `${window.location.origin}${window.location.pathname}${query}`;
  copyToClipboard(shareUrl, 'Odkaz s recepturou byl zkopírován do schránky!');
}

function handleUrlParams() {
  const loaded = parseFromUrlParams(window.location.search);
  if (loaded) {
    state.mode = loaded.mode;
    state.slots = loaded.slots.map((s, idx) => ({
      id: `slot-url-${idx}`,
      hex: s.hex,
      weight: s.weight
    }));
    btnModePigment.classList.toggle('active', state.mode === 'pigment');
    btnModeRgb.classList.toggle('active', state.mode === 'rgb');
    modeIndicatorTag.textContent = state.mode === 'pigment'
      ? 'Fyzikální pigmentová směs'
      : 'Digitální aditivní světlo (RGB)';
    showToast('Receptura byla úspěšně načtena z URL!');
  }
}

// ==========================================
// KOPÍROVÁNÍ A SCHRÁNKA
// ==========================================

function setupCopyButtons() {
  document.querySelectorAll('.code-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const type = chip.dataset.copy;
      if (!state.currentResult) return;

      let val = '';
      switch (type) {
        case 'hex': val = state.currentResult.hex; break;
        case 'rgb': val = rgbValue.textContent; break;
        case 'hsl': val = hslValue.textContent; break;
        case 'cmyk': val = cmykValue.textContent; break;
        case 'css': val = `background-color: ${state.currentResult.hex};`; break;
      }

      copyToClipboard(val, `Zkopírováno: ${val}`);
    });
  });
}

function copyToClipboard(text, feedbackMessage) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(feedbackMessage);
  }).catch(() => {
    showToast('Nepodařilo se zkopírovat do schránky');
  });
}

// ==========================================
// TÉMA (Dark/Light) A ÚLOŽIŠTĚ
// ==========================================

function initTheme() {
  const saved = localStorage.getItem('coloralchemy_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('coloralchemy_theme', next);
  showToast(`Aktivován ${next === 'dark' ? 'tmavý' : 'světlý'} režim`);
}

function loadStorage() {
  try {
    const rawHist = localStorage.getItem('coloralchemy_history');
    if (rawHist) state.history = JSON.parse(rawHist);
    const rawSaved = localStorage.getItem('coloralchemy_saved');
    if (rawSaved) state.savedRecipes = JSON.parse(rawSaved);
  } catch (e) {
    console.warn('Nelze načíst localStorage:', e);
  }
}

function saveStorage() {
  try {
    localStorage.setItem('coloralchemy_history', JSON.stringify(state.history));
    localStorage.setItem('coloralchemy_saved', JSON.stringify(state.savedRecipes));
  } catch (e) {
    console.warn('Nelze uložit do localStorage:', e);
  }
}

// ==========================================
// TOAST OZNÁMENÍ
// ==========================================

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2600);
}

  // Spuštění po načtení DOMu (nebo ihned, pokud je DOM již připraven)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
