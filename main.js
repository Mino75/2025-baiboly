// Bible PWA Main JavaScript

// Bible files can be configured via environment variable
// This will be overridden by Docker environment variable if set
if (!window.BIBLE_FILES) {
    window.BIBLE_FILES = [
        '/es_rvr.json',
        '/ru_synodal.json', 
        '/en_kjv.json',
        '/zh_cuv.json'
    ];
}

class BibleApp {
    constructor() {
        this.bibleData = null;
        this.availableBibles = [];
        this.currentFontSize = 'medium';
        this.fontSizes = ['small', 'medium', 'large', 'xlarge'];
        this.dbName = 'BibleReader';
        this.dbVersion = 1;
        this.db = null;
        
        // Default Bible files list - can be overridden by environment variable
        this.defaultBibleFiles = [
            '/es_rvr.json',
            '/ru_synodal.json', 
            '/en_kjv.json',
            '/zh_cuv.json'
        ];
        
        this.elements = {
            languageSelect: document.getElementById('languageSelect'),
            bibleSelect: document.getElementById('bibleSelect'),
            controls: document.getElementById('controls'),
            bookSelect: document.getElementById('bookSelect'),
            verseControls: document.getElementById('verseControls'),
            startVerse: document.getElementById('startVerse'),
            endVerse: document.getElementById('endVerse'),
            readBtn: document.getElementById('readBtn'),
            fontBtn: document.getElementById('fontBtn'),
            welcome: document.getElementById('welcome'),
            reading: document.getElementById('reading'),
            loading: document.getElementById('loading'),
            error: document.getElementById('error'),
            chapterTitle: document.getElementById('chapterTitle'),
            verses: document.getElementById('verses'),
            errorMessage: document.getElementById('errorMessage')
        };
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.loadFontPreference();
        await this.initIndexedDB();
        await this.discoverBibles();
        this.registerServiceWorker();
    }

