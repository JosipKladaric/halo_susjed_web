// Supabase Configuration
const supabaseUrl = 'https://edzldzjwogwzmekqvape.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkemxkemp3b2d3em1la3F2YXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDk5NTUsImV4cCI6MjA5MzgyNTk1NX0.k11qcVKTar0rlYtP15whBwaF2USg6gJ63hRa-2VGs7g';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Global State
let currentUserLocation = null;

// UI Elements
const navItems = document.querySelectorAll('.nav-item');
const screens = document.querySelectorAll('.screen');
const needsList = document.getElementById('needs-list');
const postForm = document.getElementById('post-form');

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    fetchNeeds(); // Fetch real data from DB
    initForm();
    registerSW();
    detectLocation();
});

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
    
    const { data, error } = await supabase
        .from('oglasi')
        .select('*')
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
        needsList.innerHTML = '<div class="empty-state"><p>Još nema oglasa u tvom susjedstvu.</p></div>';
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

        const timeStr = new Date(need.created_at).toLocaleDateString('hr-HR');

        const card = document.createElement('div');
        card.className = 'need-card';
        card.innerHTML = `
            <div class="card-header">
                <div class="tags">
                    <span class="category-tag">${need.category}</span>
                    ${isAbroad ? '<span class="abroad-tag">Inozemstvo</span>' : ''}
                </div>
                <div class="meta-info">
                    <span class="expiry-tag">Aktivan</span>
                    <span class="time-stamp">${timeStr}</span>
                </div>
            </div>
            <h3>${need.title}</h3>
            <p>${need.description}</p>
            <div class="card-footer">
                <div class="location-info">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    <span>${distanceStr}</span>
                </div>
                <button class="respond-btn" onclick="handleRespond('${need.id}')">Javi se</button>
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
                if (screen.id === targetScreen) screen.classList.add('active');
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

        const { error } = await supabase
            .from('oglasi')
            .insert([{
                title: document.getElementById('title').value,
                category: document.getElementById('category').value,
                description: document.getElementById('description').value,
                lat: currentUserLocation ? currentUserLocation.lat : null,
                lon: currentUserLocation ? currentUserLocation.lon : null,
                country_code: currentUserLocation ? currentUserLocation.country : 'hr'
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
window.handleRespond = (id) => {
    alert(`Kontaktiranje za oglas: ${id}\n(Sustav poruka je sljedeći korak!)`);
};
