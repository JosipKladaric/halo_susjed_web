// Global State
let currentUserLocation = null;

// Mock Data with Coordinates
const MOCK_NEEDS = [
    {
        id: 1,
        title: "Trebam košnju trave",
        description: "Dvorište od cca 300m2. Imam kosilicu, samo mi treba netko tko bi to odradio ovaj vikend.",
        category: "Usluge",
        lat: 45.815, lon: 15.9819, // Zagreb
        country: 'hr',
        created_at: "Prije 2 sata"
    },
    {
        id: 2,
        title: "Tražim na posudbu bušilicu",
        description: "Trebam probušiti par rupa u zidu za slike. Vraćam isti dan, uz pivo po izboru!",
        category: "Stvari",
        lat: 45.793, lon: 15.934, // Vrbani
        country: 'hr',
        created_at: "Prije 5 sati"
    },
    {
        id: 3,
        title: "Pomoć oko prijenosa namještaja",
        description: "Trebam dvije jake ruke za iznijeti stari kauč. Trajanje cca 15 min.",
        category: "Pomoć",
        lat: 44.812, lon: 20.461, // Belgrade (Different country)
        country: 'rs',
        created_at: "Jučer"
    }
];

// UI Elements
const navItems = document.querySelectorAll('.nav-item');
const screens = document.querySelectorAll('.screen');
const needsList = document.getElementById('needs-list');
const postForm = document.getElementById('post-form');

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    renderNeeds(MOCK_NEEDS);
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

                renderNeeds(MOCK_NEEDS);
            } catch (error) {
                console.error("Location error:", error);
            }
        });
    }
}

// Distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Rendering Logic
function renderNeeds(needs) {
    if (!needsList) return;
    needsList.innerHTML = '';
    
    // Sort by distance if location available
    let sortedNeeds = [...needs];
    if (currentUserLocation) {
        sortedNeeds.sort((a, b) => {
            const distA = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, a.lat, a.lon);
            const distB = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, b.lat, b.lon);
            return distA - distB;
        });
    }
    
    sortedNeeds.forEach(need => {
        let distanceStr = "Lokacija nepoznata";
        let isAbroad = false;

        if (currentUserLocation && need.lat && need.lon) {
            const dist = calculateDistance(currentUserLocation.lat, currentUserLocation.lon, need.lat, need.lon);
            distanceStr = dist < 1 ? `${(dist * 1000).toFixed(0)}m od tebe` : `${dist.toFixed(1)}km od tebe`;
            isAbroad = currentUserLocation.country !== need.country;
        }

        // Expiry calculation (simple display)
        const expiryText = need.expiry_days ? `Istječe za ${need.expiry_days} d.` : "Aktivan";

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
                    <span class="time-stamp">${need.created_at}</span>
                </div>
            </div>
            <h3>${need.title}</h3>
            <p>${need.description}</p>
            <div class="card-footer">
                <div class="location-info">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    <span>${distanceStr}</span>
                </div>
                <button class="respond-btn" onclick="handleRespond(${need.id})">Javi se</button>
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
    postForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newNeed = {
            id: Date.now(),
            title: document.getElementById('title').value,
            category: document.getElementById('category').value,
            description: document.getElementById('description').value,
            expiry_days: document.getElementById('expiry').value,
            lat: currentUserLocation ? currentUserLocation.lat : 45.815,
            lon: currentUserLocation ? currentUserLocation.lon : 15.981,
            country: currentUserLocation ? currentUserLocation.country : 'hr',
            created_at: "Upravo sada"
        };
        MOCK_NEEDS.unshift(newNeed);
        const btn = postForm.querySelector('.submit-btn');
        btn.innerText = "Objavljeno! 🎉";
        btn.style.background = "#22c55e";
        setTimeout(() => {
            btn.innerText = "Objavi oglas";
            btn.style.background = "var(--primary)";
            postForm.reset();
            document.querySelector('[data-screen="feed-screen"]').click();
            renderNeeds(MOCK_NEEDS);
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
    const need = MOCK_NEEDS.find(n => n.id === id);
    alert(`Kontaktiranje za: "${need.title}"`);
};

window.detectLocation = detectLocation;
