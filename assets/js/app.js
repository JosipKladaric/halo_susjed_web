// Supabase Configuration
const supabaseUrl = 'https://edzldzjwogwzmekqvape.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkemxkemp3b2d3em1la3F2YXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDk5NTUsImV4cCI6MjA5MzgyNTk1NX0.k11qcVKTar0rlYtP15whBwaF2USg6gJ63hRa-2VGs7g';

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true
    }
});

// Global State
let currentUserLocation = null;
let currentUser = null;
let realtimeChannel = null;
let activeConversationAdId = null;

// Helper: constructs a Supabase-compatible email
function transliterate(text) {
    const map = {
        'č': 'c', 'ć': 'c', 'ž': 'z', 'š': 's', 'đ': 'd',
        'Č': 'C', 'Ć': 'C', 'Ž': 'Z', 'Š': 'S', 'Đ': 'D'
    };
    return text.split('').map(char => map[char] || char).join('');
}

function buildEmail(ime, prezime, suffix = "") {
    const cleanIme = transliterate(ime.trim().toLowerCase()).replace(/\s+/g, '');
    const cleanPrezime = transliterate(prezime.trim().toLowerCase()).replace(/\s+/g, '');
    return `${cleanIme}.${cleanPrezime}${suffix ? '.' + suffix : ''}@halosusjed.app`;
}

async function getPasswordSuffix(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 4); // Take first 4 chars for uniqueness
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
    console.log("App initializing (v6)...");
    
    initNavigation();
    initAuth();
    initForm();

    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.onclick = () => {
            // Find the profile screen and activate it
            const profileScreen = document.getElementById('profile-screen');
            const screens = document.querySelectorAll('.screen');
            const navItems = document.querySelectorAll('.nav-item');
            
            if (profileScreen) {
                navItems.forEach(nav => nav.classList.remove('active'));
                screens.forEach(s => s.classList.remove('active'));
                profileScreen.classList.add('active');
                fetchUserAds(); // Refresh ads list
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

// Search Logic
function initSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        filterNeeds(term);
    });
}

let allNeeds = []; // Cache for filtering

function filterNeeds(term) {
    if (!term) {
        renderNeeds(allNeeds);
        return;
    }
    const filtered = allNeeds.filter(need => 
        need.description.toLowerCase().includes(term) || 
        (need.poster_name && need.poster_name.toLowerCase().includes(term)) ||
        (need.location_name && need.location_name.toLowerCase().includes(term))
    );
    renderNeeds(filtered, true); // true means we are filtering
}

// Auth Logic
function handleAuthStateChange(user) {
    const isNewUser = (!currentUser && user) || (currentUser?.id !== user?.id);
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
        


        if (navAuthBtn) navAuthBtn.setAttribute('data-screen', 'messages-screen');
        if (navAuthLabel) navAuthLabel.innerText = 'Poruke';
        if (iconLogin) iconLogin.style.display = 'none';
        if (iconMsg) iconMsg.style.display = 'block';

        if (isNewUser) initRealtime();
        fetchUserAds();
    } else {
        if (authView) authView.style.display = 'block';
        if (userView) userView.style.display = 'none';
        if (addNavBtn) addNavBtn.style.display = 'none';

        if (navAuthBtn) navAuthBtn.setAttribute('data-screen', 'profile-screen');
        if (navAuthLabel) navAuthLabel.innerText = 'Priključi se';
        if (iconLogin) iconLogin.style.display = 'block';
        if (iconMsg) iconMsg.style.display = 'none';
        
        if (realtimeChannel) {
            supabaseClient.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }
    }

    fetchNeeds();
}

function showAuthError(msg) {
    showToast(msg, 'error');
}

