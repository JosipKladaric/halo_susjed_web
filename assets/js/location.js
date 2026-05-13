import { state } from './state.js';
import { fetchNeeds } from './feed.js';

export function detectLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                const data = await response.json();
                const address = data.address || {};
                const city = address.city || address.town || address.village || address.suburb || "Nepoznato mjesto";
                state.currentUserLocation = { lat: latitude, lon: longitude, country: address.country_code || 'hr', name: city };
                fetchNeeds();
            } catch (error) {
                console.error("Location error:", error);
                useFallbackLocation();
            }
        }, () => {
            useFallbackLocation();
        });
    } else {
        useFallbackLocation();
    }
}

function useFallbackLocation() {
    if (state.currentUser?.user_metadata?.home_location) {
        state.currentUserLocation = state.currentUser.user_metadata.home_location;
        console.log("Using home_location fallback.");
        fetchNeeds();
    } else {
        console.warn("No fallback location available.");
    }
}
