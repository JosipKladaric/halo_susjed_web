export function showToast(message, type = 'success') {
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

export function showConfirm(message, onConfirm) {
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
    okBtn.onclick = () => { cleanup(); if (onConfirm) onConfirm(); };
    cancelBtn.onclick = () => { cleanup(); };
}

export function transliterate(text) {
    const map = { 'č': 'c', 'ć': 'c', 'ž': 'z', 'š': 's', 'đ': 'd', 'Č': 'C', 'Ć': 'C', 'Ž': 'Z', 'Š': 'S', 'Đ': 'D' };
    return text.split('').map(char => map[char] || char).join('');
}

export function buildEmail(ime, prezime, suffix = "") {
    const cleanIme = transliterate(ime.trim().toLowerCase()).replace(/\s+/g, '');
    const cleanPrezime = transliterate(prezime.trim().toLowerCase()).replace(/\s+/g, '');
    return `${cleanIme}.${cleanPrezime}${suffix ? '.' + suffix : ''}@halosusjed.app`;
}

export async function getPasswordSuffix(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 4);
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
