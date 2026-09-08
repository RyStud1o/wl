document.addEventListener('contextmenu', event => event.preventDefault());

document.onkeydown = function(e) {
  if(e.keyCode == 123) return false; // F12
  if(e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) return false; // Ctrl+Shift+I/J/C
  if(e.ctrlKey && e.keyCode === 85) return false; // Ctrl+U
};

// =========================================================
// WILDLENS SYSTEM - STABLE ENTERPRISE LOGIC
// =========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, getDocs, query, onSnapshot, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDlcNlc6jCdQ33xlRCREkQy_sVIm0e8TLU",
    authDomain: "bio-trace.firebaseapp.com",
    projectId: "bio-trace",
    storageBucket: "bio-trace.firebasestorage.app",
    messagingSenderId: "457891276480",
    appId: "1:457891276480:web:894b57d3a03c6a92bb6f25",
    measurementId: "G-D8367N5V5S"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag]||tag));
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        let r = Math.random() * 16 | 0; return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Reg Failed:', err));
    });
}

// IndexedDB Drafts Handler
const DB_NAME = 'WildLensIDB';
const STORE_NAME = 'drafts';

function initIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function getDraftsIDB() {
    const db = await initIDB();
    return new Promise((resolve) => {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
    });
}
async function saveDraftIDB(data) {
    const db = await initIDB();
    return new Promise((resolve) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(data);
        req.onsuccess = () => resolve();
    });
}
async function deleteDraftIDB(id) {
    const db = await initIDB();
    return new Promise((resolve) => {
        const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
        req.onsuccess = () => resolve();
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    setTimeout(() => {
        const splash = document.getElementById('splashScreen');
        if(splash) {
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.style.display = 'none';
                if(!localStorage.getItem('wildlensWelcomeShown')) {
                    showModal("Selamat Datang di WildLens 🌿", "Platform observasi biodiversitas ilmiah siap digunakan.");
                    localStorage.setItem('wildlensWelcomeShown', 'true');
                }
            }, 300);
        }
    }, 800);
    await updateNetworkStatus();
    initRecentObsEventListener();
});

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

async function updateNetworkStatus() {
    const badge = document.getElementById('networkBadge');
    const text = document.getElementById('networkText');
    const drafts = await getDraftsIDB();
    const draftCountEl = document.getElementById('draftCount');
    if(draftCountEl) draftCountEl.innerText = drafts.length;
    
    if (navigator.onLine) {
        badge.className = 'network-badge online';
        text.innerHTML = drafts.length > 0 ? `Online (${drafts.length} draf tertunda)` : 'Online';
    } else {
        badge.className = 'network-badge offline';
        text.innerHTML = `Offline (${drafts.length} tertunda)`;
    }
}

// Peta Leaflet & Cluster
const map = L.map('map').setView([-3.0086, 114.3888], 9); 
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

const markersCluster = L.markerClusterGroup({
    iconCreateFunction: function(cluster) {
        return L.divIcon({ html: `<div style="background:#f59e0b; color:white; width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; border:2px solid white;">${cluster.getChildCount()}</div>`, className: '', iconSize: [30, 30] });
    }
});
map.addLayer(markersCluster);

let globalFetchedMarkers = [];
document.getElementById('filterFlora').addEventListener('change', renderFilteredMap);
document.getElementById('filterFauna').addEventListener('change', renderFilteredMap);
document.getElementById('btnLokasiSaya').addEventListener('click', () => map.locate({setView: true, maxZoom: 14}));

