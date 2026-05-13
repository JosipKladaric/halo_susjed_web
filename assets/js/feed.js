import { state } from './state.js';
import { supabaseClient } from './config.js';
import { calculateDistance, showToast, showConfirm } from './utils.js';
import { compressImage } from './imageUtils.js';

let renderLimit = 15;

export function initSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        filterNeeds(term);
    });
}

function filterNeeds(term) {
    if (!term) { renderLimit = 15; renderNeeds(state.allNeeds); return; }
    const filtered = state.allNeeds.filter(need => 
        need.description.toLowerCase().includes(term) || 
        (need.poster_name && need.poster_name.toLowerCase().includes(term)) ||
        (need.location_name && need.location_name.toLowerCase().includes(term))
    );
    renderLimit = 15;
    renderNeeds(filtered, true);
}

export async function fetchNeeds() {
    if (!state.currentUserLocation) return;
    const needsList = document.getElementById('needs-list');
    if (!needsList) return;
    
    const now = new Date().toISOString();
    const { data, error } = await supabaseClient.from('oglasi').select('*').gt('expires_at', now).order('created_at', { ascending: false });
    if (error) return;
    state.allNeeds = data;
    renderLimit = 15;
    renderNeeds(data);
}

export function renderNeeds(needs, isFiltering = false) {
    const needsList = document.getElementById('needs-list');
    if (!needsList) return;
    needsList.innerHTML = '';
    
    if (needs.length === 0) {
        needsList.innerHTML = '<div class="empty-state"><p>Još nema aktivnih oglasa u tvom susjedstvu.</p></div>';
        return;
    }

    let displayNeeds = [...needs];
    if (state.currentUserLocation) {
        displayNeeds = displayNeeds.filter(need => {
            if (!need.lat || !need.lon) return true;
            const dist = calculateDistance(state.currentUserLocation.lat, state.currentUserLocation.lon, need.lat, need.lon);
            return dist <= 50;
        });
        displayNeeds.sort((a, b) => {
            const distA = calculateDistance(state.currentUserLocation.lat, state.currentUserLocation.lon, a.lat, a.lon) || 9999;
            const distB = calculateDistance(state.currentUserLocation.lat, state.currentUserLocation.lon, b.lat, b.lon) || 9999;
            return distA - distB;
        });
    }
    
    if (displayNeeds.length === 0) {
        needsList.innerHTML = '<div class="empty-state"><p>Nema aktivnih oglasa u krugu od 50km.</p></div>';
        return;
    }

    const itemsToRender = displayNeeds.slice(0, renderLimit);
    
    itemsToRender.forEach(need => {
        let distanceStr = "";
        if (state.currentUserLocation && need.lat && need.lon) {
            const dist = calculateDistance(state.currentUserLocation.lat, state.currentUserLocation.lon, need.lat, need.lon);
            distanceStr = dist < 1 ? `${(dist * 1000).toFixed(0)}m` : `${dist.toFixed(1)}km`;
        }

        const card = document.createElement('div');
        card.className = 'need-card';
        card.innerHTML = `
            <div class="user-meta" style="margin-bottom: 8px;">
                <span class="poster-name">${need.poster_name ? need.poster_name.split(' ')[0] : 'Susjed'}</span>
                <span class="meta-separator">-</span>
                <span class="location-name">${need.location_name || 'Nepoznato'}</span>
                ${distanceStr ? `<span class="meta-separator">-</span> <span class="distance-tag">${distanceStr}</span>` : ''}
            </div>
            <div class="need-compact-row">
                <div class="need-details">
                    <p class="description-text" style="margin-top: 0;">${need.description}</p>
                    ${need.image_url ? `<img src="${need.image_url}" style="max-width: 100%; border-radius: 8px; margin: 8px 0;" loading="lazy" />` : ''}
                    <div class="reward-line">
                        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M20 12V8H6a2 2 0 0 1-2-2 2 2 0 0 1 2-2h14v4"></path><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"></path><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"></path></svg>
                        <span>Zauzvrat: ${need.reward || 'Dogovor'}</span>
                    </div>
                </div>
                <div class="need-action-area">
                    ${state.currentUser ? 
                        (need.user_id === state.currentUser.id ? 
                            `<span class="my-post-badge-mini">Moja</span>` : 
                            `<button class="respond-btn-compact" onclick="window.handleRespond('${need.id}', '${need.user_id}', '${need.description.replace(/'/g, "\\'")}')">Javi se</button>`
                        ) : ''}
                </div>
            </div>
        `;
        needsList.appendChild(card);
    });

    if (displayNeeds.length > renderLimit) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'secondary-btn';
        loadMoreBtn.style.width = '100%';
        loadMoreBtn.style.marginTop = '1rem';
        loadMoreBtn.innerText = 'Učitaj još oglasa';
        loadMoreBtn.onclick = () => {
            renderLimit += 15;
            renderNeeds(needs, isFiltering);
        };
        needsList.appendChild(loadMoreBtn);
    }
}

export async function fetchUserAds() {
    const list = document.getElementById('my-ads-list');
    if (!list || !state.currentUser) return;

    const now = new Date().toISOString();
    const { data, error } = await supabaseClient.from('oglasi').select('*').eq('user_id', state.currentUser.id).gt('expires_at', now).order('created_at', { ascending: false });
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
            <button class="my-ad-delete-btn" onclick="window.deleteAd('${ad.id}')">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
        `;
        list.appendChild(item);
    });
}