    setupEventListeners() {
        this.elements.languageSelect.addEventListener('change', () => {
            this.filterBiblesByLanguage();
        });

        this.elements.bibleSelect.addEventListener('change', async (e) => {
            if (e.target.value) {
                await this.loadSelectedBible(e.target.value);
            } else {
                this.hideControls();
                this.showWelcome();
            }
        });

        this.elements.bookSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                this.showVerseControls();
                this.updateVerseInputLimits(e.target.value);
            } else {
                this.hideVerseControls();
            }
        });

        this.elements.readBtn.addEventListener('click', () => {
            this.displayVerses();
        });

        this.elements.fontBtn.addEventListener('click', () => {
            this.cycleFontSize();
        });

        // Allow Enter key to trigger reading
        [this.elements.startVerse, this.elements.endVerse].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.displayVerses();
                }
            });
        });
    }

    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.warn('IndexedDB not available, will use direct JSON loading');
                resolve();
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store for Bible data
                if (!db.objectStoreNames.contains('bibles')) {
                    const store = db.createObjectStore('bibles', { keyPath: 'filename' });
                    store.createIndex('language', 'language', { unique: false });
                }
                
                // Create object store for Bible index (books list)
                if (!db.objectStoreNames.contains('bible_index')) {
                    db.createObjectStore('bible_index', { keyPath: 'filename' });
                }
            };
        });
    }

    async getBibleFromCache(filename) {
        if (!this.db) return null;
        
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['bibles'], 'readonly');
            const store = transaction.objectStore('bibles');
            const request = store.get(filename);
            
            request.onsuccess = () => {
                resolve(request.result?.data || null);
            };
            
            request.onerror = () => {
                resolve(null);
            };
        });
    }

    async cacheBible(filename, data) {
        if (!this.db) return;
        
        try {
            const transaction = this.db.transaction(['bibles'], 'readwrite');
            const store = transaction.objectStore('bibles');
            
            await store.put({
                filename,
                data,
                cached_at: Date.now()
            });
        } catch (error) {
            console.warn('Failed to cache Bible data:', error);
        }
    }
        try {
            // Get list of available Bible JSON files from service worker
            const response = await fetch('/api/bibles');
            if (response.ok) {
                this.availableBibles = await response.json();
            } else {
                // Fallback: try to discover files by common naming patterns
                this.availableBibles = await this.fallbackDiscoverBibles();
            }
            
            this.populateLanguageFilter();
            this.populateBibleSelect();
        } catch (error) {
            console.error('Failed to discover Bibles:', error);
            this.availableBibles = await this.fallbackDiscoverBibles();
            this.populateLanguageFilter();
            this.populateBibleSelect();
        }
    }

    getBibleFilesConfig() {
        // Get Bible files list from environment variable or use default
        if (window.BIBLE_FILES && Array.isArray(window.BIBLE_FILES)) {
            return window.BIBLE_FILES;
        }
        
        // Fallback to default list
        return this.defaultBibleFiles;
    }

    async fallbackDiscoverBibles() {
        const bibleFiles = this.getBibleFilesConfig();
        const availableBibles = [];
        
        for (const filepath of bibleFiles) {
            try {
                const response = await fetch(filepath, { method: 'HEAD' });
                if (response.ok) {
                    // Extract filename without path and extension
                    const filename = filepath.split('/').pop();
                    const nameWithoutExt = filename.replace('.json', '');
                    
                    // Parse language and version from filename
                    const parts = nameWithoutExt.split('_');
                    if (parts.length >= 2) {
                        const language = parts[0];
                        const version = parts.slice(1).join('_').toUpperCase();
                        
                        availableBibles.push({
                            filename: filepath,
                            language,
                            version,
                            name: `${language.toUpperCase()} - ${version}`
                        });
                    }
                }
            } catch (e) {
                console.warn(`Bible file not found: ${filepath}`);
            }
        }

        return availableBibles;
    }

    populateLanguageFilter() {
        const languages = [...new Set(this.availableBibles.map(bible => bible.language))];
        
        this.elements.languageSelect.innerHTML = '<option value="">All languages</option>';
        
        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = lang.toUpperCase();
            this.elements.languageSelect.appendChild(option);
        });
    }

    populateBibleSelect() {
        this.filterBiblesByLanguage();
    }

    filterBiblesByLanguage() {
        const selectedLanguage = this.elements.languageSelect.value;
        const filteredBibles = selectedLanguage 
            ? this.availableBibles.filter(bible => bible.language === selectedLanguage)
            : this.availableBibles;

        this.elements.bibleSelect.innerHTML = '<option value="">Select a Bible...</option>';
        
        filteredBibles.forEach(bible => {
            const option = document.createElement('option');
            option.value = bible.filename;
            option.textContent = bible.name;
            this.elements.bibleSelect.appendChild(option);
        });

        // Reset controls when filter changes
        this.elements.bibleSelect.value = '';
        this.hideControls();
        this.showWelcome();
    }

    async loadSelectedBible(filename) {
        this.showLoading();
        
        try {
            // Try to get from cache first
            let bibleData = await this.getBibleFromCache(filename);
            
            if (!bibleData) {
                // Load from JSON file
                const response = await fetch(filename);
                if (!response.ok) {
                    throw new Error(`Failed to load ${filename} (${response.status})`);
                }
                bibleData = await response.json();
                
                // Cache the loaded data
                await this.cacheBible(filename, bibleData);
            }
            
            this.bibleData = bibleData;
            this.populateBookSelect();
            this.showControls();
            this.hideLoading();
        } catch (error) {
            this.showError(`Failed to load Bible: ${error.message}`);
        }
    }

    populateBookSelect() {
        if (!this.bibleData) return;

        this.elements.bookSelect.innerHTML = '<option value="">Select a book...</option>';
        
        Object.keys(this.bibleData).forEach(book => {
            const option = document.createElement('option');
            option.value = book;
            option.textContent = book;
            this.elements.bookSelect.appendChild(option);
        });
    }

    updateVerseInputLimits(bookName) {
        const book = this.bibleData[bookName];
        if (!book || !book[0]) return;

        const totalVerses = book[0].verses.length;
        
        this.elements.startVerse.max = totalVerses;
        this.elements.endVerse.max = totalVerses;
        this.elements.startVerse.placeholder = `Start verse (1-${totalVerses})`;
        this.elements.endVerse.placeholder = `End verse (1-${totalVerses})`;
    }

    showControls() {
        this.elements.controls.classList.remove('hidden');
    }

    hideControls() {
        this.elements.controls.classList.add('hidden');
        this.hideVerseControls();
    }

    showVerseControls() {
        this.elements.verseControls.classList.remove('hidden');
    }

    hideVerseControls() {
        this.elements.verseControls.classList.add('hidden');
    }

    showWelcome() {
        this.elements.welcome.classList.remove('hidden');
        this.elements.reading.classList.add('hidden');
        this.elements.loading.classList.add('hidden');
        this.elements.error.classList.add('hidden');
    }

    showLoading() {
        this.elements.welcome.classList.add('hidden');
        this.elements.reading.classList.add('hidden');
        this.elements.loading.classList.remove('hidden');
        this.elements.error.classList.add('hidden');
    }

    hideLoading() {
        this.elements.loading.classList.add('hidden');
    }

    showReading() {
        this.elements.welcome.classList.add('hidden');
        this.elements.reading.classList.remove('hidden');
        this.elements.loading.classList.add('hidden');
        this.elements.error.classList.add('hidden');
    }

    showError(message) {
        this.elements.welcome.classList.add('hidden');
        this.elements.reading.classList.add('hidden');
        this.elements.loading.classList.add('hidden');
        this.elements.error.classList.remove('hidden');
        this.elements.errorMessage.textContent = message;
    }

    displayVerses() {
        const bookName = this.elements.bookSelect.value;
        if (!bookName) {
            this.showError('Please select a book first.');
            return;
        }

        const book = this.bibleData[bookName];
        if (!book || !book[0]) {
            this.showError('Book data not found.');
            return;
        }

        const startVerse = parseInt(this.elements.startVerse.value) || null;
        const endVerse = parseInt(this.elements.endVerse.value) || null;
        
        const verses = this.getVerseRange(book[0].verses, startVerse, endVerse);
        
        if (verses.length === 0) {
            this.showError('No verses found for the specified range.');
            return;
        }

        this.renderVerses(bookName, verses, startVerse, endVerse);
        this.showReading();
    }

    getVerseRange(allVerses, start, end) {
        // No start, no end: show all
        if (!start && !end) {
            return allVerses;
        }
        
        // Start only: show just that verse
        if (start && !end) {
            return allVerses.filter(v => v.verse === start);
        }
        
        // End only: show from beginning to end
        if (!start && end) {
            return allVerses.filter(v => v.verse <= end);
        }
        
        // Both start and end: show range
        return allVerses.filter(v => v.verse >= start && v.verse <= end);
    }

    renderVerses(bookName, verses, startVerse, endVerse) {
        // Set title
        let title = `${bookName}`;
        const book = this.bibleData[bookName][0];
        if (book && book.chapter) {
            title += ` ${book.chapter}`;
        }
        
        if (startVerse && endVerse && startVerse !== endVerse) {
            title += `:${startVerse}-${endVerse}`;
        } else if (startVerse) {
            title += `:${startVerse}`;
        } else if (endVerse) {
            title += `:1-${endVerse}`;
        }
        
        this.elements.chapterTitle.textContent = title;

        // Render verses
        this.elements.verses.innerHTML = '';
        this.elements.verses.className = `font-${this.currentFontSize}`;
        
        verses.forEach(verse => {
            const verseElement = document.createElement('div');
            verseElement.className = 'verse';
            verseElement.innerHTML = `
                <span class="verse-number">${verse.verse}</span>
                <span class="verse-text">${verse.text}</span>
            `;
            this.elements.verses.appendChild(verseElement);
        });
    }

    cycleFontSize() {
        const currentIndex = this.fontSizes.indexOf(this.currentFontSize);
        const nextIndex = (currentIndex + 1) % this.fontSizes.length;
        this.currentFontSize = this.fontSizes[nextIndex];
        
        // Update verses display if visible
        if (!this.elements.reading.classList.contains('hidden')) {
            this.elements.verses.className = `font-${this.currentFontSize}`;
        }
        
        // Save preference
        localStorage.setItem('bibleFontSize', this.currentFontSize);
        
        // Update button text
        const sizeLabels = { small: 'Aa', medium: 'Aa', large: 'AA', xlarge: 'AA' };
        this.elements.fontBtn.textContent = sizeLabels[this.currentFontSize];
    }

    loadFontPreference() {
        const saved = localStorage.getItem('bibleFontSize');
        if (saved && this.fontSizes.includes(saved)) {
            this.currentFontSize = saved;
        }
        
        const sizeLabels = { small: 'Aa', medium: 'Aa', large: 'AA', xlarge: 'AA' };
        this.elements.fontBtn.textContent = sizeLabels[this.currentFontSize];
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('sw.js');
            } catch (error) {
                console.warn('Service Worker registration failed:', error);
            }
        }
    }
}

// Initialize app when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new BibleApp());
} else {
    new BibleApp();
}
