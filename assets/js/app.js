// Supabase Configuration
const supabaseUrl = 'https://edzldzjwogwzmekqvape.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkemxkemp3b2d3em1la3F2YXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDk5NTUsImV4cCI6MjA5MzgyNTk1NX0.k11qcVKTar0rlYtP15whBwaF2USg6gJ63hRa-2VGs7g';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

// Helper: constructs a Supabase-compatible email from Ime + Prezime
function buildEmail(ime, prezime) {
    return `${ime.trim().toLowerCase()}.${prezime.trim().toLowerCase()}@halosusjed.app`;
}

// Global State
let currentUserLocation = null;
let currentUser = null;

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
    console.log("App initializing (v4)...");
    
    initNavigation();
    initAuth();
    initForm();

    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.onclick = () => {
            const navAuth = document.getElementById('nav-auth');
            if (navAuth) navAuth.click();
        };
    }

    // Restore existing Supabase session
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        handleAuthStateChange(session?.user || null);
    } catch (e) {
        console.error("Session restore error:", e);
        handleAuthStateChange(null);
    }

    // Keep UI in sync with auth changes
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleAuthStateChange(session?.user || null);
    });

    // Start location detection immediately
    detectLocation();
    
    // fetchNeeds will be called by detectLocation once location is ready
    registerSW();
});

// Auth Logic
function handleAuthStateChange(user) {
    currentUser = user;
    const authView = document.getElementById('auth-view');
    const userView = document.getElementById('user-view');
    const addNavBtn = document.getElementById('nav-add');
    const navAuthBtn = document.getElementById('nav-auth');
    const navAuthLabel = document.getElementById('nav-auth-label');
    const iconLogin = document.getElementById('nav-auth-icon-login');
    const iconMsg = document.getElementById('nav-auth-icon-msg');

    if (currentUser) {
        if (authView) authView.style.display = 'none';
        if (userView) userView.style.display = 'block';
        if (addNavBtn) addNavBtn.style.display = 'flex';

        const fullName = currentUser.user_metadata?.full_name || 'Korisnik';
        const nameEl = document.getElementById('user-display-name');
        if (nameEl) nameEl.innerText = fullName;
        
        const handleEl = document.getElementById('user-display-handle');
        if (handleEl) handleEl.innerText = currentUser.email?.replace('@halosusjed.app', '').replace('.', ' ') || '';

        if (navAuthBtn) navAuthBtn.setAttribute('data-screen', 'messages-screen');
        if (navAuthLabel) navAuthLabel.innerText = 'Poruke';
        if (iconLogin) iconLogin.style.display = 'none';
        if (iconMsg) iconMsg.style.display = 'block';

        initRealtime();
    } else {
        if (authView) authView.style.display = 'block';
        if (userView) userView.style.display = 'none';
        if (addNavBtn) addNavBtn.style.display = 'none';

        if (navAuthBtn) navAuthBtn.setAttribute('data-screen', 'profile-screen');
        if (navAuthLabel) navAuthLabel.innerText = 'Priključi se';
        if (iconLogin) iconLogin.style.display = 'block';
        if (iconMsg) iconMsg.style.display = 'none';
    }

    fetchNeeds();
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3500);
}

