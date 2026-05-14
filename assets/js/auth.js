import { state } from './state.js';
import { supabaseClient } from './config.js';
import { showToast, buildEmail, getPasswordSuffix } from './utils.js';
import { fetchNeeds, fetchUserAds } from './feed.js';
import { initRealtime } from './chat.js';
import { compressImage } from './imageUtils.js';

function maybeShowInstallPrompt() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;
    if (sessionStorage.getItem('hs_install_prompt_shown') === '1') return;
    if (typeof window.showInstallPrompt !== 'function') return;
    sessionStorage.setItem('hs_install_prompt_shown', '1');
    setTimeout(() => {
        window.showInstallPrompt();
    }, 1500);
}

function syncInstallCard() {
    const installCard = document.getElementById('install-card');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!installCard) return;
    installCard.classList.toggle('hidden', isStandalone);
}

function wireInstallButton() {
    const installBtn = document.getElementById('install-btn');
    if (!installBtn) return;
    installBtn.onclick = () => {
        if (typeof window.showInstallPrompt === 'function') {
            window.showInstallPrompt();
        }
    };
}

export function initAuth() {
    const btnPrijava = document.getElementById('btn-prijava');
    const btnRegistracija = document.getElementById('btn-registracija');
    const logoutBtn = document.getElementById('logout-btn');
    const avatarUpload = document.getElementById('avatar-upload');

    if (avatarUpload) {
        avatarUpload.addEventListener('change', async (e) => {
            if (e.target.files && e.target.files[0] && state.currentUser) {
                try {
                    const file = e.target.files[0];
                    showToast('Spremam profilnu sliku...', 'info');
                    const compressedFile = await compressImage(file, 100);

                    const fileName = `avatar_${state.currentUser.id}_${Date.now()}.webp`;
                    const { error: uploadError } = await supabaseClient.storage.from('avatari').upload(fileName, compressedFile, { contentType: 'image/webp' });
                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabaseClient.storage.from('avatari').getPublicUrl(fileName);
                    const { error: updateError } = await supabaseClient.auth.updateUser({
                        data: { avatar_url: publicUrl }
                    });
                    if (updateError) throw updateError;

                    showToast('Profilna slika ažurirana!');
                    const avatarEl = document.getElementById('profile-avatar');
                    if (avatarEl) {
                        avatarEl.src = publicUrl;
                        avatarEl.style.display = 'block';
                    }
                } catch (err) {
                    showToast('Greška pri učitavanju profilne slike.', 'error');
                }
            }
        });
    }

    if (btnPrijava) {
        btnPrijava.onclick = async () => {
            const ime = document.getElementById('auth-ime').value.trim();
            const prezime = document.getElementById('auth-prezime').value.trim();
            const sifra = document.getElementById('auth-sifra').value;
            if (!ime || !prezime || !sifra) {
                showToast('Ispunite sva polja.', 'error');
                return;
            }

            btnPrijava.disabled = true;
            btnPrijava.textContent = 'Prijavljujem...';
            const suffix = await getPasswordSuffix(sifra);
            const userEmailWithHash = buildEmail(ime, prezime, suffix);
            const userEmailOld = buildEmail(ime, prezime);

            let { error } = await supabaseClient.auth.signInWithPassword({ email: userEmailWithHash, password: sifra });
            if (error) {
                const secondAttempt = await supabaseClient.auth.signInWithPassword({ email: userEmailOld, password: sifra });
                error = secondAttempt.error;
            }

            btnPrijava.disabled = false;
            btnPrijava.textContent = 'Prijava';
            if (error) {
                showToast('Pogrešno ime, prezime ili šifra.', 'error');
            } else {
                const navFeed = document.getElementById('nav-feed');
                if (navFeed) navFeed.click();
                maybeShowInstallPrompt();
            }
        };
    }

    if (btnRegistracija) {
        btnRegistracija.onclick = async () => {
            const ime = document.getElementById('auth-ime').value.trim();
            const prezime = document.getElementById('auth-prezime').value.trim();
            const sifra = document.getElementById('auth-sifra').value;

            if (!ime || !prezime || !sifra) {
                showToast('Ispunite sva polja.', 'error');
                return;
            }
            if (sifra.length < 6) {
                showToast('Šifra mora imati najmanje 6 znakova.', 'error');
                return;
            }

            btnRegistracija.disabled = true;
            btnRegistracija.textContent = 'Registriram...';

            const suffix = await getPasswordSuffix(sifra);
            const userEmail = buildEmail(ime, prezime, suffix);

            const metadata = { full_name: `${ime} ${prezime}` };
            if (state.currentUserLocation) {
                metadata.home_location = state.currentUserLocation;
            }

            const { data: signUpData, error } = await supabaseClient.auth.signUp({
                email: userEmail,
                password: sifra,
                options: { data: metadata }
            });

            btnRegistracija.disabled = false;
            btnRegistracija.textContent = 'Registracija';

            if (error) {
                showToast(error.message, 'error');
            } else if (signUpData?.user && !signUpData?.session) {
                showToast('Potrebna potvrda e-maila!', 'info');
            } else if (signUpData?.session) {
                const navFeed = document.getElementById('nav-feed');
                if (navFeed) navFeed.click();
                maybeShowInstallPrompt();
            }
        };
    }

    if (logoutBtn) {
        logoutBtn.onclick = async () => await supabaseClient.auth.signOut();
    }

    syncInstallCard();
    wireInstallButton();
}

