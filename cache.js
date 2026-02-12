// IndexedDB caching for faster subsequent loads
const DB_NAME = 'MetMuseumArchive';
const DB_VERSION = 1;
const STORE_NAME = 'objects';
const CACHE_KEY = 'all_objects';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

let db = null;

// Initialize IndexedDB
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

// Save data to IndexedDB
async function saveToCache(data) {
    try {
        if (!db) await initDB();
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const cacheEntry = {
            data: data,
            timestamp: Date.now()
        };
        
        store.put(cacheEntry, CACHE_KEY);
        console.log('✓ Data cached to IndexedDB');
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    } catch (error) {
        console.warn('Failed to cache data:', error);
    }
}

// Load data from IndexedDB
async function loadFromCache() {
    try {
        if (!db) await initDB();
        
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(CACHE_KEY);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const result = request.result;
                
                // Check if cache exists and is not expired
                if (result && result.data) {
                    const age = Date.now() - result.timestamp;
                    if (age < CACHE_DURATION) {
                        console.log(`✓ Loaded from cache (${Math.round(age / 1000 / 60)} minutes old)`);
                        resolve(result.data);
                    } else {
                        console.log('Cache expired, will fetch fresh data');
                        resolve(null);
                    }
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.warn('Failed to load from cache:', error);
        return null;
    }
}

// Clear cache (useful for debugging or forcing refresh)
async function clearCache() {
    try {
        if (!db) await initDB();
        
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(CACHE_KEY);
        
        console.log('✓ Cache cleared');
    } catch (error) {
        console.warn('Failed to clear cache:', error);
    }
}

// Export functions
window.MetCache = {
    saveToCache,
    loadFromCache,
    clearCache
};
