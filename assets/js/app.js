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
function buildEmail(ime, prezime) {
    return `${ime.trim().toLowerCase()}.${prezime.trim().toLowerCase()}@halosusjed.app`;
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

    const profilePostBtn = document.getElementById('profile-post-btn');
    if (profilePostBtn) {
        profilePostBtn.onclick = () => {
            const navAdd = document.getElementById('nav-add');
            if (navAdd) navAdd.click();
        };
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        handleAuthStateChange(session?.user || null);
    });

    detectLocation();
    registerSW();
});

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
        
        const handleEl = document.getElementById('user-display-handle');
        if (handleEl) handleEl.innerText = currentUser.email?.replace('@halosusjed.app', '').replace('.', ' ') || '';

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
            <div class="card-header">
                <div class="user-meta">
                    <span class="poster-name">👤 ${need.poster_name ? need.poster_name.split(' ')[0] : 'Susjed'}</span>
                    <span class="location-name">📍 ${need.location_name || 'Nepoznato'}</span>
                </div>
                <div class="distance-tag">${distanceStr}</div>
            </div>
            <p class="description-text">${need.description}</p>
            <div class="reward-badge">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M20 12V8H6a2 2 0 0 1-2-2 2 2 0 0 1 2-2h14v4"></path><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"></path><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"></path></svg>
                Zauzvrat: ${need.reward || 'Dogovor'}
            </div>
            <div class="card-footer">
                <div class="time-info">
                    ${new Date(need.created_at).toLocaleDateString('hr-HR')}
                </div>
                ${currentUser ? `<button class="respond-btn" onclick="handleRespond('${need.id}', '${need.user_id}', '${need.description}')">Javi se</button>` : ''}
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
        item.innerHTML = `
            <div class="my-ad-info">
                <span class="my-ad-desc">${ad.description}</span>
                <span class="my-ad-expiry">Zauzvrat: ${ad.reward || 'Dogovor'}</span>
            </div>
            <button class="my-ad-delete-btn" onclick="deleteAd('${ad.id}')">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        `;
        list.appendChild(item);
    });
}

window.deleteAd = async (adId) => {
    if (!confirm('Želite li ugasiti ovaj oglas?')) return;
    const now = new Date().toISOString();
    const { error } = await supabaseClient
        .from('oglasi')
        .update({ expires_at: now })
        .eq('id', adId);

    if (error) alert('Greška pri brisanju.');
    else { fetchUserAds(); fetchNeeds(); }
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
            alert('Prijavite se.');
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
            alert(`Greška: ${err.message}`);
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
                        if (confirm('Nova verzija dostupna! Osvježiti?')) window.location.reload();
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
                content: content
            }]);

        if (error) alert('Greška pri slanju.');
        else {
            alert('Poruka poslana!');
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

        const oglasId = oglas.id;
        if (!conversations[oglasId]) {
            // Find the other person in this conversation
            // If the user is the owner, they talk to the person who responded
            // We need to group by (oglasId + otherUser) if multiple people respond to one ad
            // For simplicity, we group by OglasId for now.
            
            conversations[oglasId] = {
                title: oglas.description,
                adId: oglasId,
                adOwnerId: oglas.user_id,
                messages: [],
                lastMsg: msg.content,
                time: msg.created_at
            };
        }
        conversations[oglasId].messages.push(msg);
    });

    if (activeConversationAdId && conversations[activeConversationAdId]) {
        renderChatThread(conversations[activeConversationAdId]);
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
    Object.keys(conversations).forEach(id => {
        const conv = conversations[id];
        const card = document.createElement('div');
        card.className = 'conversation-card';
        card.innerHTML = `
            <span class="conv-meta">Oglas</span>
            <div class="conv-ad-title">${conv.title}</div>
            <p class="conv-last-msg">${conv.lastMsg}</p>
        `;
        card.onclick = () => {
            activeConversationAdId = id;
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
                    <h3 style="font-size: 0.9rem; font-weight: 600;">${conv.title}</h3>
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
        bubble.innerHTML = `
            ${msg.content}
            <span class="bubble-time">${new Date(msg.created_at).toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })}</span>
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

        // Determine receiver:
        // If I am the owner, receiver is the OTHER person in the last message
        // For simplicity: receiver is the person who sent me the last message, 
        // OR the owner if I am the one who responded first.
        let receiverId = conv.adOwnerId;
        if (currentUser.id === conv.adOwnerId) {
            // If I am the owner, find the first message from someone else
            const otherMsg = conv.messages.find(m => m.sender_id !== currentUser.id);
            if (otherMsg) receiverId = otherMsg.sender_id;
        }

        const { error } = await supabaseClient
            .from('poruke')
            .insert([{
                oglas_id: conv.adId,
                sender_id: currentUser.id,
                receiver_id: receiverId,
                content: content
            }]);

        if (!error) {
            replyInput.value = '';
            fetchMessages(); // Refresh chat
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
