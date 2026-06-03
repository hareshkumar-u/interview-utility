/* ── State ────────────────────────────────────────────────── */
const state = {
  images: [],   // { blob, objectUrl, name }
  stream: null  // MediaStream when camera is active
};

/* ── DOM refs ─────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const identifierInput = $('identifier');
const cameraPreview   = $('cameraPreview');
const captureCanvas   = $('captureCanvas');
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
const folderGrid         = $('folderGrid');

// Track which folder card is currently active
let activeFolderCard = null;

/* ── Camera ───────────────────────────────────────────────── */
startCameraBtn.addEventListener('click', async () => {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } }
    });
    cameraPreview.srcObject = state.stream;
    cameraPreview.style.display = 'block';
    startCameraBtn.classList.add('hidden');
    captureBtn.classList.remove('hidden');
    stopCameraBtn.classList.remove('hidden');
  } catch (err) {
    showStatus('Camera not accessible: ' + err.message, 'error');
  }
});

captureBtn.addEventListener('click', () => {
  captureCanvas.width  = cameraPreview.videoWidth;
  captureCanvas.height = cameraPreview.videoHeight;
  captureCanvas.getContext('2d').drawImage(cameraPreview, 0, 0);

  captureCanvas.toBlob(blob => {
    if (!blob) return;
    const name = `capture-${Date.now()}.jpg`;
    addImage(blob, name);
  }, 'image/jpeg', 0.92);
});

stopCameraBtn.addEventListener('click', closeCamera);

function closeCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  cameraPreview.srcObject = null;
  cameraPreview.style.display = 'none';
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
function selectFolder(name, cardEl) {
  // Populate identifier and show tag
  identifierInput.value = name;
  selectedFolderName.textContent = name;
  selectedFolderTag.classList.remove('hidden');

  // Highlight the clicked card
  if (activeFolderCard) activeFolderCard.classList.remove('active');
  activeFolderCard = cardEl;
  cardEl.classList.add('active');

  // Scroll up to the form
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
  clearFolderSelection();
  identifierInput.focus();
});

refreshFoldersBtn.addEventListener('click', loadFolders);

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
  } catch {
    folderGrid.innerHTML = '<p class="folders-empty">Could not load folders.</p>';
  }
}

function renderFolders(folders) {
  if (folders.length === 0) {
    folderGrid.innerHTML = '<p class="folders-empty">No folders yet. Upload some images to get started.</p>';
    return;
  }

  folderGrid.innerHTML = '';
  folders.forEach(({ name, count }) => {
    const card = document.createElement('button');
    card.className   = 'folder-card';
    card.dataset.name = name;
    card.title       = `Add images to "${name}"`;
    card.innerHTML   = `
      <svg class="folder-icon" viewBox="0 0 48 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 8C4 5.79 5.79 4 8 4H18L22 10H40C42.21 10 44 11.79 44 14V34C44 36.21 42.21 38 40 38H8C5.79 38 4 36.21 4 34V8Z"
              fill="currentColor" opacity="0.85"/>
      </svg>
      <span class="folder-name">${escapeHtml(name)}</span>
      <span class="folder-count">${count} image${count !== 1 ? 's' : ''}</span>
    `;
    card.addEventListener('click', () => selectFolder(name, card));
    folderGrid.appendChild(card);
  });

  // Re-apply active state if the same folder is still selected
  if (activeFolderCard) {
    const selectedName = identifierInput.value.trim();
    const match = folderGrid.querySelector(`[data-name="${CSS.escape(selectedName)}"]`);
    if (match) {
      match.classList.add('active');
      activeFolderCard = match;
    } else {
      activeFolderCard = null;
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Load folders on startup
loadFolders();