function renderFilteredMap() {
    markersCluster.clearLayers();
    const showFlora = document.getElementById('filterFlora').checked;
    const showFauna = document.getElementById('filterFauna').checked;

    globalFetchedMarkers.forEach(d => {
        if (d.kategori === 'Flora' && !showFlora) return;
        if (d.kategori === 'Fauna' && !showFauna) return;
        if (d.statusVerifikasi !== 'Terverifikasi') return;

        let lat = d.latitude || parseFloat((d.lokasi||'').split(',')[0]);
        let lng = d.longitude || parseFloat((d.lokasi||'').split(',')[1]);

        if(!isNaN(lat) && !isNaN(lng)) {
            const color = d.kategori === 'Flora' ? '#059669' : '#2563eb';
            const icon = L.divIcon({ html: `<div style="background:${color}; width:16px; height:16px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`, className: '' });
            const m = L.marker([lat, lng], {icon})
                .bindPopup(`<b style="color:${color}">${escapeHTML(d.namaLokal)}</b><br><small>Populasi: ${d.jumlah}</small><br><img src="${escapeHTML(d.foto_url)}" style="width:100%; height:80px; object-fit:cover; border-radius:4px; margin-top:5px;">`);
            markersCluster.addLayer(m);
        }
    });
}

// Form & Waktu
let currentFormMode = 'create'; 

function setWitaTime() {
    const input = document.getElementById('tanggal');
    if (!input) return;
    const wita = new Date(new Date().getTime() + (new Date().getTimezoneOffset() * 60000) + (3600000 * 8));
    const f = (n) => String(n).padStart(2, '0');
    const str = `${wita.getFullYear()}-${f(wita.getMonth()+1)}-${f(wita.getDate())}T${f(wita.getHours())}:${f(wita.getMinutes())}`;
    input.value = str; input.max = str;
}
setWitaTime();
document.getElementById('btnNowTime').addEventListener('click', setWitaTime);

document.getElementById('btnLokasi').addEventListener('click', () => {
    const input = document.getElementById('lokasi');
    const accInfo = document.getElementById('gpsAccuracyInfo');
    input.value = "Menganalisis GPS...";
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            input.value = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
            accInfo.innerHTML = `Akurasi GPS: ±${Math.round(pos.coords.accuracy)} m`;
        },
        () => { showModal("Ditolak", "Izinkan akses lokasi browser.", false); input.value = ""; },
        { enableHighAccuracy: true, timeout: 10000 } 
    );
});

let compressedImgData = "";
document.getElementById('foto').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showModal("Terlalu Besar", "Maks 5MB.", false);

    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > h && w > 800) { h *= 800/w; w = 800; } else if (h > 800) { w *= 800/h; h = 800; }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            compressedImgData = canvas.toDataURL('image/jpeg', 0.7); 
            document.getElementById('previewFoto').src = compressedImgData;
            document.getElementById('previewBox').style.display = 'block';
        };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
});

document.getElementById('bioForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('editId').value;
    
    if (!editId && !compressedImgData && currentFormMode !== 'edit-server') {
        return showModal("Gagal", "Harap unggah foto eviden.", false);
    }

    const rawCoords = document.getElementById('lokasi').value;
    const [lat, lng] = rawCoords.split(',').map(s => parseFloat(s.trim()) || 0);

    const formData = {
        kategori: escapeHTML(document.getElementById('kategori').value),
        jenisHabitat: escapeHTML(document.getElementById('jenisHabitat').value),
        namaLokal: escapeHTML(document.getElementById('namaLokal').value),
        namaIlmiah: escapeHTML(document.getElementById('namaIlmiah').value),
        lokasi: escapeHTML(rawCoords),
        latitude: lat, longitude: lng,
        tanggal: escapeHTML(document.getElementById('tanggal').value),
        jumlah: Number(document.getElementById('jumlah').value),
        kondisiHabitat: escapeHTML(document.getElementById('kondisiHabitat').value),
        statusIdentifikasi: escapeHTML(document.getElementById('statusIdentifikasi').value),
        catatan: escapeHTML(document.getElementById('catatan').value),
        updatedAt: serverTimestamp()
    };

    if (currentFormMode === 'edit-server') {
        const btnSubmit = document.getElementById('btnSubmit');
        btnSubmit.disabled = true;
        try {
            if (compressedImgData) formData.foto_url = compressedImgData;
            await updateDoc(doc(db, "biodiversity", editId), formData);
            showModal("Sukses", "Data server diperbarui.");
            resetFormState(); switchTab('admin-dashboard-tab'); initGlobalData();
        } catch (err) { showModal("Gagal", err.message, false); }
        btnSubmit.disabled = false;
        return; 
    }

    formData.id = editId || generateUUID();
    formData.fotoBase64 = compressedImgData || document.getElementById('previewFoto').src;
    formData.createdAt = new Date().toISOString();
    formData.syncStatus = 'pending';
    formData.statusVerifikasi = "Menunggu Verifikasi";

    try {
        await saveDraftIDB(formData);
        resetFormState();
        showModal("Tersimpan!", "Data masuk ke Draft lokal. Sinkronisasikan saat online.");
        renderDraftUI(); updateNetworkStatus();
    } catch (err) {
        showModal("Gagal Menyimpan", "Memori perangkat penuh atau ditolak.", false);
    }
});