// Custom UI Helpers
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    
    if (!modal || !msgEl) return;
    
    msgEl.innerText = message;
    modal.classList.add('active');
    
    const cleanup = () => {
        modal.classList.remove('active');
        okBtn.onclick = null;
        cancelBtn.onclick = null;
    };
    
    okBtn.onclick = () => {
        cleanup();
        if (onConfirm) onConfirm();
    };
    
    cancelBtn.onclick = () => {
        cleanup();
    };
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

            const suffix = await getPasswordSuffix(sifra);
            const userEmailWithHash = buildEmail(ime, prezime, suffix);
            const userEmailOld = buildEmail(ime, prezime);

            // First attempt: try with hashed email (new users)
            let { error } = await supabaseClient.auth.signInWithPassword({
                email: userEmailWithHash,
                password: sifra
            });

            // Second attempt: fallback to old email (old users)
            if (error) {
                const secondAttempt = await supabaseClient.auth.signInWithPassword({
                    email: userEmailOld,
                    password: sifra
                });
                error = secondAttempt.error;
            }

            btnPrijava.disabled = false;
            btnPrijava.textContent = 'Prijava';

            if (error) {
                showToast('Pogrešno ime, prezime ili šifra.', 'error');
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

            // For registration, we add a hash suffix of the password to handle same-named users deterministically
            const suffix = await getPasswordSuffix(sifra);
            const userEmail = buildEmail(ime, prezime, suffix);
            
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
                showToast(error.message, 'error');
            } else if (signUpData?.user && !signUpData?.session) {
                showToast('Potrebna potvrda emaila!', 'info');
            } else if (signUpData?.session) {
                const navFeed = document.getElementById('nav-feed');
                if (navFeed) navFeed.click();
            }
        };
    }

    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await supabaseClient.auth.signOut();
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
                
                fetchNeeds();
            } catch (error) {
                console.error("Location error:", error);
            }
        });
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
    if (!currentUserLocation) return;

    const needsList = document.getElementById('needs-list');
    if (!needsList) return;
    
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('oglasi')
        .select('*')
        .gt('expires_at', now)
        .order('created_at', { ascending: false });

    if (error) return;
    allNeeds = data; // Cache for search
    renderNeeds(data);
}

