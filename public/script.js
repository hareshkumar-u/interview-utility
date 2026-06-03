/* ── State ────────────────────────────────────────────────── */
const state = {
  images: [],   // { blob, objectUrl, name }
  stream: null  // MediaStream when camera is active
};

/* ── DOM refs ─────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const identifierInput = $('identifier');
const cameraViewport  = $('cameraViewport');
const cameraPreview   = $('cameraPreview');
const captureCanvas   = $('captureCanvas');
const captureFlash    = $('captureFlash');
const startCameraBtn  = $('startCameraBtn');
const captureBtn      = $('captureBtn');
const stopCameraBtn   = $('stopCameraBtn');
const fileInput       = $('fileInput');
const dropZone        = $('dropZone');
const previewGrid     = $('previewGrid');
const previewCount    = $('previewCount');
const submitBtn          = $('submitBtn');
const statusBanner       = $('statusBanner');
const selectedFolderTag  = $('selectedFolderTag');
const selectedFolderName = $('selectedFolderName');
const clearFolderBtn     = $('clearFolderBtn');
const refreshFoldersBtn  = $('refreshFoldersBtn');
const downloadAllBtn     = $('downloadAllBtn');
const deleteAllBtn       = $('deleteAllBtn');
const createFoldersBtn   = $('createFoldersBtn');
const createFolderNames  = $('createFolderNames');
const parentFolder       = $('parentFolder');
const createParentFolder = $('createParentFolder');
const folderGrid         = $('folderGrid');

// Track which folder card is currently active
let activeFolderCard = null;

/* ── Camera ───────────────────────────────────────────────── */
startCameraBtn.addEventListener('click', async () => {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width:       { ideal: 2480 },   // portrait A4 short edge
        height:      { ideal: 3508 },   // portrait A4 long edge
        aspectRatio: { ideal: 210 / 297 } // portrait A4
      }
    });
    cameraPreview.srcObject = state.stream;
    cameraViewport.classList.remove('hidden');
    startCameraBtn.classList.add('hidden');
    captureBtn.classList.remove('hidden');
    stopCameraBtn.classList.remove('hidden');
  } catch (err) {
    showStatus('Camera not accessible: ' + err.message, 'error');
  }
});

captureBtn.addEventListener('click', () => {
  // Flash feedback
  captureFlash.classList.add('active');
  setTimeout(() => captureFlash.classList.remove('active'), 50);

  // Crop to the guide area (8% inset on all sides)
  const vw = cameraPreview.videoWidth;
  const vh = cameraPreview.videoHeight;
  const m  = 0.08;
  const sx = Math.round(vw * m),       sy = Math.round(vh * m);
  const sw = Math.round(vw * (1-2*m)), sh = Math.round(vh * (1-2*m));

  const isLandscape = vw > vh;
  if (isLandscape) {
    // Camera returned landscape — rotate 90° CW to produce portrait output
    captureCanvas.width  = sh;
    captureCanvas.height = sw;
    const ctx = captureCanvas.getContext('2d');
    ctx.save();
    ctx.translate(sh, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(cameraPreview, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.restore();
  } else {
    captureCanvas.width  = sw;
    captureCanvas.height = sh;
    captureCanvas.getContext('2d').drawImage(cameraPreview, sx, sy, sw, sh, 0, 0, sw, sh);
  }

  captureCanvas.toBlob(blob => {
    if (!blob) return;
    addImage(blob, `doc-${Date.now()}.jpg`);
  }, 'image/jpeg', 0.95);
});

stopCameraBtn.addEventListener('click', closeCamera);

function closeCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  cameraPreview.srcObject = null;
  cameraViewport.classList.add('hidden');
  startCameraBtn.classList.remove('hidden');
  captureBtn.classList.add('hidden');
  stopCameraBtn.classList.add('hidden');
}

/* ── File picker ──────────────────────────────────────────── */
fileInput.addEventListener('change', e => {
  handleFiles(Array.from(e.target.files));
  e.target.value = ''; // allow re-selecting same files
});

/* ── Drag & drop ──────────────────────────────────────────── */
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

['dragleave', 'dragend'].forEach(ev =>
  dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over'))
);

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length) handleFiles(files);
});