function initAuth() {
    const btnPrijava = document.getElementById('btn-prijava');
    const btnRegistracija = document.getElementById('btn-registracija');
    const logoutBtn = document.getElementById('logout-btn');

    if (btnPrijava) {
        btnPrijava.onclick = async () => {
            const ime = document.getElementById('auth-ime').value.trim();
            const prezime = document.getElementById('auth-prezime').value.trim();
            const sifra = document.getElementById('auth-sifra').value;

            if (!ime || !prezime || !sifra) {
                showAuthError('Ispunite sva polja.');
                return;
            }

            btnPrijava.disabled = true;
            btnPrijava.textContent = 'Prijavljujem...';

            const { error } = await supabaseClient.auth.signInWithPassword({
                email: buildEmail(ime, prezime),
                password: sifra
            });

            btnPrijava.disabled = false;
            btnPrijava.textContent = 'Prijava';

            if (error) {
                showAuthError('Pogrešno ime, prezime ili šifra.');
            } else {
                const navFeed = document.getElementById('nav-feed');
                if (navFeed) navFeed.click();
            }
        };
    }

    if (btnRegistracija) {
        btnRegistracija.onclick = async () => {
            const ime = document.getElementById('auth-ime').value.trim();
            const prezime = document.getElementById('auth-prezime').value.trim();
            const sifra = document.getElementById('auth-sifra').value;

            if (!ime || !prezime || !sifra) {
                showAuthError('Ispunite sva polja.');
                return;
            }
            if (sifra.length < 6) {
                showAuthError('Šifra mora imati najmanje 6 znakova.');
                return;
            }

            btnRegistracija.disabled = true;
            btnRegistracija.textContent = 'Registriram...';

            const userEmail = buildEmail(ime, prezime);
            const { data: signUpData, error } = await supabaseClient.auth.signUp({
                email: userEmail,
                password: sifra,
                options: {
                    data: { full_name: `${ime} ${prezime}` }
                }
            });

            btnRegistracija.disabled = false;
            btnRegistracija.textContent = 'Registracija';

            if (error) {
                showAuthError(error.message);
            } else if (signUpData?.user && !signUpData?.session) {
                showAuthError('Potrebna potvrda emaila!');
                alert('VAŽNO: Isključite "Confirm email" u Supabase Auth postavkama.');
            } else if (signUpData?.session) {
                const navFeed = document.getElementById('nav-feed');
                if (navFeed) navFeed.click();
            }
        };
    }

    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await supabaseClient.auth.signOut();
            window.location.reload();
        };
    }
}

// Geolocation Logic
async function detectLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                const data = await response.json();
                
                const address = data.address || {};
                const city = address.city || address.town || address.village || address.suburb || "Nepoznato mjesto";
                
                currentUserLocation = {
                    lat: latitude,
                    lon: longitude,
                    country: address.country_code || 'hr',
                    name: city
                };
                
                console.log("Lokacija očitana:", city);
                fetchNeeds(); // Now we can fetch needs
            } catch (error) {
                console.error("Location error:", error);
            }
        }, (err) => {
            console.error("Geolocation error:", err);
            alert("Za korištenje aplikacije morate omogućiti pristup lokaciji.");
        });
    } else {
        alert("Vaš preglednik ne podržava geolokaciju.");
    }
}

// Distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Fetch from Supabase
async function fetchNeeds() {
    if (!currentUserLocation) {
        console.log("Čekam lokaciju za dohvat oglasa...");
        return;
    }

    const needsList = document.getElementById('needs-list');
    if (!needsList) return;
    
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('oglasi')
        .select('*')
        .gt('expires_at', now)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching needs:', error);
        return;
    }

    renderNeeds(data);
}

