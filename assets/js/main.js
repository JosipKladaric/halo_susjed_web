import { supabaseClient } from './config.js';
import { state } from './state.js';
import { initAuth, handleAuthStateChange } from './auth.js';
import { initSearch, initForm, deleteAd, fetchUserAds } from './feed.js';
import { handleRespond, fetchMessages, goBackToConversations } from './chat.js';
import { detectLocation } from './location.js';
import { showConfirm } from './utils.js';

// Globalne metode potrebne za inline HTML onclick (npr. u listi oglasa)
window.deleteAd = deleteAd;
window.handleRespond = handleRespond;
window.goBackToConversations = goBackToConversations;
window.openImageModal = (url) => {
    const modal = document.getElementById('image-modal');
    const img = document.getElementById('fullscreen-image');
    if (modal && img) {
        img.src = url;
        modal.classList.add('active');
    }
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
    console.log("App initializing (v7 modular)...");
    
    initNavigation();
    initAuth();
    initForm();

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
        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showConfirm('Nova verzija dostupna! Osvježiti?', () => window.location.reload());
                    }
                });
            });
        });
    }
}