export function handleAuthStateChange(user) {
    const isNewUser = (!state.currentUser && user) || (state.currentUser?.id !== user?.id);
    state.currentUser = user;

    const authView = document.getElementById('auth-view');
    const userView = document.getElementById('user-view');
    const addNavBtn = document.getElementById('nav-add');
    const navAuthBtn = document.getElementById('nav-auth');
    const navAuthLabel = document.getElementById('nav-auth-label');
    const iconLogin = document.getElementById('nav-auth-icon-login');
    const iconMsg = document.getElementById('nav-auth-icon-msg');

    if (state.currentUser) {
        if (authView) authView.classList.add('hidden');
        if (userView) userView.classList.remove('hidden');
        if (addNavBtn) addNavBtn.style.display = 'flex';

        const fullName = state.currentUser.user_metadata?.full_name || 'Korisnik';
        const avatarUrl = state.currentUser.user_metadata?.avatar_url;
        const nameEl = document.getElementById('user-display-name');
        const avatarEl = document.getElementById('profile-avatar');

        if (nameEl) nameEl.innerText = fullName;
        if (avatarEl) {
            if (avatarUrl) {
                avatarEl.src = avatarUrl;
                avatarEl.style.display = 'block';
            } else {
                avatarEl.style.display = 'none';
            }
        }

        if (navAuthBtn) navAuthBtn.setAttribute('data-screen', 'messages-screen');
        if (navAuthLabel) navAuthLabel.innerText = 'Poruke';
        if (iconLogin) iconLogin.style.display = 'none';
        if (iconMsg) iconMsg.style.display = 'block';

        if (isNewUser) initRealtime();

        if (!state.currentUserLocation && state.currentUser.user_metadata?.home_location) {
            state.currentUserLocation = state.currentUser.user_metadata.home_location;
        }

        fetchUserAds();
        maybeShowInstallPrompt();
    } else {
        if (authView) authView.classList.remove('hidden');
        if (userView) userView.classList.add('hidden');
        if (addNavBtn) addNavBtn.style.display = 'none';

        if (navAuthBtn) navAuthBtn.setAttribute('data-screen', 'profile-screen');
        if (navAuthLabel) navAuthLabel.innerText = 'Priključi se';
        if (iconLogin) iconLogin.style.display = 'block';
        if (iconMsg) iconMsg.style.display = 'none';

        if (state.realtimeChannel) {
            supabaseClient.removeChannel(state.realtimeChannel);
            state.realtimeChannel = null;
        }
    }
    syncInstallCard();
    fetchNeeds();
}
