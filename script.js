(function() {
    "use strict";

    /* ===================================================
       DOM REFERENCES
       =================================================== */
    const introSplash   = document.getElementById('introSplash');
    const passwordOverlay   = document.getElementById('passwordOverlay');
    const passwordBox       = document.querySelector('.password-box');
    const passwordInput     = document.getElementById('passwordInput');
    const passwordSubmit    = document.getElementById('passwordSubmit');
    const passwordError     = document.getElementById('passwordError');
    const appContainer      = document.getElementById('appContainer');

    const galleryStage      = document.getElementById('galleryStage');
    const mainFrameWrapper  = document.getElementById('mainFrameWrapper');
    const ornateFrame       = document.getElementById('ornateFrame');
    const mainImage         = document.getElementById('mainImage');
    const btnUpload         = document.getElementById('btnUpload');
    const btnReset          = document.getElementById('btnReset');
    const fileInput         = document.getElementById('fileInput');
    const toast             = document.getElementById('toast');
    const particlesLayer    = document.getElementById('particlesLayer');
    const dropHint          = document.getElementById('dropHint');
    const uploadLoading     = document.getElementById('uploadLoading');

    // Music panel
    const musicToggle       = document.getElementById('musicToggle');
    const volumeSlider      = document.getElementById('volumeSlider');
    const audioFileInput    = document.getElementById('audioFileInput');
    const playlistBtn       = document.getElementById('playlistBtn');
    const playlistPanel     = document.getElementById('playlistPanel');
    const playlistTracks    = document.getElementById('playlistTracks');
    const prevBtn           = document.getElementById('prevBtn');
    const nextBtn           = document.getElementById('nextBtn');
    const shuffleBtn        = document.getElementById('shuffleBtn');
    const nowPlayingSpan    = document.getElementById('nowPlaying');
    const playlistEmpty     = document.querySelector('.playlist-empty');
    const visualizer        = document.getElementById('visualizer');

    /* ===================================================
       CONSTANTS & STATE
       =================================================== */
    const STORAGE_KEY       = 'romantic_gallery_images';
    const CORRECT_PASSWORD  = 'nssystems';
    const BACKEND_PASSWORD  = 'niteshdalal';
    const MUSIC_FOLDER      = 'music/';
    const MUSIC_MANIFEST    = 'music/playlist.txt';
    const DB_NAME           = 'romantic_gallery_db';
    const DB_VERSION        = 1;
    const SONGS_STORE       = 'songs';

    // Self-contained fallback artwork shown if a photo URL ever fails to
    // load (broken link, offline, host blocked it, etc.) — guarantees the
    // frame/thumbnail never looks "empty", with zero external requests.
    const PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">' +
        '<rect width="400" height="500" fill="#f8e6e2"/>' +
        '<rect x="14" y="14" width="372" height="472" fill="none" stroke="#c9a96e" stroke-width="2"/>' +
        '<path d="M200,182 C180,142 118,140 96,180 C74,220 118,264 200,335 C282,264 326,220 304,180 C282,140 220,142 200,182 Z" ' +
            'fill="none" stroke="#c9a96e" stroke-width="5"/>' +
        '<text x="200" y="405" font-family="Georgia, serif" font-size="24" font-style="italic" fill="#8b3a3a" text-anchor="middle">Add a photo</text>' +
        '</svg>';
    const PLACEHOLDER_IMG = 'data:image/svg+xml,' + encodeURIComponent(PLACEHOLDER_SVG);

    let allImages           = [];
    let mainImageIndex      = 0;
    let thumbnailElements   = [];
    let toastTimer          = null;

    // Music state
    let audioCtx            = null;
    let musicGain           = null;
    let musicInterval       = null;
    let isMusicPlaying      = false;
    // The playlist always starts with the built‑in ambient track.
    let customTracks = [
        {
            name: 'Romantic Ambient (built‑in)',
            dataUrl: 'default_ambient',   // special marker for Web Audio
            isDefault: true
        }
    ];
    let currentTrackIndex   = 0;
    let currentAudioElement = null;
    let isShuffle           = false;

    // Diagnostics for the /music folder system — surfaced as a toast
    // after unlock so problems are visible without opening devtools.
    let musicLibraryStatus  = 'no-manifest'; // 'loaded' | 'empty-manifest' | 'file-protocol' | 'fetch-failed' | 'no-manifest'
    let musicLibraryCount   = 0;

    // Small helper: safely render user‑provided file names in the playlist.
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    /* ===================================================
       DEFAULT IMAGES (the 11 URLs you provided)
       =================================================== */
    function generateDefaultImages() {
    const filenames = [
        '01.jpg',
        '02.jpg',
        '03.jpg',
        '04.jpg',
        '05.jpg',
        '06.jpg',
        '07.jpg',
        '08.jpg',
        '09.jpg',
        '10.jpg',
        '11.jpg',
        '12.jpg',
        '13.jpg'
    ];
    return filenames.map((name, i) => ({
        id: `default_${i}`,
        isDefault: true,
        dataUrl: `images/${name}`   // <-- local folder
    }));
}

    /* ===================================================
       LOCAL STORAGE (user‑uploaded photos)
       =================================================== */
    function loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length)
                    return parsed.filter(img => img && img.dataUrl);
            }
        } catch(e) { console.warn('Failed to load gallery:', e); }
        return null;
    }

    function saveToStorage(images) {
        try {
            const userImages = images.filter(img => !img.isDefault);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userImages));
        } catch(e) {
            if (e.name === 'QuotaExceededError') showToast('⚠️ Storage full! Delete some photos.');
        }
    }

    function initializeImages() {
        const defaults = generateDefaultImages();
        const stored = loadFromStorage();
        if (stored && stored.length) {
            allImages = [...defaults, ...stored.map((img, i) => ({
                ...img,
                id: img.id || 'user_' + Date.now() + '_' + i,
                isDefault: false
            }))];
        } else {
            allImages = [...defaults];
        }
        // Random main photo on every load / reset
        mainImageIndex = Math.floor(Math.random() * allImages.length);
        updateResetButton();
    }

    function updateResetButton() {
        btnReset.style.display = allImages.some(img => !img.isDefault) ? 'inline-flex' : 'none';
    }

    /* ===================================================
       SONG LIBRARY — persistence + zero‑edit folder loading
       ===================================================

       Two ways songs get into the playlist, both automatic:

       1) "music/playlist.txt" — drop an audio file into the /music
          folder next to index.html, add its filename on its own line
          in music/playlist.txt, and it shows up for EVERY visitor,
          on every device, forever. No HTML/CSS/JS editing required.

       2) The 🎶 upload button — songs picked here are saved into the
          browser's IndexedDB, so they now persist across refreshes
          on that device (previously they vanished on reload).
       =================================================== */

    // ---- IndexedDB (per‑device song storage) ----
    function openSongDB() {
        return new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) { reject(new Error('IndexedDB unsupported')); return; }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(SONGS_STORE)) {
                    db.createObjectStore(SONGS_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    async function dbGetAllSongs() {
        try {
            const db = await openSongDB();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(SONGS_STORE, 'readonly');
                const req = tx.objectStore(SONGS_STORE).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror   = () => reject(req.error);
            });
        } catch(e) { console.warn('Song DB read failed:', e); return []; }
    }

    async function dbPutSong(song) {
        try {
            const db = await openSongDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(SONGS_STORE, 'readwrite');
                tx.objectStore(SONGS_STORE).put(song);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
            return true;
        } catch(e) { console.warn('Song DB write failed:', e); return false; }
    }

    async function dbDeleteSong(id) {
        try {
            const db = await openSongDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(SONGS_STORE, 'readwrite');
                tx.objectStore(SONGS_STORE).delete(id);
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch(e) { console.warn('Song DB delete failed:', e); }
    }

    // ---- Folder playlist (music/playlist.txt) ----
    // Turns "our_first_dance.mp3" into "Our First Dance".
    // Supports an optional custom title: "file.mp3 | Custom Title"
    function prettifyTrackName(filename) {
        const base = filename.replace(/\.[a-zA-Z0-9]+$/, '');
        return base
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, c => c.toUpperCase()) || filename;
    }

    async function loadFolderPlaylist() {
        if (location.protocol === 'file:') {
            musicLibraryStatus = 'file-protocol';
            return;
        }
        try {
            const res = await fetch(MUSIC_MANIFEST, { cache: 'no-store' });
            if (!res.ok) { musicLibraryStatus = 'no-manifest'; return; }
            const text = await res.text();
            const lines = text.split(/\r?\n/);
            let added = 0;
            for (const raw of lines) {
                const line = raw.trim();
                if (!line || line.startsWith('#')) continue;
                const [filePart, titlePart] = line.split('|').map(s => s && s.trim());
                if (!filePart) continue;
                customTracks.push({
                    name: titlePart || prettifyTrackName(filePart),
                    dataUrl: MUSIC_FOLDER + filePart,
                    isDefault: false,
                    isFolder: true
                });
                added++;
            }
            musicLibraryCount = added;
            musicLibraryStatus = added > 0 ? 'loaded' : 'empty-manifest';
            if (added) console.info(`🎵 Loaded ${added} song(s) from music/playlist.txt`);
        } catch(e) {
            // Likely a network/CORS issue (e.g. opened from file:// after all)
            musicLibraryStatus = 'fetch-failed';
            console.info('music/playlist.txt could not be loaded:', e);
        }
    }

    // ---- Stored uploads (IndexedDB) ----
    async function loadStoredSongs() {
        const songs = await dbGetAllSongs();
        songs.forEach(song => {
            customTracks.push({
                id: song.id,
                name: song.name,
                dataUrl: song.dataUrl,
                isDefault: false,
                isStored: true
            });
        });
        if (songs.length) console.info(`🎶 Restored ${songs.length} previously uploaded song(s)`);
    }

    /* ===================================================
       GALLERY RENDERING
       =================================================== */
    function renderAll() {
        updateMainImage();
        renderThumbnails();
        updateResetButton();
    }

    function updateMainImage() {
        if (!allImages.length) return;
        const img = allImages[mainImageIndex];
        if (!img || !img.dataUrl) return;
        ornateFrame.classList.add('swapping');
        mainImage.src = img.dataUrl;
        mainImage.onerror = () => {
            mainImage.onerror = null;
            mainImage.src = PLACEHOLDER_IMG;
        };
        setTimeout(() => ornateFrame.classList.remove('swapping'), 500);
    }

    function renderThumbnails() {
        // Remove old ones
        thumbnailElements.forEach(item => item.el.remove());
        thumbnailElements = [];

        // All images except the currently displayed one
        const indices = allImages.reduce((arr, _, i) => {
            if (i !== mainImageIndex) arr.push(i);
            return arr;
        }, []);

        indices.forEach((imgIndex, order) => {
            const img = allImages[imgIndex];
            const thumb = document.createElement('div');
            thumb.className = 'thumbnail-item';
            thumb.setAttribute('data-index', imgIndex);
            thumb.innerHTML = `
                <img src="${escapeHtml(img.dataUrl)}" alt="Thumb" draggable="false" loading="lazy">
                ${!img.isDefault ? '<span class="delete-badge" title="Remove photo">×</span>' : ''}
            `;
            const thumbImg = thumb.querySelector('img');
            thumbImg.addEventListener('error', () => {
                thumbImg.onerror = null;
                thumbImg.src = PLACEHOLDER_IMG;
            }, { once: true });
            thumb.addEventListener('click', e => {
                if (!e.target.classList.contains('delete-badge')) swapImages(imgIndex);
            });
            const badge = thumb.querySelector('.delete-badge');
            if (badge) {
                badge.addEventListener('click', e => {
                    e.stopPropagation();
                    deleteUserImage(imgIndex);
                });
            }
            galleryStage.appendChild(thumb);
            thumbnailElements.push({ el: thumb, index: imgIndex, order });
        });

        requestAnimationFrame(() => positionThumbnails());
    }

    function positionThumbnails() {
        if (!thumbnailElements.length) return;
        const sr = galleryStage.getBoundingClientRect();
        const sw = sr.width, sh = sr.height;
        const fw = mainFrameWrapper.offsetWidth, fh = mainFrameWrapper.offsetHeight;
        const fl = mainFrameWrapper.offsetLeft, ft = mainFrameWrapper.offsetTop;
        const fcx = fl + fw / 2, fcy = ft + fh / 2;
        const cnt = thumbnailElements.length;
        const rx = Math.max(fw * 0.85, sw * 0.35);
        const ry = Math.max(fh * 0.7, sh * 0.3);

        thumbnailElements.forEach((item, i) => {
            const el = item.el;
            const angle = -Math.PI/2 + (i / cnt) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
            const rxJ = rx * (0.9 + Math.random() * 0.2);
            const ryJ = ry * (0.9 + Math.random() * 0.2);
            const cx = fcx + Math.cos(angle) * rxJ;
            const cy = fcy + Math.sin(angle) * ryJ;
            const tw = el.offsetWidth || 90, th = el.offsetHeight || 112;
            const left = Math.max(4, Math.min(sw - tw - 4, cx - tw / 2));
            const top  = Math.max(4, Math.min(sh - th - 4, cy - th / 2));
            const rot = (Math.random() - 0.5) * 10;
            el.style.left = left + 'px';
            el.style.top  = top  + 'px';
            el.style.transform = `rotate(${rot}deg)`;
            el.setAttribute('data-base-rotation', rot);
            // Hover effect
            el.addEventListener('mouseenter', function() {
                this.style.transform = `rotate(${rot * 0.3}deg) scale(1.12) translateY(-6px)`;
            });
            el.addEventListener('mouseleave', function() {
                this.style.transform = `rotate(${rot}deg)`;
            });
        });
    }

    /* ===================================================
       INTERACTIONS
       =================================================== */
    function swapImages(clickedIndex) {
        if (clickedIndex === mainImageIndex || clickedIndex < 0 || clickedIndex >= allImages.length) return;
        const thumb = thumbnailElements.find(t => t.index === clickedIndex);
        if (thumb) spawnSparklesAt(thumb.el);
        mainImageIndex = clickedIndex;
        renderAll();
        saveToStorage(allImages);
    }

    function deleteUserImage(index) {
        if (allImages[index].isDefault) return;
        allImages.splice(index, 1);
        if (mainImageIndex >= allImages.length) mainImageIndex = allImages.length - 1;
        if (index < mainImageIndex) mainImageIndex--;
        if (mainImageIndex < 0) mainImageIndex = 0;
        renderAll();
        saveToStorage(allImages);
        showToast('💔 Photo removed');
    }

    function resetGallery() {
        allImages = generateDefaultImages();
        mainImageIndex = Math.floor(Math.random() * allImages.length);
        localStorage.removeItem(STORAGE_KEY);
        renderAll();
        showToast('✨ Gallery reset');
    }

    /* ===================================================
       IMAGE UPLOAD (unlimited)
       =================================================== */
    function handleFileUpload(files) {
        if (!files || !files.length) return;
        uploadLoading.classList.add('show');
        let processed = 0;
        const newImgs = [];
        const total = files.length;
        for (let i = 0; i < total; i++) {
            const file = files[i];
            if (!file.type.startsWith('image/')) {
                processed++;
                if (processed === total) finalizeUpload(newImgs);
                continue;
            }
            const reader = new FileReader();
            reader.onload = e => {
                resizeImage(e.target.result, 800, 800, resized => {
                    newImgs.push({
                        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                        isDefault: false,
                        dataUrl: resized
                    });
                    processed++;
                    if (processed === total) finalizeUpload(newImgs);
                });
            };
            reader.onerror = () => { processed++; if (processed === total) finalizeUpload(newImgs); };
            reader.readAsDataURL(file);
        }
        if (total === 0) {
            uploadLoading.classList.remove('show');
            showToast('⚠️ Please select image files.');
        }
    }

    function resizeImage(url, maxW, maxH, cb) {
        const img = new Image();
        img.onload = () => {
            let w = img.width, h = img.height;
            if (w <= maxW && h <= maxH) return cb(url);
            const ratio = Math.min(maxW / w, maxH / h);
            w = Math.round(w * ratio); h = Math.round(h * ratio);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            cb(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => cb(url);
        img.src = url;
    }

    function finalizeUpload(newImgs) {
        uploadLoading.classList.remove('show');
        if (!newImgs.length) { showToast('⚠️ No valid images.'); return; }
        allImages = [...allImages, ...newImgs];
        saveToStorage(allImages);
        renderAll();
        showToast(`💝 ${newImgs.length} photo${newImgs.length > 1 ? 's' : ''} added!`);
        fileInput.value = '';
    }

    /* ===================================================
       SPARKLE EFFECT
       =================================================== */
    function spawnSparklesAt(element) {
        const rect = element.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const emojis = ['✨','💕','💖','🌟','💗'];
        for (let i = 0; i < 8; i++) {
            const sparkle = document.createElement('span');
            sparkle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            sparkle.style.cssText = `position:fixed; left:${cx}px; top:${cy}px; font-size:${14+Math.random()*18}px; pointer-events:none; z-index:999; transition:all 0.7s; opacity:1;`;
            document.body.appendChild(sparkle);
            requestAnimationFrame(() => {
                sparkle.style.transform = `translate(${(Math.random()-0.5)*180}px, ${(Math.random()-0.5)*180}px) scale(0.2)`;
                sparkle.style.opacity = '0';
            });
            setTimeout(() => sparkle.remove(), 750);
        }
    }

    function showToast(msg) {
        if (toastTimer) clearTimeout(toastTimer);
        toast.textContent = msg;
        toast.classList.add('show');
        toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            toastTimer = null;
        }, 2200);
    }

    /* ===================================================
       MUSIC ENGINE (Playlist Player)
       =================================================== */
    function initAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            musicGain = audioCtx.createGain();
            musicGain.gain.value = volumeSlider.value / 100;
            musicGain.connect(audioCtx.destination);
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    // Built‑in ambient music (soft chords)
    function playDefaultMusic() {
        stopCustomAudio();
        initAudioContext();
        const chords = [
            [261.63, 329.63, 392.00], // C
            [293.66, 369.99, 440.00], // Dm
            [329.63, 415.30, 493.88], // Em
            [349.23, 440.00, 523.25]  // F
        ];
        let ci = 0;
        function nextChord() {
            if (!isMusicPlaying) return;
            initAudioContext();
            const freqs = chords[ci % chords.length];
            const start = audioCtx.currentTime, dur = 2.5;
            freqs.forEach(freq => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(0.15, start + 0.1);
                gain.gain.linearRampToValueAtTime(0.12, start + dur * 0.6);
                gain.gain.linearRampToValueAtTime(0, start + dur);
                osc.connect(gain);
                gain.connect(musicGain);
                osc.start(start);
                osc.stop(start + dur);
            });
            ci++;
            musicInterval = setTimeout(nextChord, dur * 1000);
        }
        nextChord();
    }

    function stopDefaultMusic() {
        if (musicInterval) {
            clearTimeout(musicInterval);
            musicInterval = null;
        }
    }

    function stopCustomAudio() {
        if (currentAudioElement) {
            currentAudioElement.pause();
            currentAudioElement.removeEventListener('ended', onTrackEnded);
            currentAudioElement = null;
        }
    }

    function onTrackEnded() {
        nextTrack();
    }

    // Play a track from the playlist
    function playCustomTrack(index) {
        if (index < 0 || index >= customTracks.length) return;
        // If it's the built‑in ambient, use the generator
        if (customTracks[index].dataUrl === 'default_ambient') {
            stopCustomAudio();
            stopDefaultMusic();
            currentTrackIndex = index;
            playDefaultMusic();
            isMusicPlaying = true;
            updateMusicUI();
            return;
        }
        // Otherwise it's a user‑uploaded song
        stopCustomAudio();
        stopDefaultMusic();
        currentTrackIndex = index;
        const track = customTracks[index];
        currentAudioElement = new Audio(track.dataUrl);
        currentAudioElement.volume = volumeSlider.value / 100;
        currentAudioElement.addEventListener('ended', onTrackEnded);
        currentAudioElement.play().catch(e => console.warn('Playback failed:', e));
        isMusicPlaying = true;
        updateMusicUI();
    }

    function resumeCustomTrack() {
        if (currentAudioElement) {
            currentAudioElement.play();
            isMusicPlaying = true;
            updateMusicUI();
        } else if (customTracks.length > 0) {
            playCustomTrack(currentTrackIndex >= 0 ? currentTrackIndex : 0);
        }
    }

    function pauseCustomTrack() {
        if (currentAudioElement) {
            currentAudioElement.pause();
            isMusicPlaying = false;
            updateMusicUI();
        } else {
            stopDefaultMusic();
            isMusicPlaying = false;
            updateMusicUI();
        }
    }

    function nextTrack() {
        if (customTracks.length === 0) return;
        if (isShuffle) {
            let next = Math.floor(Math.random() * customTracks.length);
            playCustomTrack(next);
        } else {
            playCustomTrack((currentTrackIndex + 1) % customTracks.length);
        }
    }

    function prevTrack() {
        if (customTracks.length === 0) return;
        if (isShuffle) {
            let prev = Math.floor(Math.random() * customTracks.length);
            playCustomTrack(prev);
        } else {
            playCustomTrack((currentTrackIndex - 1 + customTracks.length) % customTracks.length);
        }
    }

    function toggleShuffle() {
        isShuffle = !isShuffle;
        shuffleBtn.style.color = isShuffle ? 'var(--burgundy)' : '';
        showToast(isShuffle ? '🔀 Shuffle ON' : 'Shuffle OFF');
    }

    function startMusic() {
        if (currentTrackIndex < 0) currentTrackIndex = 0;
        playCustomTrack(currentTrackIndex);
    }

    function toggleMusic() {
        if (isMusicPlaying) {
            pauseCustomTrack();
        } else {
            if (currentAudioElement && currentAudioElement.paused) {
                resumeCustomTrack();
            } else {
                startMusic();
            }
        }
    }

    function updateMusicUI() {
        musicToggle.textContent = isMusicPlaying ? '🎶' : '🎵';
        musicToggle.classList.toggle('playing', isMusicPlaying);
        visualizer.classList.toggle('playing', isMusicPlaying);
        if (isMusicPlaying && currentTrackIndex >= 0 && customTracks.length > 0) {
            nowPlayingSpan.textContent = customTracks[currentTrackIndex].name;
        } else {
            nowPlayingSpan.textContent = 'Paused';
        }
        Array.from(playlistTracks.children).forEach(li => {
            li.classList.toggle('active', parseInt(li.dataset.index) === currentTrackIndex);
        });
    }

    // Add songs uploaded by user — now saved to IndexedDB so they
    // are still here next time the gallery is opened on this device.
    function addCustomTracks(files) {
        if (!files || !files.length) return;
        const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/'));
        if (!audioFiles.length) {
            showToast('⚠️ Please choose audio files.');
            audioFileInput.value = '';
            return;
        }
        let addedCount = 0;
        audioFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const id = 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
                const track = { id, name: file.name, dataUrl: e.target.result, isDefault: false, isStored: true };
                customTracks.push(track);
                await dbPutSong({ id, name: track.name, dataUrl: track.dataUrl });
                addedCount++;
                if (addedCount === audioFiles.length) {
                    renderPlaylist();
                    if (!isMusicPlaying) startMusic();
                    showToast(`🎶 Added ${addedCount} song${addedCount > 1 ? 's' : ''} · saved for next time`);
                }
            };
            reader.readAsDataURL(file);
        });
        audioFileInput.value = '';
    }

    function removeTrack(index) {
        const track = customTracks[index];
        if (track.isDefault) {
            showToast('Cannot remove the built‑in ambient track.');
            return;
        }
        if (track.isFolder) {
            showToast('📁 This song lives in /music — delete it there to remove it for everyone.');
            return;
        }
        if (currentTrackIndex === index) {
            stopCustomAudio();
            isMusicPlaying = false;
            currentTrackIndex = -1;
        }
        customTracks.splice(index, 1);
        if (track.isStored && track.id) dbDeleteSong(track.id);
        if (currentTrackIndex >= customTracks.length) currentTrackIndex = customTracks.length - 1;
        if (currentTrackIndex < 0 && customTracks.length > 0) currentTrackIndex = 0;
        renderPlaylist();
        if (isMusicPlaying && customTracks.length > 0) {
            playCustomTrack(currentTrackIndex);
        } else if (customTracks.length === 0) {
            stopCustomAudio();
            stopDefaultMusic();
            updateMusicUI();
        }
        showToast('🗑️ Song removed');
    }

    function renderPlaylist() {
        playlistTracks.innerHTML = '';
        if (customTracks.length === 0) {
            playlistEmpty.style.display = 'block';
        } else {
            playlistEmpty.style.display = 'none';
            customTracks.forEach((track, i) => {
                const li = document.createElement('li');
                li.dataset.index = i;
                const canDelete = !track.isDefault && !track.isFolder;
                const badge = track.isFolder
                    ? '<span class="track-badge" title="From the /music folder — everyone sees this song">📁</span>'
                    : '';
                li.innerHTML = `
                    <span class="track-name">${badge}${escapeHtml(track.name)}</span>
                    ${canDelete ? '<button class="track-delete" title="Remove song">×</button>' : ''}
                `;
                li.addEventListener('click', (e) => {
                    if (e.target.classList.contains('track-delete')) return;
                    playCustomTrack(i);
                });
                const delBtn = li.querySelector('.track-delete');
                if (delBtn) {
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        removeTrack(i);
                    });
                }
                playlistTracks.appendChild(li);
            });
        }
        updateMusicUI();
    }

    // ── Music UI events
    volumeSlider.addEventListener('input', () => {
        const vol = volumeSlider.value / 100;
        if (musicGain) musicGain.gain.value = vol;
        if (currentAudioElement) currentAudioElement.volume = vol;
    });
    playlistBtn.addEventListener('click', () => playlistPanel.classList.toggle('open'));
    audioFileInput.addEventListener('change', (e) => addCustomTracks(e.target.files));
    musicToggle.addEventListener('click', toggleMusic);
    nextBtn.addEventListener('click', nextTrack);
    prevBtn.addEventListener('click', prevTrack);
    shuffleBtn.addEventListener('click', toggleShuffle);

    // Initial playlist render (shows the built‑in track)
    renderPlaylist();

    // Bring in /music/playlist.txt songs + any previously uploaded
    // songs from this device, then refresh the playlist UI.
    (async function loadSongLibrary() {
        await loadFolderPlaylist();
        await loadStoredSongs();
        // If real songs were found, start with the first one instead of
        // the generated ambient track — that's what "47 songs imported"
        // should sound like.
        if (customTracks.length > 1 && currentTrackIndex === 0) {
            currentTrackIndex = 1;
        }
        renderPlaylist();
    })();

    /* ===================================================
       FLOATING PARTICLES
       =================================================== */
    function getParticleTarget() {
        const w = window.innerWidth;
        if (w < 480) return 12;
        if (w < 768) return 20;
        return 28;
    }

    function createParticle() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const p = document.createElement('span');
        p.className = 'particle';
        const emojis = ['🩷','💕','✨','🫧','💖','🌸','💗','🪷','💝','🌷'];
        p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        p.style.left = Math.random() * 95 + '%';
        p.style.fontSize = (12 + Math.random() * 22) + 'px';
        p.style.animationDuration = (8 + Math.random() * 16) + 's';
        p.style.animationDelay = Math.random() * 10 + 's';
        particlesLayer.appendChild(p);
        const duration = parseFloat(p.style.animationDuration) + parseFloat(p.style.animationDelay);
        setTimeout(() => { if (p.parentNode) p.remove(); }, duration * 1000 + 500);
    }

    function seedParticles() {
        const target = getParticleTarget();
        for (let i = 0; i < target; i++) setTimeout(createParticle, i * 300);
    }

    function maintainParticles() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const cur = particlesLayer.children.length;
        const target = getParticleTarget();
        if (cur < target) {
            for (let i = 0; i < target - cur; i++) createParticle();
        }
    }

    /* ===================================================
       EVENT LISTENERS (GALLERY)
       =================================================== */
    btnUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => handleFileUpload(e.target.files));
    btnReset.addEventListener('click', () => {
        if (confirm('Reset gallery to default romantic photos? Uploaded photos will be removed.')) resetGallery();
    });

    window.addEventListener('resize', () => {
        clearTimeout(window._resizeDebounce);
        window._resizeDebounce = setTimeout(positionThumbnails, 250);
    });

    // Drag & drop
    galleryStage.addEventListener('dragover', e => {
        e.preventDefault();
        dropHint.classList.add('show');
    });
    galleryStage.addEventListener('dragleave', e => {
        e.preventDefault();
        dropHint.classList.remove('show');
    });
    galleryStage.addEventListener('drop', e => {
        e.preventDefault();
        dropHint.classList.remove('show');
        handleFileUpload(e.dataTransfer.files);
    });

    // Keyboard navigation
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            swapImages((mainImageIndex + 1) % allImages.length);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            swapImages((mainImageIndex - 1 + allImages.length) % allImages.length);
        }
    });

    /* ===================================================
       INTRO & PASSWORD LOGIC
       =================================================== */
    function showPasswordScreen() {
        introSplash.classList.add('hide');
        setTimeout(() => {
            introSplash.style.display = 'none';
            passwordOverlay.style.display = 'flex';
            passwordInput.focus();
        }, 1000);
    }

    /* ===================================================
       MAIN FRAME — gentle 3D "locket" tilt on mouse move
       =================================================== */
    function initFrameTilt() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        if (!window.matchMedia('(hover: hover)').matches) return; // skip touch devices
        const maxTilt = 7; // degrees
        mainFrameWrapper.addEventListener('mousemove', e => {
            const rect = ornateFrame.getBoundingClientRect();
            const px = (e.clientX - rect.left) / rect.width;
            const py = (e.clientY - rect.top) / rect.height;
            const rotateY = (px - 0.5) * 2 * maxTilt;
            const rotateX = (0.5 - py) * 2 * maxTilt;
            ornateFrame.classList.add('tilting');
            ornateFrame.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        });
        mainFrameWrapper.addEventListener('mouseleave', () => {
            ornateFrame.classList.remove('tilting');
            ornateFrame.style.transform = 'rotateX(0deg) rotateY(0deg)';
        });
    }

    // Tells the user, via toast, what happened when loading /music —
    // so a misconfigured playlist.txt is visible without devtools.
    function announceMusicLibraryStatus() {
        setTimeout(() => {
            if (musicLibraryStatus === 'file-protocol' || musicLibraryStatus === 'fetch-failed') {
                showToast('📁 Open via http(s):// (not by double‑clicking the file) to load /music songs');
            } else if (musicLibraryStatus === 'empty-manifest') {
                showToast('📁 playlist.txt found, but no songs listed — add filenames there');
            } else if (musicLibraryStatus === 'loaded') {
                showToast(`🎵 Loaded ${musicLibraryCount} song${musicLibraryCount > 1 ? 's' : ''} from your music folder`);
            }
            // 'no-manifest' = no /music/playlist.txt yet — totally normal, stay quiet.
        }, 1800);
    }

    function unlockApp() {
        passwordOverlay.style.display = 'none';
        appContainer.style.display = 'flex';
        initializeImages();
        renderAll();
        seedParticles();
        setInterval(maintainParticles, 8000);
        setTimeout(positionThumbnails, 300);
        setTimeout(positionThumbnails, 800);
        initFrameTilt();
        announceMusicLibraryStatus();
        // Start music automatically (prefers your own songs if any were found)
        startMusic();
    }

    passwordSubmit.addEventListener('click', () => {
        if (passwordInput.value === CORRECT_PASSWORD) {
            passwordError.textContent = '';
            unlockApp();
        } else {
            passwordError.textContent = 'Wrong password! Try again.';
            passwordInput.value = '';
            passwordInput.focus();
            passwordBox.classList.remove('shake');
            requestAnimationFrame(() => passwordBox.classList.add('shake'));
        }
    });
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') passwordSubmit.click();
    });

    // Start intro sequence
    function startIntro() {
        introSplash.classList.add('show');
        setTimeout(showPasswordScreen, 2500);
    }

    // Initial hiding
    passwordOverlay.style.display = 'none';
    appContainer.style.display = 'none';
    startIntro();

})();