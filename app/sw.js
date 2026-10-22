// ============================================================================
// DANUBRA — service worker len na to, aby sa appka dala pridať na plochu
// ============================================================================
// Nič sa tu neukladá do pamäte (cache): appka musí vždy ukazovať čerstvé
// dáta a čerstvý kód. Požiadavky idú normálne na sieť — prázdny „fetch"
// ich nechá prehliadaču. Prehliadač podľa toho pozná, že je to aplikácia,
// a ponúkne „Pridať na plochu".
// ============================================================================
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
