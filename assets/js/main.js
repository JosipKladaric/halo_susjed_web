import { supabaseClient } from './config.js';
import { state } from './state.js';
import { initAuth, handleAuthStateChange } from './auth.js';
import { initSearch, initForm, deleteAd, fetchUserAds } from './feed.js';
import { handleRespond, fetchMessages, goBackToConversations } from './chat.js';
import { detectLocation } from './location.js';

window.deleteAd = deleteAd;
window.handleRespond = handleRespond;
window.goBackToConversations = goBackToConversations;
const viewerStates = new Map();

function resetBrowserZoom() {
    document.body.style.zoom = '100%';
    document.documentElement.style.zoom = '100%';
}

function getViewerState(kind) {
    if (!viewerStates.has(kind)) {
        viewerStates.set(kind, {
            scale: 1,
            x: 0,
            y: 0,
            pointers: new Map(),
            startDistance: 0,
            startScale: 1,
            startX: 0,
            startY: 0,
            startMidX: 0,
            startMidY: 0,
            startPointer: null,
            lastTapAt: 0,
            lastTapX: 0,
            lastTapY: 0,
            dragMoved: false
        });
    }
    return viewerStates.get(kind);
}

function applyViewerTransform(kind) {
    const shell = document.querySelector(`[data-zoom-viewer="${kind}"]`);
    const image = shell ? shell.querySelector('.viewer-image') : null;
    const state = getViewerState(kind);
    if (!image) return;
    image.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
}

function resetViewer(kind) {
    const state = getViewerState(kind);
    state.scale = 1;
    state.x = 0;
    state.y = 0;
    state.pointers.clear();
    state.startDistance = 0;
    state.startScale = 1;
    state.startX = 0;
    state.startY = 0;
    state.startMidX = 0;
    state.startMidY = 0;
    state.startPointer = null;
    state.dragMoved = false;
    applyViewerTransform(kind);
}

function clampPan(kind) {
    const shell = document.querySelector(`[data-zoom-viewer="${kind}"]`);
    const state = getViewerState(kind);
    if (!shell) return;

    if (state.scale <= 1) {
        state.x = 0;
        state.y = 0;
        return;
    }

    const bounds = shell.getBoundingClientRect();
    const limitX = Math.max(0, ((bounds.width * state.scale) - bounds.width) / 2);
    const limitY = Math.max(0, ((bounds.height * state.scale) - bounds.height) / 2);
    state.x = Math.min(limitX, Math.max(-limitX, state.x));
    state.y = Math.min(limitY, Math.max(-limitY, state.y));
}

function zoomAt(kind, targetScale, focalX, focalY) {
    const shell = document.querySelector(`[data-zoom-viewer="${kind}"]`);
    const state = getViewerState(kind);
    if (!shell) return;

    const bounds = shell.getBoundingClientRect();
    const pointX = focalX - bounds.left;
    const pointY = focalY - bounds.top;
    const clampedScale = Math.min(4, Math.max(1, targetScale));
    const ratio = clampedScale / Math.max(state.scale, 0.001);

    state.x = pointX - (pointX - state.x) * ratio;
    state.y = pointY - (pointY - state.y) * ratio;
    state.scale = clampedScale;
    clampPan(kind);
    applyViewerTransform(kind);
}

function toggleDoubleTap(kind, event) {
    const state = getViewerState(kind);
    const shell = document.querySelector(`[data-zoom-viewer="${kind}"]`);
    if (!shell) return;

    if (state.scale > 1.05) {
        resetViewer(kind);
        return;
    }

    zoomAt(kind, 2, event.clientX, event.clientY);
}