/* ── Image helpers ────────────────────────────────────────── */
function handleFiles(files) {
  files.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    addImage(file, file.name);
  });
}

function addImage(blob, name) {
  const objectUrl = URL.createObjectURL(blob);
  state.images.push({ blob, objectUrl, name });
  renderPreviews();
}

function removeImage(index) {
  URL.revokeObjectURL(state.images[index].objectUrl);
  state.images.splice(index, 1);
  renderPreviews();
}

function renderPreviews() {
  previewGrid.innerHTML = '';

  if (state.images.length === 0) {
    previewGrid.classList.add('hidden');
    previewCount.classList.add('hidden');
    return;
  }

  state.images.forEach(({ objectUrl, name }, i) => {
    const item = document.createElement('div');
    item.className = 'preview-item';

    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = name;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '\u00D7'; // ×
    removeBtn.addEventListener('click', () => removeImage(i));

    const label = document.createElement('span');
    label.className = 'img-name';
    label.textContent = name;

    item.append(img, removeBtn, label);
    previewGrid.appendChild(item);
  });

  previewGrid.classList.remove('hidden');
  previewCount.textContent = `${state.images.length} image${state.images.length > 1 ? 's' : ''} selected`;
  previewCount.classList.remove('hidden');
}

/* ── Submit ───────────────────────────────────────────────── */
submitBtn.addEventListener('click', async () => {
  const identifier = identifierInput.value.trim();

  if (!identifier) {
    showStatus('Please enter an identifier before uploading.', 'error');
    identifierInput.focus();
    return;
  }

  if (state.images.length === 0) {
    showStatus('Please add at least one image before uploading.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('identifier', identifier);
  if (parentFolder.value) formData.append('parent', parentFolder.value);
  state.images.forEach(({ blob, name }) => formData.append('images', blob, name));

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Uploading\u2026';
  statusBanner.classList.add('hidden');

  try {
    const response = await fetch('/upload', { method: 'POST', body: formData });
    const data     = await response.json();

    if (data.success) {
      showStatus(data.message, 'success');
      // Reset form
      state.images.forEach(({ objectUrl }) => URL.revokeObjectURL(objectUrl));
      state.images = [];
      identifierInput.value = '';
      parentFolder.value    = '';
      renderPreviews();
      closeCamera();
      clearFolderSelection();
      loadFolders();
    } else {
      showStatus(data.message || 'Upload failed.', 'error');
    }
  } catch (err) {
    showStatus('Network error: ' + err.message, 'error');
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Upload Images';
  }
});

/* ── Status banner ────────────────────────────────────────── */
function showStatus(message, type) {
  statusBanner.textContent = message;
  statusBanner.className   = `status-banner ${type}`;
  statusBanner.classList.remove('hidden');

  // Auto-hide success messages after 6 seconds
  if (type === 'success') {
    setTimeout(() => statusBanner.classList.add('hidden'), 6000);
  }
}

/* ── Folder selection ─────────────────────────────────────── */
function selectFolder(name, parent, cardEl) {
  identifierInput.value  = name;
  parentFolder.value     = parent || '';
  const displayPath      = parent ? `${parent} / ${name}` : name;
  selectedFolderName.textContent = displayPath;
  selectedFolderTag.classList.remove('hidden');

  if (activeFolderCard) activeFolderCard.classList.remove('active');
  activeFolderCard = cardEl;
  cardEl.classList.add('active');

  identifierInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  identifierInput.focus();
}

function clearFolderSelection() {
  selectedFolderTag.classList.add('hidden');
  selectedFolderName.textContent = '';
  if (activeFolderCard) {
    activeFolderCard.classList.remove('active');
    activeFolderCard = null;
  }
}

// Clear the visual tag when the user manually edits the identifier
identifierInput.addEventListener('input', () => {
  if (activeFolderCard && identifierInput.value !== activeFolderCard.dataset.name) {
    clearFolderSelection();
  }
});

clearFolderBtn.addEventListener('click', () => {
  identifierInput.value = '';
  parentFolder.value    = '';
  clearFolderSelection();
  identifierInput.focus();
});

refreshFoldersBtn.addEventListener('click', loadFolders);

createFoldersBtn.addEventListener('click', async () => {
  const names = createFolderNames.value.trim();
  if (!names) {
    showStatus('Please enter at least one folder name.', 'error');
    createFolderNames.focus();
    return;
  }
  createFoldersBtn.disabled    = true;
  createFoldersBtn.textContent = 'Creating…';
  try {
    const res  = await fetch('/folders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names, parent: createParentFolder.value || undefined })
    });
    const data = await res.json();
    showStatus(data.message, data.success ? 'success' : 'error');
    if (data.success) { createFolderNames.value = ''; loadFolders(); }
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  } finally {
    createFoldersBtn.disabled    = false;
    createFoldersBtn.textContent = 'Create Folders';
  }
});

deleteAllBtn.addEventListener('click', async () => {
  if (!confirm('Delete ALL folders and images? This cannot be undone.')) return;
  deleteAllBtn.disabled    = true;
  deleteAllBtn.textContent = 'Deleting…';
  try {
    const res  = await fetch('/folders', { method: 'DELETE' });
    const data = await res.json();
    showStatus(data.message, data.success ? 'success' : 'error');
    if (data.success) { clearFolderSelection(); loadFolders(); }
  } catch (err) {
    showStatus('Delete failed: ' + err.message, 'error');
  } finally {
    deleteAllBtn.disabled    = false;
    deleteAllBtn.textContent = '\u{1F5D1} Delete All';
  }
});

downloadAllBtn.addEventListener('click', async () => {
  downloadAllBtn.disabled    = true;
  downloadAllBtn.textContent = 'Zipping…';
  try {
    const res = await fetch('/download');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showStatus(data.message || 'Nothing to download.', 'error');
      return;
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'uploads.zip';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showStatus('Download failed: ' + err.message, 'error');
  } finally {
    downloadAllBtn.disabled    = false;
    downloadAllBtn.textContent = '\u2193 Download All';
  }
});

/* ── Folders list ─────────────────────────────────────────── */
async function loadFolders() {
  folderGrid.innerHTML = '<p class="folders-loading">Loading...</p>';
  try {
    const res  = await fetch('/folders');
    const data = await res.json();
    renderFolders(data.folders || []);
    updateParentSelects(data.folders || []);
  } catch {
    folderGrid.innerHTML = '<p class="folders-empty">Could not load folders.</p>';
  }
}

function updateParentSelects(folders) {
  [parentFolder, createParentFolder].forEach(sel => {
    const current = sel.value;
    sel.innerHTML = '<option value="">— Root (no parent) —</option>';
    folders.forEach(({ name }) => {
      const opt = document.createElement('option');
      opt.value = name; opt.textContent = name;
      if (name === current) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

const FOLDER_SVG = `<svg class="folder-icon" viewBox="0 0 48 40" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8C4 5.79 5.79 4 8 4H18L22 10H40C42.21 10 44 11.79 44 14V34C44 36.21 42.21 38 40 38H8C5.79 38 4 36.21 4 34V8Z" fill="currentColor" opacity="0.85"/></svg>`;

function makeBtn(cls, title, text) {
  const btn = document.createElement('button');
  btn.className = cls; btn.title = title; btn.textContent = text;
  return btn;
}

async function doDownloadFolder(folderPath, zipName, btn) {
  btn.disabled = true; btn.textContent = '\u23F3';
  try {
    const encodedPath = folderPath.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(`/download/${encodedPath}`);
    if (!res.ok) { const d = await res.json().catch(() => ({})); showStatus(d.message || 'Download failed.', 'error'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${zipName}.zip`; a.click();
    URL.revokeObjectURL(url);
  } catch (err) { showStatus('Download failed: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = '\u2193'; }
}

async function doDeleteFolder(folderPath, btn, onSuccess) {
  btn.disabled = true;
  try {
    const encodedPath = folderPath.split('/').map(encodeURIComponent).join('/');
    const res  = await fetch(`/folders/${encodedPath}`, { method: 'DELETE' });
    const data = await res.json();
    showStatus(data.message, data.success ? 'success' : 'error');
    if (data.success) onSuccess();
    else btn.disabled = false;
  } catch (err) { showStatus('Delete failed: ' + err.message, 'error'); btn.disabled = false; }
}

function makeFolderCard(name, folderPath, parentName, count) {
  const card = document.createElement('button');
  card.className = 'folder-card'; card.dataset.name = name; card.dataset.path = folderPath;
  card.title     = `Add images to "${folderPath}"`;
  card.innerHTML = `${FOLDER_SVG}<span class="folder-name">${escapeHtml(name)}</span><span class="folder-count">${count} image${count !== 1 ? 's' : ''}</span>`;
  card.addEventListener('click', () => selectFolder(name, parentName || '', card));

  const dlBtn  = makeBtn('folder-action-btn folder-download-btn', `Download "${folderPath}"`, '\u2193');
  dlBtn.addEventListener('click', e => { e.stopPropagation(); doDownloadFolder(folderPath, name, dlBtn); });

  const delBtn = makeBtn('folder-action-btn folder-delete-btn', `Delete "${folderPath}"`, '\u00D7');
  delBtn.addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${folderPath}" and all its contents?`)) return;
    doDeleteFolder(folderPath, delBtn, () => {
      if (identifierInput.value === name && parentFolder.value === (parentName || '')) clearFolderSelection();
      loadFolders();
    });
  });

  card.appendChild(dlBtn); card.appendChild(delBtn);
  return card;
}

function renderFolders(folders) {
  if (folders.length === 0) {
    folderGrid.innerHTML = '<p class="folders-empty">No folders yet. Upload some images to get started.</p>';
    return;
  }

  folderGrid.innerHTML = '';
  folders.forEach(({ name, path: fPath, count, children }) => {
    if (children && children.length > 0) {
      // Group with child cards
      const group  = document.createElement('div');
      group.className = 'folder-group';

      const header = document.createElement('div');
      header.className = 'folder-group-header';

      const chevron = document.createElement('span');
      chevron.className = 'folder-group-chevron';
      chevron.innerHTML = '&#9660;'; // ▼ down

      const nameSvg = document.createElement('span');
      nameSvg.innerHTML = FOLDER_SVG;

      const nameSpan  = document.createElement('span');
      nameSpan.className = 'folder-group-name';
      nameSpan.textContent = name;

      const countSpan = document.createElement('span');
      countSpan.className = 'folder-group-count';
      countSpan.textContent = `${children.length} subfolder${children.length !== 1 ? 's' : ''}`;

      const dlBtn  = makeBtn('folder-action-btn folder-download-btn', `Download "${name}"`, '\u2193');
      dlBtn.addEventListener('click', e => { e.stopPropagation(); doDownloadFolder(fPath, name, dlBtn); });

      const delBtn = makeBtn('folder-action-btn folder-delete-btn', `Delete "${name}" group`, '\u00D7');
      delBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Delete group "${name}" and ALL its subfolders?`)) return;
        doDeleteFolder(fPath, delBtn, () => { clearFolderSelection(); loadFolders(); });
      });

      header.append(chevron, nameSvg, nameSpan, countSpan, dlBtn, delBtn);

      const childGrid = document.createElement('div');
      childGrid.className = 'folder-group-children';
      children.forEach(c => childGrid.appendChild(makeFolderCard(c.name, c.path, name, c.count)));

      // Toggle collapse on header click
      header.addEventListener('click', () => {
        const collapsed = group.classList.toggle('collapsed');
        chevron.innerHTML = collapsed ? '&#9654;' : '&#9660;'; // ▶ or ▼
      });

      group.append(header, childGrid);
      folderGrid.appendChild(group);
    } else {
      folderGrid.appendChild(makeFolderCard(name, fPath, null, count));
    }
  });

  // Re-apply active state
  if (activeFolderCard) {
    const match = folderGrid.querySelector(`[data-path="${CSS.escape(activeFolderCard.dataset.path || '')}"]`);
    if (match) { match.classList.add('active'); activeFolderCard = match; }
    else activeFolderCard = null;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Load folders on startup
loadFolders();
