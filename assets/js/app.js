// Supabase Configuration
const supabaseUrl = 'https://edzldzjwogwzmekqvape.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkemxkemp3b2d3em1la3F2YXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDk5NTUsImV4cCI6MjA5MzgyNTk1NX0.k11qcVKTar0rlYtP15whBwaF2USg6gJ63hRa-2VGs7g';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Global State
let currentUserLocation = null;
let currentUser = null;

// UI Elements
const navItems = document.querySelectorAll('.nav-item');
const screens = document.querySelectorAll('.screen');
const needsList = document.getElementById('needs-list');
const postForm = document.getElementById('post-form');

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initAuthTabs();
    initAuthForms();
    
    // Check current auth session
    const { data: { session } } = await supabaseClient.auth.getSession();
    handleAuthStateChange(session);

    // Listen for auth changes
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleAuthStateChange(session);
    });

    fetchNeeds();
    registerSW();
    detectLocation();
});

// Auth Logic
function handleAuthStateChange(session) {
    currentUser = session?.user || null;
    const authView = document.getElementById('auth-view');
    const userView = document.getElementById('user-view');
    const addNavBtn = document.querySelector('[data-screen="add-screen"]');

    if (currentUser) {
        if (authView) authView.style.display = 'none';
        if (userView) userView.style.display = 'block';
        if (addNavBtn) addNavBtn.style.display = 'flex';
        
        document.getElementById('user-display-name').innerText = currentUser.user_metadata.full_name || 'Korisnik';
        document.getElementById('user-display-email').innerText = currentUser.email;
        
        initRealtime(); // Start listening for messages
    } else {
        if (authView) authView.style.display = 'block';
        if (userView) userView.style.display = 'none';
        if (addNavBtn) addNavBtn.style.display = 'none'; // Hide "Add" for guests
    }
    
    // Re-render feed to show/hide "Respond" buttons correctly
    fetchNeeds();
}

function initAuthTabs() {
    const tabs = document.querySelectorAll('.auth-tab-btn');
    const forms = document.querySelectorAll('.auth-form');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-tab')).classList.add('active');
        });
    });
}

function initAuthForms() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const logoutBtn = document.getElementById('logout-btn');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) alert(error.message);
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const full_name = document.getElementById('reg-name').value;
            
            const { error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { full_name } }
            });
            
            if (error) alert(error.message);
            else alert('Provjerite email za potvrdu registracije!');
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => supabaseClient.auth.signOut());
    }
}

// Geolocation Logic
async function detectLocation() {
    const locationInput = document.getElementById('location');
    if (!locationInput) return;

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                const data = await response.json();
                
                currentUserLocation = {
                    lat: latitude,
                    lon: longitude,
                    country: data.address ? data.address.country_code : 'unknown'
                };
                
                locationInput.value = "📍 Lokacija očitana";
                locationInput.style.color = "var(--primary)";
                locationInput.readOnly = true;

                // Re-fetch or re-render to update distances
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
    if (!needsList) return;
    
    const now = new Date().toISOString();
    
    // Fetch ads that haven't expired yet
    const { data, error } = await supabaseClient
        .from('oglasi')
        .select('*')
        .gt('expires_at', now) // Only active ads
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching needs:', error);
        return;
    }

    renderNeeds(data);
}

// Rendering Logic
function renderNeeds(needs) {
    needsList.innerHTML = '';
    
    if (needs.length === 0) {
        needsList.innerHTML = '<div class="empty-state"><p>Još nema aktivnih oglasa u tvom susjedstvu.</p></div>';
        return;
    }

    // Sort by distance if location available
    let sortedNeeds = [...needs];
    if (currentUserLocation) {
        sortedNeeds.sort((a, b) => {
            const distA = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, a.lat, a.lon) || 9999;
            const distB = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, b.lat, b.lon) || 9999;
            return distA - distB;
        });
    }
    
    sortedNeeds.forEach(need => {
        let distanceStr = "Lokacija nepoznata";
        let isAbroad = false;

        if (currentUserLocation && need.lat && need.lon) {
            const dist = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, need.lat, need.lon);
            distanceStr = dist < 1 ? `${(dist * 1000).toFixed(0)}m od tebe` : `${dist.toFixed(1)}km od tebe`;
            isAbroad = currentUserLocation.country !== need.country_code;
        }

        // Expiry calculation
        const expiresAt = new Date(need.expires_at);
        const now = new Date();
        const diffMs = expiresAt - now;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        
        let expiryText = "";
        if (diffDays > 0) expiryText = `Istječe za ${diffDays} d.`;
        else if (diffHours > 0) expiryText = `Istječe za ${diffHours} h.`;
        else expiryText = "Uskoro istječe";

        const card = document.createElement('div');
        card.className = 'need-card';
        card.innerHTML = `
            <div class="card-header">
                <div class="tags">
                    <span class="category-tag">${need.category}</span>
                    ${isAbroad ? '<span class="abroad-tag">Inozemstvo</span>' : ''}
                </div>
                <div class="meta-info">
                    <span class="expiry-tag">${expiryText}</span>
                </div>
            </div>
            <p class="description-text">${need.description}</p>
            <div class="card-footer">
                <div class="location-info">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    <span>${distanceStr}</span>
                </div>
                ${currentUser ? `<button class="respond-btn" onclick="handleRespond('${need.id}', '${need.user_id}')">Javi se</button>` : ''}
            </div>
        `;
        needsList.appendChild(card);
    });
}

// Navigation
function initNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
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
        });
    });
}

// Form Logic
function initForm() {
    if (!postForm) return;
    postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = postForm.querySelector('.submit-btn');
        btn.innerText = "Objavljujem...";
        btn.disabled = true;

        const days = parseInt(document.getElementById('expiry').value);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);

        const { error } = await supabaseClient
            .from('oglasi')
            .insert([{
                category: document.getElementById('category').value,
                description: document.getElementById('description').value,
                lat: currentUserLocation ? currentUserLocation.lat : null,
                lon: currentUserLocation ? currentUserLocation.lon : null,
                country_code: currentUserLocation ? currentUserLocation.country : 'hr',
                expires_at: expiresAt.toISOString(),
                user_id: currentUser.id
            }]);

        if (error) {
            console.error('Error saving oglas:', error);
            btn.innerText = "Greška!";
            btn.style.background = "#ef4444";
            btn.disabled = false;
            return;
        }

        btn.innerText = "Objavljeno! 🎉";
        btn.style.background = "#22c55e";
        
        setTimeout(() => {
            btn.innerText = "Objavi oglas";
            btn.style.background = "var(--primary)";
            btn.disabled = false;
            postForm.reset();
            document.querySelector('[data-screen="feed-screen"]').click();
            fetchNeeds();
        }, 1500);
    });
}

// SW Registration
function registerSW() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(console.error);
        });
    }
}

// Global Handlers
window.handleRespond = (adId, receiverId) => {
    if (!currentUser) return; // Should not happen as btn is hidden

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
            console.error('Error sending message:', error);
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
        .select(`
            *,
            oglas_id (description)
        `)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching messages:', error);
        return;
    }

    if (data.length === 0) {
        messagesList.innerHTML = '<p class="empty-state">Još nemaš nijednu poruku.</p>';
        return;
    }

    messagesList.innerHTML = '';
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
            console.log('Nova poruka primljena!', payload);
            if (document.getElementById('messages-screen').classList.contains('active')) {
                fetchMessages();
            } else {
                // Show a small notification or badge here
                alert('Primili ste novu poruku u susjedstvu! 💬');
            }
        })
        .subscribe();
}