function resetFormState() {
    document.getElementById('bioForm').reset();
    document.getElementById('previewBox').style.display = 'none';
    document.getElementById('editId').value = "";
    document.getElementById('btnBatalEdit').style.display = 'none';
    document.getElementById('btnSubmit').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan ke Draft Lokal';
    document.getElementById('formTitle').innerHTML = '<i class="fa-solid fa-clipboard-list"></i> Form Pendataan';
    currentFormMode = 'create'; compressedImgData = "";
    document.getElementById('gpsAccuracyInfo').innerText = "";
    setWitaTime();
}
document.getElementById('btnBatalEdit').addEventListener('click', resetFormState);

// Drafts UI
window.editDraft = async function(id) {
    const drafts = await getDraftsIDB();
    const d = drafts.find(x => x.id === id);
    if(!d) return;
    
    currentFormMode = 'edit-draft';
    document.getElementById('editId').value = d.id;
    document.getElementById('kategori').value = d.kategori || '';
    document.getElementById('jenisHabitat').value = d.jenisHabitat || 'Hutan';
    document.getElementById('namaLokal').value = d.namaLokal || '';
    document.getElementById('namaIlmiah').value = d.namaIlmiah || '';
    document.getElementById('lokasi').value = d.lokasi || '';
    document.getElementById('tanggal').value = d.tanggal || '';
    document.getElementById('jumlah').value = d.jumlah || 1;
    document.getElementById('kondisiHabitat').value = d.kondisiHabitat || 'Sangat Baik';
    document.getElementById('statusIdentifikasi').value = d.statusIdentifikasi || 'Terverifikasi Lapangan';
    document.getElementById('catatan').value = d.catatan || '';
    document.getElementById('previewFoto').src = d.fotoBase64;
    document.getElementById('previewBox').style.display = 'block';
    
    document.getElementById('formTitle').innerHTML = '<i class="fa-solid fa-pen-nib"></i> Edit Draft';
    document.getElementById('btnSubmit').innerHTML = '<i class="fa-solid fa-check"></i> Perbarui Draft';
    document.getElementById('btnBatalEdit').style.display = 'inline-flex';
    switchTab('form-tab', document.querySelectorAll('.nav-btn')[1]);
}

window.deleteDraft = function(id) {
    showConfirmModal("Hapus", "Yakin hapus draf lokal ini?", async () => {
        await deleteDraftIDB(id);
        renderDraftUI(); updateNetworkStatus();
    });
}