function initZoomViewer(kind) {
    const shell = document.querySelector(`[data-zoom-viewer="${kind}"]`);
    const image = shell ? shell.querySelector('.viewer-image') : null;
    if (!shell || !image || shell.dataset.zoomInit === '1') return;
    shell.dataset.zoomInit = '1';

    const state = getViewerState(kind);
    const minScale = 1;
    const maxScale = 4;

    const getPoint = (event) => ({ x: event.clientX, y: event.clientY });
    const getDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const getMidpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const updateTransform = () => {
        state.scale = clamp(state.scale, minScale, maxScale);
        clampPan(kind);
        applyViewerTransform(kind);
    };

    shell.addEventListener('pointerdown', (event) => {
        shell.setPointerCapture(event.pointerId);
        const point = getPoint(event);
        state.pointers.set(event.pointerId, point);
        state.dragMoved = false;

        if (state.pointers.size === 1) {
            state.startPointer = { ...point };
            state.startX = state.x;
            state.startY = state.y;
            state.startScale = state.scale;
        }

        if (state.pointers.size === 2) {
            const [p1, p2] = Array.from(state.pointers.values());
            state.startDistance = getDistance(p1, p2);
            state.startScale = state.scale;
            state.startX = state.x;
            state.startY = state.y;
            const mid = getMidpoint(p1, p2);
            state.startMidX = mid.x;
            state.startMidY = mid.y;
        }
    });

    shell.addEventListener('pointermove', (event) => {
        if (!state.pointers.has(event.pointerId)) return;
        state.pointers.set(event.pointerId, getPoint(event));

        if (state.pointers.size === 1) {
            const current = state.pointers.values().next().value;
            if (!state.startPointer) state.startPointer = { ...current };
            const dx = current.x - state.startPointer.x;
            const dy = current.y - state.startPointer.y;
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
                state.dragMoved = true;
            }
            if (state.scale > 1) {
                state.x = state.startX + dx;
                state.y = state.startY + dy;
                updateTransform();
            }
            return;
        }

        if (state.pointers.size === 2) {
            const [p1, p2] = Array.from(state.pointers.values());
            const currentDistance = getDistance(p1, p2);
            const currentMid = getMidpoint(p1, p2);
            const scaleRatio = currentDistance / Math.max(state.startDistance, 1);
            zoomAt(kind, state.startScale * scaleRatio, currentMid.x, currentMid.y);
        }
    });

    const endPointer = (event) => {
        if (state.pointers.has(event.pointerId)) {
            state.pointers.delete(event.pointerId);
        }
        if (state.pointers.size === 0) {
            const now = Date.now();
            const tapX = event.clientX;
            const tapY = event.clientY;
            const isQuickRepeat = !state.dragMoved
                && state.lastTapAt
                && (now - state.lastTapAt) < 300
                && Math.hypot(tapX - state.lastTapX, tapY - state.lastTapY) < 24;
            if (isQuickRepeat) {
                toggleDoubleTap(kind, event);
                state.lastTapAt = 0;
            } else if (!state.dragMoved) {
                state.lastTapAt = now;
                state.lastTapX = tapX;
                state.lastTapY = tapY;
            }
            state.startPointer = null;
            state.dragMoved = false;
            if (state.scale <= 1) {
                resetViewer(kind);
            }
        }
    };

    shell.addEventListener('pointerup', endPointer);
    shell.addEventListener('pointercancel', endPointer);

    shell.addEventListener('wheel', (event) => {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.08 : 0.08;
        zoomAt(kind, state.scale + delta, event.clientX, event.clientY);
    }, { passive: false });

    shell.addEventListener('dblclick', () => {
        resetViewer(kind);
    });

    applyViewerTransform(kind);
}

window.openImageModal = (url) => {
    const modal = document.getElementById('image-modal');
    const img = document.getElementById('fullscreen-image');
    const loader = document.getElementById('viewer-loader');
    if (modal && img) {
        modal.classList.add('active', 'loading');
        resetViewer('image');

        const clearLoading = () => {
            modal.classList.remove('loading');
            if (loader) loader.classList.add('hidden');
            img.removeEventListener('load', clearLoading);
            img.removeEventListener('error', clearLoading);
        };

        img.addEventListener('load', clearLoading);
        img.addEventListener('error', clearLoading);
        if (loader) loader.classList.remove('hidden');
        img.src = '';
        img.src = url;
        if (img.complete) clearLoading();
    }
};

window.closeImageModal = () => {
    const modal = document.getElementById('image-modal');
    const img = document.getElementById('fullscreen-image');
    const loader = document.getElementById('viewer-loader');
    if (modal) modal.classList.remove('active');
    if (img) img.src = '';
    if (modal) modal.classList.remove('loading');
    if (loader) loader.classList.add('hidden');
    resetViewer('image');
    resetBrowserZoom();
};

window.openQrModal = () => {
    const modal = document.getElementById('qr-modal');
    if (modal) {
        modal.classList.add('active');
        resetViewer('qr');
    }
};

window.closeQrModal = () => {
    const modal = document.getElementById('qr-modal');
    if (modal) modal.classList.remove('active');
    resetViewer('qr');
    resetBrowserZoom();
};

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

window.showInstallPrompt = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`PWA install outcome: ${outcome}`);
        deferredPrompt = null;
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('App initializing (modular)...');

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        document.body.classList.add('standalone-app');
    }

    initNavigation();
    initAuth();
    initForm();
    initZoomViewer('image');

    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.onclick = () => {
            const profileScreen = document.getElementById('profile-screen');
            const screens = document.querySelectorAll('.screen');
            const navItems = document.querySelectorAll('.nav-item');

            if (profileScreen) {
                navItems.forEach(nav => nav.classList.remove('active'));
                screens.forEach(s => s.classList.remove('active'));
                profileScreen.classList.add('active');
                fetchUserAds();
            }
        };
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        handleAuthStateChange(session?.user || null);
    });

    detectLocation();
    registerSW();
    initSearch();
});

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.screen');

    navItems.forEach(item => {
        item.onclick = () => {
            const targetScreen = item.getAttribute('data-screen');
            if (!targetScreen) return;
            state.activeConversationAdId = null;
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            screens.forEach(screen => {
                screen.classList.remove('active');
                if (screen.id === targetScreen) {
                    screen.classList.add('active');
                    if (targetScreen === 'messages-screen') fetchMessages();
                    if (targetScreen === 'profile-screen') fetchUserAds();
                }
            });
        };
    });
}

function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
            const checkForUpdate = () => reg.update().catch(() => {});

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });

            checkForUpdate();
            setInterval(checkForUpdate, 5 * 60 * 1000);
        });
    }
}