export function initForm() {
    const postForm = document.getElementById('post-form');
    const imageInput = document.getElementById('post-image');
    const imagePreview = document.getElementById('image-preview');

    if (imageInput && imagePreview) {
        imageInput.addEventListener('change', async (e) => {
            if (e.target.files && e.target.files[0]) {
                try {
                    const file = e.target.files[0];
                    const compressedFile = await compressImage(file, 100);
                    imagePreview.src = URL.createObjectURL(compressedFile);
                    imagePreview.style.display = 'block';
                    imageInput.compressedFile = compressedFile;
                } catch (err) {
                    showToast('Greška pri kompresiji slike.', 'error');
                }
            } else {
                imagePreview.style.display = 'none';
                imageInput.compressedFile = null;
            }
        });
    }

    if (!postForm) return;
    postForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!state.currentUser) {
            showToast('Prijavite se.', 'info');
            const navAuth = document.getElementById('nav-auth');
            if (navAuth) navAuth.click();
            return;
        }
        if (!state.currentUserLocation) { alert('Lokacija nije spremna.'); return; }
        
        const btn = postForm.querySelector('.submit-btn');
        const originalText = btn.innerText;
        btn.innerText = "Pripremam..."; btn.disabled = true;

        const days = parseInt(document.getElementById('expiry').value);
        const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + days);

        let imageUrl = null;
        if (imageInput && imageInput.compressedFile) {
            btn.innerText = "Spremam sliku...";
            const fileName = `${state.currentUser.id}_${Date.now()}.webp`;
            const { data: uploadData, error: uploadError } = await supabaseClient.storage.from('oglasi').upload(fileName, imageInput.compressedFile, { contentType: 'image/webp' });
            if (uploadError) { 
                showToast('Greška pri uploadu slike.', 'error'); 
                btn.innerText = originalText; btn.disabled = false;
                return; 
            }
            const { data: { publicUrl } } = supabaseClient.storage.from('oglasi').getPublicUrl(fileName);
            imageUrl = publicUrl;
        }

        btn.innerText = "Objavljujem...";

        try {
            const { error } = await supabaseClient.from('oglasi').insert([{
                description: document.getElementById('description').value,
                reward: document.getElementById('reward').value,
                lat: state.currentUserLocation.lat,
                lon: state.currentUserLocation.lon,
                country_code: state.currentUserLocation.country,
                location_name: state.currentUserLocation.name,
                expires_at: expiresAt.toISOString(),
                user_id: state.currentUser.id,
                poster_name: state.currentUser.user_metadata?.full_name || 'Susjed',
                image_url: imageUrl
            }]);

            if (error) throw error;
            btn.innerText = "Objavljeno! 🎉";
            setTimeout(() => {
                btn.innerText = originalText; btn.disabled = false;
                postForm.reset();
                if (imagePreview) imagePreview.style.display = 'none';
                if (imageInput) imageInput.compressedFile = null;
                const navFeed = document.getElementById('nav-feed');
                if (navFeed) navFeed.click();
                fetchNeeds();
            }, 1500);
        } catch (err) {
            btn.innerText = "Greška!"; btn.disabled = false;
            showToast(`Greška: ${err.message}`, 'error');
        }
    };
}

export async function deleteAd(adId) {
    showConfirm('Želite li ugasiti ovaj oglas?', async () => {
        const expiredDate = '1970-01-01T00:00:00Z';
        const idToUse = isNaN(adId) ? adId : parseInt(adId);
        const { data, error } = await supabaseClient.from('oglasi').update({ expires_at: expiredDate }).eq('id', idToUse).eq('user_id', state.currentUser.id).select();
        if (error) showToast('Greška pri gašenju oglasa.', 'error');
        else if (!data || data.length === 0) showToast('Oglas nije pronađen ili niste vlasnik.', 'error');
        else { await fetchUserAds(); await fetchNeeds(); showToast('Oglas je uspješno ugašen.'); }
    });
}
