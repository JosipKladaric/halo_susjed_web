import { state } from './state.js';
import { supabaseClient } from './config.js';
import { showToast, buildEmail, getPasswordSuffix } from './utils.js';
import { fetchNeeds, fetchUserAds } from './feed.js';
import { initRealtime } from './chat.js';

export function initAuth() {
    const btnPrijava = document.getElementById('btn-prijava');
    const btnRegistracija = document.getElementById('btn-registracija');
    const logoutBtn = document.getElementById('logout-btn');

    if (btnPrijava) {
        btnPrijava.onclick = async () => {
            const ime = document.getElementById('auth-ime').value.trim();
            const prezime = document.getElementById('auth-prezime').value.trim();
            const sifra = document.getElementById('auth-sifra').value;
            if (!ime || !prezime || !sifra) { showToast('Ispunite sva polja.', 'error'); return; }

            btnPrijava.disabled = true; btnPrijava.textContent = 'Prijavljujem...';
            const suffix = await getPasswordSuffix(sifra);
            const userEmailWithHash = buildEmail(ime, prezime, suffix);
            const userEmailOld = buildEmail(ime, prezime);

            let { error } = await supabaseClient.auth.signInWithPassword({ email: userEmailWithHash, password: sifra });
            if (error) {
                const secondAttempt = await supabaseClient.auth.signInWithPassword({ email: userEmailOld, password: sifra });
                error = secondAttempt.error;
            }

            btnPrijava.disabled = false; btnPrijava.textContent = 'Prijava';
            if (error) showToast('Pogrešno ime, prezime ili šifra.', 'error');
            else { const navFeed = document.getElementById('nav-feed'); if (navFeed) navFeed.click(); }
        };
    }

    if (btnRegistracija) {
        btnRegistracija.onclick = async () => {
            const ime = document.getElementById('auth-ime').value.trim();
            const prezime = document.getElementById('auth-prezime').value.trim();
            const sifra = document.getElementById('auth-sifra').value;

            if (!ime || !prezime || !sifra) { showToast('Ispunite sva polja.', 'error'); return; }
            if (sifra.length < 6) { showToast('Šifra mora imati najmanje 6 znakova.', 'error'); return; }

            btnRegistracija.disabled = true; btnRegistracija.textContent = 'Registriram...';

            const suffix = await getPasswordSuffix(sifra);
            const userEmail = buildEmail(ime, prezime, suffix);
            
            // Spremi home_location prilikom registracije (ako je detektirana)
            const metadata = { full_name: `${ime} ${prezime}` };
            if (state.currentUserLocation) {
                metadata.home_location = state.currentUserLocation;
            }

            const { data: signUpData, error } = await supabaseClient.auth.signUp({
                email: userEmail,
                password: sifra,
                options: { data: metadata }
            });

            btnRegistracija.disabled = false; btnRegistracija.textContent = 'Registracija';

            if (error) showToast(error.message, 'error');
            else if (signUpData?.user && !signUpData?.session) showToast('Potrebna potvrda emaila!', 'info');
            else if (signUpData?.session) {
                const navFeed = document.getElementById('nav-feed');
                if (navFeed) navFeed.click();
            }
        };
    }

    if (logoutBtn) {
        logoutBtn.onclick = async () => await supabaseClient.auth.signOut();
    }
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
        if (authView) authView.style.display = 'none';
        if (userView) userView.style.display = 'block';
        if (addNavBtn) addNavBtn.style.display = 'flex';
        
        const fullName = state.currentUser.user_metadata?.full_name || 'Korisnik';
        const nameEl = document.getElementById('user-display-name');
        if (nameEl) nameEl.innerText = fullName;

        if (navAuthBtn) navAuthBtn.setAttribute('data-screen', 'messages-screen');
        if (navAuthLabel) navAuthLabel.innerText = 'Poruke';
        if (iconLogin) iconLogin.style.display = 'none';
        if (iconMsg) iconMsg.style.display = 'block';

        if (isNewUser) initRealtime();
        
        // Ponovno očitaj lokaciju da povučemo home_location ako je potrebno
        if (!state.currentUserLocation && state.currentUser.user_metadata?.home_location) {
            state.currentUserLocation = state.currentUser.user_metadata.home_location;
        }

        fetchUserAds();
    } else {
        if (authView) authView.style.display = 'block';
        if (userView) userView.style.display = 'none';
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
    fetchNeeds();
}