async function renderDraftUI() {
    const drafts = await getDraftsIDB();
    const list = document.getElementById('draftList');
    
    if (drafts.length > 0) {
        document.getElementById('btnUpload').style.display = 'inline-flex';
        list.innerHTML = drafts.map(d => `
            <div class="draft-card">
                <img src="${escapeHTML(d.fotoBase64)}" alt="Eviden">
                <div class="draft-body">
                    <div class="draft-meta">
                        <span class="draft-badge ${d.kategori==='Flora'?'badge-flora':'badge-fauna'}">${escapeHTML(d.kategori)}</span>
                        <span class="draft-badge badge-status">${escapeHTML(d.syncStatus)}</span>
                    </div>
                    <h3>${escapeHTML(d.namaLokal)}</h3>
                    <p><i class="fa-solid fa-location-dot"></i> ${escapeHTML(d.lokasi)}</p>
                    <div class="draft-actions">
                        <button type="button" class="btn btn-outline" onclick="editDraft('${d.id}')">Edit</button>
                        <button type="button" class="btn btn-danger" onclick="deleteDraft('${d.id}')">Hapus</button>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        document.getElementById('btnUpload').style.display = 'none';
        list.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--color-gray);">Belum ada draft tersimpan.</div>';
    }
}
renderDraftUI();

// Sinkronisasi
document.getElementById('btnUpload').addEventListener('click', async () => {
    if(!navigator.onLine) return showModal("Offline", "Koneksi internet diperlukan.", false);
    let drafts = await getDraftsIDB();
    if(drafts.length === 0) return;

    const btn = document.getElementById('btnUpload');
    const pBox = document.getElementById('syncProgressBox');
    const pBar = document.getElementById('syncProgressBar');
    const pText = document.getElementById('syncStatusText');
    
    btn.disabled = true; pBox.style.display = 'block';
    let sCount = 0, fCount = 0;

    for (let i = 0; i < drafts.length; i++) {
        let d = drafts[i];
        pBar.style.width = `${Math.round((i/drafts.length)*100)}%`;
        pText.innerText = `Kirim ${i+1}/${drafts.length}...`;

        try {
            await setDoc(doc(db, "biodiversity", d.id), {
                kategori: d.kategori, jenisHabitat: d.jenisHabitat,
                namaLokal: d.namaLokal, namaIlmiah: d.namaIlmiah,
                lokasi: d.lokasi, latitude: d.latitude, longitude: d.longitude,
                tanggal: d.tanggal, jumlah: d.jumlah,
                kondisiHabitat: d.kondisiHabitat, statusIdentifikasi: d.statusIdentifikasi,
                catatan: d.catatan, statusVerifikasi: d.statusVerifikasi,
                foto_url: d.fotoBase64, timestamp: serverTimestamp(), createdAt: d.createdAt
            });
            await deleteDraftIDB(d.id); 
            sCount++;
        } catch (err) {
            console.error(err);
            d.syncStatus = 'failed';
            await saveDraftIDB(d); 
            fCount++;
        }
    }

    pBar.style.width = '100%';
    setTimeout(() => {
        pBox.style.display = 'none'; btn.disabled = false;
        renderDraftUI(); updateNetworkStatus(); initGlobalData();
        showModal("Laporan", `${sCount} data berhasil, ${fCount} gagal disinkron.`);
    }, 1500);
});

// Data Publik & Beranda
async function initGlobalData() {
    try {
        const qSnap = await getDocs(collection(db, "biodiversity"));
        globalFetchedMarkers = [];
        let floraCount = 0, faunaCount = 0, totInd = 0;
        let uSpec = new Set();

        qSnap.forEach((ds) => {
            const d = ds.data(); d.docId = ds.id;
            globalFetchedMarkers.push(d);
            if(d.statusVerifikasi === 'Terverifikasi') { 
                if (d.kategori === 'Flora') floraCount++; else faunaCount++;
                totInd += d.jumlah;
                uSpec.add((d.namaLokal||'').toLowerCase());
            }
        });

        document.querySelectorAll('.skeleton-text').forEach(el => el.classList.remove('skeleton-text'));
        document.getElementById('publicFlora').innerText = floraCount;
        document.getElementById('publicFauna').innerText = faunaCount;
        document.getElementById('publicUniqueSpecies').innerText = uSpec.size;
        document.getElementById('publicTotalIndividu').innerText = totInd;

        renderFilteredMap();
        renderRecentObservations(globalFetchedMarkers.filter(x => x.statusVerifikasi === 'Terverifikasi'));
    } catch (err) { console.error(err); }
}
initGlobalData();

function renderRecentObservations(dataArray) {
    const box = document.getElementById('recentObservationsContainer');
    if (dataArray.length === 0) return box.innerHTML = '<p class="text-center w-100">Belum ada observasi publik.</p>';
    
    const sorted = [...dataArray].sort((a, b) => new Date(b.tanggal||0) - new Date(a.tanggal||0)).slice(0, 4);
    box.innerHTML = sorted.map(d => `
        <div class="recent-obs-card" data-id="${escapeHTML(d.docId)}">
            <img src="${escapeHTML(d.foto_url)}" alt="Eviden">
            <div class="recent-obs-body">
                <h4>${escapeHTML(d.namaLokal)}</h4>
                <p><i class="fa-solid fa-tag"></i> ${d.jumlah} Ind.</p>
                <p><i class="fa-solid fa-location-dot"></i> ${escapeHTML((d.lokasi||'').substring(0,12))}...</p>
            </div>
        </div>
    `).join('');
}

// PERBAIKAN KLIK PENGAMATAN TERBARU: Menggunakan Event Delegation aman dari kutip string
function initRecentObsEventListener() {
    const container = document.getElementById('recentObservationsContainer');
    if(container) {
        container.addEventListener('click', (e) => {
            const card = e.target.closest('.recent-obs-card');
            if(!card) return;
            const docId = card.getAttribute('data-id');
            const d = globalFetchedMarkers.find(x => x.docId === docId);
            if(d) {
                openDetailModal(d.namaLokal, d.kategori, d.tanggal, d.lokasi, d.jumlah, d.kondisiHabitat, d.foto_url, d.catatan || '-');
            }
        });
    }
}

window.openDetailModal = function(n, k, t, l, j, h, f, c) {
    document.getElementById('detailModalBody').innerHTML = `
        <img src="${f}" style="width:100%; height:200px; object-fit:cover; border-radius:var(--radius-md); margin-bottom:15px;">
        <p><b>Spesies:</b> ${escapeHTML(n)}</p>
        <p><b>Kategori:</b> ${escapeHTML(k)}</p>
        <p><b>Waktu:</b> ${escapeHTML((t||'').replace('T', ' '))}</p>
        <p><b>GPS:</b> ${escapeHTML(l)}</p>
        <p><b>Jumlah:</b> ${escapeHTML(String(j))}</p>
        <p><b>Habitat:</b> ${escapeHTML(h)}</p>
        <p><b>Catatan:</b> ${escapeHTML(c)}</p>
    `;
    document.getElementById('detailModal').style.display = 'flex';
};

// Admin Engine
onAuthStateChanged(auth, async (user) => {
    const navAdmin = document.getElementById('nav-admin');
    if (user) {
        try {
            const uDoc = await getDoc(doc(db, "users", user.uid));
            if (uDoc.exists() && uDoc.data().role === 'admin') {
                navAdmin.innerHTML = '<i class="fa-solid fa-user-shield"></i> Admin';
                navAdmin.style.background = '#fee2e2'; navAdmin.style.color = '#b91c1c';
                if(navAdmin.classList.contains('active')) switchTab('admin-dashboard-tab');
                bootAdminEngine();
            } else {
                await signOut(auth); showModal("Ditolak", "Bukan akun Admin.", false);
            }
        } catch(e) { console.error(e); }
    } else {
        navAdmin.innerHTML = '<i class="fa-solid fa-lock"></i> Admin'; navAdmin.style = '';
        if(navAdmin.classList.contains('active')) switchTab('admin-login-tab');
        if(unsubscribeAdmin) { unsubscribeAdmin(); unsubscribeAdmin = null; }
    }
});

document.getElementById('btnLogin').addEventListener('click', () => {
    const e = document.getElementById('email').value, p = document.getElementById('password').value;
    if(!e || !p) return showModal("Perhatian", "Isi email & password.", false);
    const btn = document.getElementById('btnLogin'); btn.disabled = true; btn.innerText = "Proses...";
    signInWithEmailAndPassword(auth, e, p)
        .then(() => { btn.disabled = false; btn.innerText = "Login Akses"; })
        .catch(() => { showModal("Gagal", "Kredensial salah.", false); btn.disabled = false; btn.innerText = "Login Akses"; });
});
document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

let masterData = [], filteredData = [];
let currentPage = 1, rowsPerPage = 10, currentSort = { col: 'tanggal', dir: 'desc' };
let unsubscribeAdmin = null;

function bootAdminEngine() {
    if (unsubscribeAdmin) unsubscribeAdmin();
    unsubscribeAdmin = onSnapshot(query(collection(db, "biodiversity")), (snap) => {
        masterData = [];
        let f = 0, a = 0, pend = 0;
        let hab = {"Sangat Baik":0, "Sedang":0, "Buruk":0};

        snap.forEach(ds => {
            const d = ds.data(); d.docId = ds.id; masterData.push(d);
            if(d.kategori === 'Flora') f++; else a++;
            if(d.statusVerifikasi === 'Menunggu Verifikasi') pend++;
            if(hab[d.kondisiHabitat] !== undefined) hab[d.kondisiHabitat]++;
        });
        
        document.getElementById('adminTotFlora').innerText = f;
        document.getElementById('adminTotFauna').innerText = a;
        document.getElementById('adminPending').innerText = pend;

        drawCharts(f, a, hab["Sangat Baik"], hab["Sedang"], hab["Buruk"]);
        applyAdminFilters();
    });
}

function drawCharts(f, a, sb, s, b) {
    if(window.c1) window.c1.destroy(); if(window.c2) window.c2.destroy();
    window.c1 = new Chart(document.getElementById('kategoriChart'), { type: 'pie', data: { labels: ['Flora', 'Fauna'], datasets: [{ data: [f, a], backgroundColor: ['#059669', '#3b82f6'] }] }, options: { maintainAspectRatio: false } });
    window.c2 = new Chart(document.getElementById('habitatChart'), { type: 'bar', data: { labels: ['Baik', 'Sedang', 'Buruk'], datasets: [{ label: 'Observasi', data: [sb, s, b], backgroundColor: '#f59e0b' }] }, options: { maintainAspectRatio: false } });
}

document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; applyAdminFilters(); });
document.getElementById('filterKategoriAdmin').addEventListener('change', () => { currentPage = 1; applyAdminFilters(); });
document.getElementById('rowsPerPage').addEventListener('change', (e) => { rowsPerPage = parseInt(e.target.value); currentPage = 1; applyAdminFilters(); });
document.getElementById('btnPrevPage').addEventListener('click', () => { if(currentPage > 1) { currentPage--; renderAdminTable(); }});
document.getElementById('btnNextPage').addEventListener('click', () => { if(currentPage < Math.ceil(filteredData.length/rowsPerPage)) { currentPage++; renderAdminTable(); }});

window.switchTab = function(tabId, element = null) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if (tabId === 'admin-login-tab' && auth.currentUser) document.getElementById('admin-dashboard-tab').classList.add('active');
    else document.getElementById(tabId).classList.add('active');
    
    if (element) element.classList.add('active');
    else {
        const targetBtn = Array.from(document.querySelectorAll('.nav-btn')).find(btn => btn.getAttribute('onclick')?.includes(tabId));
        if(targetBtn) targetBtn.classList.add('active');
    }
    if(tabId === 'home-tab') setTimeout(() => map.invalidateSize(), 150);
    document.getElementById('navMenu').classList.remove('show');
};

document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    const nav = document.getElementById('navMenu');
    nav.classList.toggle('show');
});

window.showModal = function(title, message, isSuccess = true) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerText = message;
    document.getElementById('modalIcon').innerHTML = isSuccess ? '<i class="fa-solid fa-circle-check" style="color: var(--color-brand);"></i>' : '<i class="fa-solid fa-circle-exclamation" style="color: var(--color-danger);"></i>';
    document.getElementById('modalActions').innerHTML = `<button type="button" class="btn btn-primary w-100" onclick="closeModal()">Tutup</button>`;
    document.getElementById('customModal').style.display = 'flex';
};

window.showConfirmModal = function(title, message, onConfirmCallback) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerText = message;
    document.getElementById('modalIcon').innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--color-danger);"></i>';
    document.getElementById('modalActions').innerHTML = `<button type="button" class="btn btn-outline w-100" onclick="closeModal()">Batal</button><button type="button" class="btn btn-danger w-100" id="modalConfirmBtn">Lanjutkan</button>`;
    document.getElementById('modalConfirmBtn').onclick = function() { closeModal(); onConfirmCallback(); };
    document.getElementById('customModal').style.display = 'flex';
};

window.closeModal = function() { document.getElementById('customModal').style.display = 'none'; };
window.closeDetailModal = function() { document.getElementById('detailModal').style.display = 'none'; };

window.sortTable = function(col) {
    if(currentSort.col === col) currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    else { currentSort.col = col; currentSort.dir = 'asc'; }
    applyAdminFilters();
};

function applyAdminFilters() {
    const key = document.getElementById('searchInput').value.toLowerCase();
    const kat = document.getElementById('filterKategoriAdmin').value;
    
    filteredData = masterData.filter(d => {
        return ((d.namaLokal||'').toLowerCase().includes(key) || (d.lokasi||'').toLowerCase().includes(key)) 
            && (kat ? d.kategori === kat : true);
    });

    filteredData.sort((a, b) => {
        let valA = a[currentSort.col], valB = b[currentSort.col];
        if(typeof valA === 'string') valA = valA.toLowerCase();
        if(typeof valB === 'string') valB = valB.toLowerCase();
        if(valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
        if(valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
        return 0;
    });
    renderAdminTable();
}

function renderAdminTable() {
    const tbody = document.getElementById('tableBody');
    const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
    document.getElementById('pageInfo').innerText = `Hal ${currentPage} / ${totalPages}`;
    document.getElementById('btnPrevPage').disabled = currentPage === 1;
    document.getElementById('btnNextPage').disabled = currentPage === totalPages;

    const start = (currentPage - 1) * rowsPerPage;
    const paginated = filteredData.slice(start, start + rowsPerPage);

    if(paginated.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 20px;">Kosong.</td></tr>'; return; }

    tbody.innerHTML = paginated.map(d => `
        <tr>
            <td><span class="draft-badge ${d.kategori==='Flora'?'badge-flora':'badge-fauna'}">${escapeHTML(d.kategori)}</span></td>
            <td><strong>${escapeHTML(d.namaLokal)}</strong></td>
            <td>${escapeHTML((d.tanggal||'').split('T')[0])}</td>
            <td><small>${escapeHTML((d.lokasi||'').substring(0,15))}</small></td>
            <td>${d.jumlah}</td>
            <td>
                <img src="${escapeHTML(d.foto_url)}" alt="Foto" style="width:40px; height:40px; object-fit:cover; border-radius:6px; cursor:pointer; border:1px solid #e5e7eb;" onclick="openDetailModal('${escapeHTML(d.namaLokal)}', '${escapeHTML(d.kategori)}', '${escapeHTML(d.tanggal)}', '${escapeHTML(d.lokasi)}', '${d.jumlah}', '${escapeHTML(d.kondisiHabitat)}', '${escapeHTML(d.foto_url)}', '${escapeHTML(d.catatan||'-')}')">
            </td>
            <td><span class="draft-badge" style="background:${d.statusVerifikasi==='Terverifikasi'?'#d1fae5':'#fef3c7'}">${escapeHTML(d.statusVerifikasi)}</span></td>
            <td>
                <div style="display:flex; gap:4px;">
                    <button type="button" class="btn btn-success btn-sm" title="Verifikasi" onclick="verifyServerData('${d.docId}', 'Terverifikasi')"><i class="fa-solid fa-check"></i></button>
                    <button type="button" class="btn btn-outline btn-sm" title="Edit" onclick="editServerData('${d.docId}')"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="btn btn-danger btn-sm" title="Hapus" onclick="deleteServerData('${d.docId}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

window.verifyServerData = async function(docId, newStatus) {
    try { await updateDoc(doc(db, "biodiversity", docId), { statusVerifikasi: newStatus, updatedAt: serverTimestamp() }); } 
    catch(err) { showModal("Gagal", err.message, false); }
};

window.deleteServerData = function(docId) {
    showConfirmModal("Hapus", "Hapus permanen dari cloud?", async () => {
        try { await deleteDoc(doc(db, "biodiversity", docId)); } catch(err) { showModal("Gagal", err.message, false); }
    });
};

window.editServerData = function(docId) {
    let d = masterData.find(x => x.docId === docId);
    if(!d) return;
    currentFormMode = 'edit-server';
    document.getElementById('editId').value = d.docId;
    document.getElementById('kategori').value = d.kategori;
    document.getElementById('jenisHabitat').value = d.jenisHabitat;
    document.getElementById('namaLokal').value = d.namaLokal;
    document.getElementById('namaIlmiah').value = d.namaIlmiah;
    document.getElementById('lokasi').value = d.lokasi;
    document.getElementById('tanggal').value = d.tanggal;
    document.getElementById('jumlah').value = d.jumlah;
    document.getElementById('kondisiHabitat').value = d.kondisiHabitat;
    document.getElementById('statusIdentifikasi').value = d.statusIdentifikasi;
    document.getElementById('catatan').value = d.catatan;
    document.getElementById('previewFoto').src = d.foto_url;
    document.getElementById('previewBox').style.display = 'block';

    document.getElementById('formTitle').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit Server';
    document.getElementById('btnSubmit').innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Update Server';
    document.getElementById('btnBatalEdit').style.display = 'inline-flex';
    switchTab('form-tab', document.querySelectorAll('.nav-btn')[1]);
};

document.getElementById('btnExport').addEventListener('click', () => {
    if(!filteredData.length) return;
    let csv = "\uFEFFID,Waktu,Kategori,Nama_Lokal,Latitude,Longitude,Populasi,Kond_Habitat,Status\n";
    filteredData.forEach(r => {
        let n = (r.namaLokal||'').replace(/"/g, '""');
        let cn = /^(=|\+|-|@)/.test(n) ? `'${n}` : n;
        csv += `"${r.docId}","${r.tanggal}","${r.kategori}","${cn}",${r.latitude},${r.longitude},${r.jumlah},"${r.kondisiHabitat}","${r.statusVerifikasi}"\n`;
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `WildLens_Data_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

// ---------------------------------------------------------
// PENGAMAN DARURAT MODAL (Mencegah Layar Freeze / Terkunci)
// ---------------------------------------------------------
window.closeModal = function() { 
    const modal = document.getElementById('customModal');
    if(modal) modal.style.display = 'none'; 
};

window.closeDetailModal = function() { 
    const modal = document.getElementById('detailModal');
    if(modal) modal.style.display = 'none'; 
};

// 1. Tutup modal otomatis jika pengguna menekan tombol ESC di keyboard
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeDetailModal();
    }
});

// 2. Tutup modal otomatis jika pengguna mengklik area gelap (backdrop) di luar kotak modal
window.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('modal-backdrop')) {
        closeModal();
        closeDetailModal();
    }
});