// Rendering Logic
function renderNeeds(needs) {
    const needsList = document.getElementById('needs-list');
    if (!needsList) return;
    needsList.innerHTML = '';
    
    if (needs.length === 0) {
        needsList.innerHTML = '<div class="empty-state"><p>Još nema aktivnih oglasa u tvom susjedstvu.</p></div>';
        return;
    }

    let sortedNeeds = [...needs];
    if (currentUserLocation) {
        sortedNeeds.sort((a, b) => {
            const distA = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, a.lat, a.lon) || 9999;
            const distB = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, b.lat, b.lon) || 9999;
            return distA - distB;
        });
    }
    
    sortedNeeds.forEach(need => {
        let distanceStr = "";
        if (currentUserLocation && need.lat && need.lon) {
            const dist = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, need.lat, need.lon);
            distanceStr = dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km`;
        }

        const card = document.createElement('div');
        card.className = 'need-card';
        card.innerHTML = `
            <div class="card-header">
                <div class="user-meta">
                    <span class="poster-name">👤 ${need.poster_name || 'Susjed'}</span>
                    <span class="location-name">📍 ${need.location_name || 'Nepoznato'}</span>
                </div>
                <div class="distance-tag">${distanceStr}</div>
            </div>
            <p class="description-text">${need.description}</p>
            <div class="card-footer">
                <div class="time-info">
                    ${new Date(need.created_at).toLocaleDateString('hr-HR')}
                </div>
                ${currentUser ? `<button class="respond-btn" onclick="handleRespond('${need.id}', '${need.user_id}')">Javi se</button>` : ''}
            </div>
        `;
        needsList.appendChild(card);
    });
}

// Navigation
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.screen');
    
    navItems.forEach(item => {
        item.onclick = () => {
            const targetScreen = item.getAttribute('data-screen');
            if (!targetScreen) return;
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            screens.forEach(screen => {
                screen.classList.remove('active');
                if (screen.id === targetScreen) {
                    screen.classList.add('active');
                    if (targetScreen === 'messages-screen') fetchMessages();
                }
            });
        };
    });
}

// Form Logic
function initForm() {
    const postForm = document.getElementById('post-form');
    if (!postForm) return;
    postForm.onsubmit = async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert('Morate biti prijavljeni.');
            const navAuth = document.getElementById('nav-auth');
            if (navAuth) navAuth.click();
            return;
        }

        if (!currentUserLocation) {
            alert('Lokacija nije očitana. Molimo pričekajte trenutak ili osvježite stranicu.');
            detectLocation();
            return;
        }
        
        const btn = postForm.querySelector('.submit-btn');
        const originalText = btn.innerText;
        btn.innerText = "Objavljujem...";
        btn.disabled = true;

        const days = parseInt(document.getElementById('expiry').value);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);

        try {
            const { error } = await supabaseClient
                .from('oglasi')
                .insert([{
                    description: document.getElementById('description').value,
                    lat: currentUserLocation.lat,
                    lon: currentUserLocation.lon,
                    country_code: currentUserLocation.country,
                    location_name: currentUserLocation.name,
                    expires_at: expiresAt.toISOString(),
                    user_id: currentUser.id,
                    poster_name: currentUser.user_metadata?.full_name || 'Susjed'
                }]);

            if (error) throw error;

            btn.innerText = "Objavljeno! 🎉";
            btn.style.background = "#22c55e";
            
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.background = "var(--primary)";
                btn.disabled = false;
                postForm.reset();
                const navFeed = document.getElementById('nav-feed');
                if (navFeed) navFeed.click();
                fetchNeeds();
            }, 1500);

        } catch (err) {
            console.error('Error:', err);
            btn.innerText = "Greška!";
            btn.disabled = false;
            alert(`Greška: ${err.message}. Provjerite imate li stupac 'location_name' u tablici 'oglasi'.`);
        }
    };
}

// SW Registration
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        if (confirm('Nova verzija aplikacije je dostupna! Želite li osvježiti?')) {
                            window.location.reload();
                        }
                    }
                });
            });
        }).catch(console.error);
    }
}

// Global Handlers
window.handleRespond = (adId, receiverId) => {
    if (!currentUser) return;
    const modal = document.getElementById('message-modal');
    const sendBtn = document.getElementById('send-msg-btn');
    const closeBtn = document.getElementById('close-modal');
    
    modal.classList.add('active');
    closeBtn.onclick = () => modal.classList.remove('active');
    
    sendBtn.onclick = async () => {
        const content = document.getElementById('message-text').value;
        if (!content) return;
        
        sendBtn.innerText = "Slanje...";
        sendBtn.disabled = true;

        const { error } = await supabaseClient
            .from('poruke')
            .insert([{
                oglas_id: adId,
                sender_id: currentUser.id,
                receiver_id: receiverId,
                content: content
            }]);

        if (error) {
            alert('Greška pri slanju poruke.');
        } else {
            alert('Poruka poslana!');
            modal.classList.remove('active');
            document.getElementById('message-text').value = '';
        }
        sendBtn.innerText = "Pošalji";
        sendBtn.disabled = false;
    };
};

// Fetch Conversations
async function fetchMessages() {
    const messagesList = document.getElementById('messages-list');
    if (!messagesList || !currentUser) return;

    const { data, error } = await supabaseClient
        .from('poruke')
        .select(`*, oglas_id (description)`)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

    if (error) return;

    messagesList.innerHTML = '';
    if (data.length === 0) {
        messagesList.innerHTML = '<p class="empty-state">Još nemaš poruka.</p>';
        return;
    }

    data.forEach(msg => {
        const isSender = msg.sender_id === currentUser.id;
        const card = document.createElement('div');
        card.className = 'message-preview-card';
        card.innerHTML = `
            <div class="msg-header">
                <strong>${isSender ? 'Ti' : 'Susjed'}</strong>
                <span class="time-stamp">${new Date(msg.created_at).toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <p class="msg-preview">${msg.content}</p>
        `;
        messagesList.appendChild(card);
    });
}

// Realtime Subscription
function initRealtime() {
    if (!currentUser) return;
    supabaseClient
        .channel('realtime-messages')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'poruke',
            filter: `receiver_id=eq.${currentUser.id}` 
        }, payload => {
            if (document.getElementById('messages-screen').classList.contains('active')) {
                fetchMessages();
            } else {
                alert('Nova poruka! 💬');
            }
        })
        .subscribe();
}