// Rendering Logic
function renderNeeds(needs, isFiltering = false) {
    const needsList = document.getElementById('needs-list');
    if (!needsList) return;
    needsList.innerHTML = '';
    
    if (needs.length === 0) {
        needsList.innerHTML = '<div class="empty-state"><p>Još nema aktivnih oglasa u tvom susjedstvu.</p></div>';
        return;
    }

    let displayNeeds = [...needs];
    if (currentUserLocation) {
        displayNeeds = displayNeeds.filter(need => {
            if (!need.lat || !need.lon) return true;
            const dist = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, need.lat, need.lon);
            return dist <= 50;
        });
        displayNeeds.sort((a, b) => {
            const distA = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, a.lat, a.lon) || 9999;
            const distB = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, b.lat, b.lon) || 9999;
            return distA - distB;
        });
    }
    
    if (displayNeeds.length === 0) {
        needsList.innerHTML = '<div class="empty-state"><p>Nema aktivnih oglasa u krugu od 50km.</p></div>';
        return;
    }
    
    displayNeeds.forEach(need => {
        let distanceStr = "";
        if (currentUserLocation && need.lat && need.lon) {
            const dist = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, need.lat, need.lon);
            distanceStr = dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km`;
        }

        const card = document.createElement('div');
        card.className = 'need-card';
        card.innerHTML = `
            <div class="need-compact-row">
                <div class="need-details">
                    <div class="user-meta">
                        <span class="poster-name">${need.poster_name ? need.poster_name.split(' ')[0] : 'Susjed'}</span>
                        <span class="meta-separator">-</span>
                        <span class="location-name">${need.location_name || 'Nepoznato'}</span>
                        ${distanceStr ? `<span class="meta-separator">-</span> <span class="distance-tag">${distanceStr}</span>` : ''}
                    </div>
                    <p class="description-text">${need.description}</p>
                    <div class="reward-line">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M20 12V8H6a2 2 0 0 1-2-2 2 2 0 0 1 2-2h14v4"></path><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"></path><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"></path></svg>
                        <span>Zauzvrat: ${need.reward || 'Dogovor'}</span>
                    </div>
                </div>
                <div class="need-action-area">
                    ${currentUser ? 
                        (need.user_id === currentUser.id ? 
                            `<span class="my-post-badge-mini">Moja</span>` : 
                            `<button class="respond-btn-compact" onclick="handleRespond('${need.id}', '${need.user_id}', '${need.description.replace(/'/g, "\\'")}')">Javi se</button>`
                        ) : ''}
                </div>
            </div>
        `;
        needsList.appendChild(card);
    });
}

// User Profile Ads Logic
async function fetchUserAds() {
    const list = document.getElementById('my-ads-list');
    if (!list || !currentUser) return;

    const now = new Date().toISOString();
    const { data, error } = await supabaseClient
        .from('oglasi')
        .select('*')
        .eq('user_id', currentUser.id)
        .gt('expires_at', now)
        .order('created_at', { ascending: false });

    if (error) return;

    if (data.length === 0) {
        list.innerHTML = '<p class="empty-state" style="font-size: 0.85rem;">Trenutno nemate aktivnih oglasa.</p>';
        return;
    }

    list.innerHTML = '';
    data.forEach(ad => {
        const item = document.createElement('div');
        item.className = 'my-ad-item';
        const expiryDate = new Date(ad.expires_at);
        const expiryStr = expiryDate.toLocaleDateString('hr-HR', { day: 'numeric', month: 'long' });
        const expiryTime = expiryDate.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });

        item.innerHTML = `
            <div class="my-ad-info">
                <span class="my-ad-desc">${ad.description}</span>
                <span class="my-ad-reward">Zauzvrat: ${ad.reward || 'Dogovor'}</span>
                <span class="my-ad-expiry">Istječe: ${expiryStr} u ${expiryTime}</span>
            </div>
            <button class="my-ad-delete-btn" onclick="deleteAd('${ad.id}')">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        `;
        list.appendChild(item);
    });
}

window.deleteAd = async (adId) => {
    showConfirm('Želite li ugasiti ovaj oglas?', async () => {
        // Use a date far in the past to be absolutely sure it's expired
        const expiredDate = '1970-01-01T00:00:00Z';
        
        // Try both string and numeric ID just in case
        const idToUse = isNaN(adId) ? adId : parseInt(adId);
        
        const { data, error } = await supabaseClient
            .from('oglasi')
            .update({ expires_at: expiredDate })
            .eq('id', idToUse)
            .eq('user_id', currentUser.id)
            .select();

        if (error) {
            showToast('Greška pri gašenju oglasa.', 'error');
        } else if (!data || data.length === 0) {
            showToast('Oglas nije pronađen ili niste vlasnik.', 'error');
        } else { 
            await fetchUserAds(); 
            await fetchNeeds(); 
            showToast('Oglas je uspješno ugašen.');
        }
    });
};

// Navigation
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.screen');
    
    navItems.forEach(item => {
        item.onclick = () => {
            const targetScreen = item.getAttribute('data-screen');
            if (!targetScreen) return;
            activeConversationAdId = null;
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

// Form Logic
function initForm() {
    const postForm = document.getElementById('post-form');
    if (!postForm) return;
    postForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            showToast('Prijavite se.', 'info');
            const navAuth = document.getElementById('nav-auth');
            if (navAuth) navAuth.click();
            return;
        }
        if (!currentUserLocation) { alert('Lokacija nije spremna.'); return; }
        
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
                    reward: document.getElementById('reward').value,
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
            setTimeout(() => {
                btn.innerText = originalText;
                btn.disabled = false;
                postForm.reset();
                const navFeed = document.getElementById('nav-feed');
                if (navFeed) navFeed.click();
                fetchNeeds();
            }, 1500);

        } catch (err) {
            btn.innerText = "Greška!";
            btn.disabled = false;
            showToast(`Greška: ${err.message}`, 'error');
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
                        showConfirm('Nova verzija dostupna! Osvježiti?', () => window.location.reload());
                    }
                });
            });
        });
    }
}

// Global Handlers
window.handleRespond = (adId, receiverId, adDescription) => {
    if (!currentUser) return;
    const modal = document.getElementById('message-modal');
    const adInfo = document.getElementById('modal-ad-info');
    const sendBtn = document.getElementById('send-msg-btn');
    const closeBtn = document.getElementById('close-modal');
    
    if (adInfo) adInfo.innerText = `Oglas: "${adDescription}"`;
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
                content: content,
                sender_name: currentUser.user_metadata?.full_name || 'Susjed'
            }]);

        if (error) showToast('Greška pri slanju.', 'error');
        else {
            showToast('Poruka poslana!');
            modal.classList.remove('active');
            document.getElementById('message-text').value = '';
        }
        sendBtn.innerText = "Pošalji";
        sendBtn.disabled = false;
    };
};

// Fetch Conversations & Messages
async function fetchMessages() {
    const messagesList = document.getElementById('messages-list');
    if (!messagesList || !currentUser) return;

    const { data, error } = await supabaseClient
        .from('poruke')
        .select(`*, oglas_id (id, description, expires_at, user_id)`)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

    if (error) return;

    const now = new Date();
    const conversations = {};
    
    data.forEach(msg => {
        const oglas = msg.oglas_id;
        if (!oglas) return;

        const expiryDate = new Date(oglas.expires_at);
        const cutoffDate = new Date(expiryDate.getTime() + (24 * 60 * 60 * 1000));
        if (now > cutoffDate) return;

        const otherUserId = (msg.sender_id === currentUser.id) ? msg.receiver_id : msg.sender_id;
        const otherUserName = (msg.sender_id !== currentUser.id) ? msg.sender_name : null;
        
        const convKey = `${oglas.id}_${otherUserId}`;

        if (!conversations[convKey]) {
            conversations[convKey] = {
                title: oglas.description,
                adId: oglas.id,
                adOwnerId: oglas.user_id,
                otherUserId: otherUserId,
                otherUserName: otherUserName || 'Susjed',
                messages: [],
                lastMsg: msg.content,
                time: msg.created_at
            };
        } else {
            // If we find the other person's name in any message, update it
            if (otherUserName && conversations[convKey].otherUserName === 'Susjed') {
                conversations[convKey].otherUserName = otherUserName;
            }
        }
        conversations[convKey].messages.push(msg);
    });

    // If we are already in a thread, find it in the new grouping
    if (activeConversationAdId) {
        // activeConversationAdId was previously just the oglasId. 
        // Now it needs to be the convKey.
        // Let's check if activeConversationAdId matches any convKey
        const currentConv = conversations[activeConversationAdId];
        if (currentConv) {
            renderChatThread(currentConv);
        } else {
            // If not found (maybe first load or back button), show list
            renderConversations(conversations);
        }
    } else {
        renderConversations(conversations);
    }
}

function renderConversations(conversations) {
    const messagesList = document.getElementById('messages-list');
    if (Object.keys(conversations).length === 0) {
        messagesList.innerHTML = '<p class="empty-state">Još nemaš aktivnih razgovora.</p>';
        return;
    }

    messagesList.innerHTML = '';
    // Sort conversations by most recent message
    const sortedConvs = Object.values(conversations).sort((a, b) => new Date(b.time) - new Date(a.time));

    sortedConvs.forEach(conv => {
        const convKey = `${conv.adId}_${conv.otherUserId}`;
        const card = document.createElement('div');
        card.className = 'conversation-card';
        card.innerHTML = `
            <div class="conv-header">
                <span class="conv-meta">Oglas: ${conv.title}</span>
            </div>
            <div class="conv-user-name">${conv.otherUserName}</div>
            <p class="conv-last-msg">${conv.lastMsg}</p>
        `;
        card.onclick = () => {
            activeConversationAdId = convKey;
            renderChatThread(conv);
        };
        messagesList.appendChild(card);
    });
}

function renderChatThread(conv) {
    const messagesList = document.getElementById('messages-list');
    messagesList.innerHTML = `
        <div class="chat-thread-container">
            <div class="thread-header">
                <button class="back-btn" onclick="goBackToConversations()">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <div class="thread-info">
                    <div class="thread-user-name">${conv.otherUserName}</div>
                    <div class="thread-ad-title">Oglas: ${conv.title}</div>
                </div>
            </div>
            <div class="messages-scroller" id="thread-scroller" style="padding-bottom: 80px;"></div>
            
            <div class="chat-input-bar">
                <input type="text" id="chat-reply-input" placeholder="Napiši poruku...">
                <button class="chat-send-btn" id="chat-reply-btn">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>
    `;

    const scroller = document.getElementById('thread-scroller');
    const threadMsgs = [...conv.messages].reverse();
    
    threadMsgs.forEach(msg => {
        const isSender = msg.sender_id === currentUser.id;
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${isSender ? 'sent' : 'received'}`;
        
        const timeStr = new Date(msg.created_at).toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date(msg.created_at).toLocaleDateString('hr-HR', { day: 'numeric', month: 'short' });
        
        // Show date only if it's not today (simplified check)
        const isToday = new Date(msg.created_at).toDateString() === new Date().toDateString();
        const displayTime = isToday ? timeStr : `${dateStr}, ${timeStr}`;

        bubble.innerHTML = `
            <div class="bubble-name">${isSender ? 'Ja' : (msg.sender_name || 'Susjed')}</div>
            <div class="bubble-text">${msg.content}</div>
            <span class="bubble-time">${displayTime}</span>
        `;
        scroller.appendChild(bubble);
    });

    scroller.scrollTop = scroller.scrollHeight;

    // Handle Reply
    const replyBtn = document.getElementById('chat-reply-btn');
    const replyInput = document.getElementById('chat-reply-input');

    replyBtn.onclick = async () => {
        const content = replyInput.value.trim();
        if (!content) return;

        // Receiver is always the "other" person in this conversation
        const receiverId = conv.otherUserId;

        const { error } = await supabaseClient
            .from('poruke')
            .insert([{
                oglas_id: conv.adId,
                sender_id: currentUser.id,
                receiver_id: receiverId,
                content: content,
                sender_name: currentUser.user_metadata?.full_name || 'Susjed'
            }]);

        if (!error) {
            replyInput.value = '';
            // Optimization: instead of fetching everything, we could just wait for realtime
            // but fetchMessages is safer for now.
            fetchMessages(); 
        }
    };
}

window.goBackToConversations = () => {
    activeConversationAdId = null;
    fetchMessages();
};

// Realtime Subscription
function initRealtime() {
    if (!currentUser) return;
    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = supabaseClient
        .channel('realtime-messages')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'poruke',
            filter: `receiver_id=eq.${currentUser.id}` 
        }, () => fetchMessages())
        .subscribe();
}
