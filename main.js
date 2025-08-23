// Bible PWA Main JavaScript

// Bible files can be configured via environment variable
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
        this.bibleData = null; // Store original structure
        this.availableBibles = [];
        this.currentFontSize = 'medium';
        this.fontSizes = ['small', 'medium', 'large', 'xlarge'];
        this.dbName = 'BibleReader';
        this.dbVersion = 1;
        this.db = null;
        
        // Default Bible files list
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
            chapterSelect: document.getElementById('chapterSelect'),
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
                this.populateChapterSelect(e.target.value);
                this.showVerseControls();
            } else {
                this.hideChapterSelect();
                this.hideVerseControls();
            }
        });

        this.elements.chapterSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                this.updateVerseInputLimits();
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
                
                if (!db.objectStoreNames.contains('bibles')) {
                    const store = db.createObjectStore('bibles', { keyPath: 'filename' });
                    store.createIndex('language', 'language', { unique: false });
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
                data, // Store original structure
                cached_at: Date.now()
            });
        } catch (error) {
            console.warn('Failed to cache Bible data:', error);
        }
    }

    async discoverBibles() {
        try {
            const response = await fetch('/api/bibles');
            if (response.ok) {
                this.availableBibles = await response.json();
            } else {
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
        if (window.BIBLE_FILES && Array.isArray(window.BIBLE_FILES)) {
            return window.BIBLE_FILES;
        }
        return this.defaultBibleFiles;
    }

    async fallbackDiscoverBibles() {
        const bibleFiles = this.getBibleFilesConfig();
        const availableBibles = [];
        
        for (const filepath of bibleFiles) {
            try {
                const response = await fetch(filepath, { method: 'HEAD' });
                if (response.ok) {
                    const filename = filepath.split('/').pop();
                    const nameWithoutExt = filename.replace('.json', '');
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

        this.elements.bibleSelect.value = '';
        this.hideControls();
        this.showWelcome();
    }

    async loadSelectedBible(filename) {
        this.showLoading();
        
        try {
            let bibleData = await this.getBibleFromCache(filename);
            
            if (!bibleData) {
                const response = await fetch(filename);
                if (!response.ok) {
                    throw new Error(`Failed to load ${filename} (${response.status})`);
                }
                bibleData = await response.json();
                await this.cacheBible(filename, bibleData);
            }
            
            this.bibleData = bibleData;
            this.populateBookSelect();
            this.showControls();
            this.hideLoading();
            
            // Auto-select Genesis and display all verses
            this.autoSelectDefaults();
            
        } catch (error) {
            this.showError(`Failed to load Bible: ${error.message}`);
        }
    }

    findBookByAbbrev(abbreviation) {
        if (!this.bibleData || !Array.isArray(this.bibleData)) return null;
        return this.bibleData.find(book => book.abbrev === abbreviation);
    }

    populateBookSelect() {
        if (!this.bibleData || !Array.isArray(this.bibleData)) return;

        this.elements.bookSelect.innerHTML = '<option value="">Select a book...</option>';
        
        // Use book name from data structure
        this.bibleData.forEach(book => {
            const option = document.createElement('option');
            option.value = book.abbrev;
            option.textContent = book.name; // Use name from data!
            this.elements.bookSelect.appendChild(option);
        });
    }

    populateChapterSelect(bookAbbreviation) {
        const book = this.findBookByAbbrev(bookAbbreviation);
        if (!book || !book.chapters) return;

        // Create chapter select if it doesn't exist
        if (!this.elements.chapterSelect) {
            this.createChapterSelect();
        }

        this.elements.chapterSelect.innerHTML = '<option value="">Select chapter...</option>';
        
        book.chapters.forEach((chapter, index) => {
            const option = document.createElement('option');
            option.value = index + 1;
            option.textContent = `Chapter ${index + 1}`;
            this.elements.chapterSelect.appendChild(option);
        });

        this.showChapterSelect();
    }

    createChapterSelect() {
        this.elements.chapterSelect = document.createElement('select');
        this.elements.chapterSelect.id = 'chapterSelect';
        this.elements.chapterSelect.setAttribute('aria-label', 'Select chapter');
        this.elements.chapterSelect.style.marginBottom = '1rem';
        this.elements.chapterSelect.style.width = '100%';
        this.elements.chapterSelect.style.padding = '0.75rem';
        this.elements.chapterSelect.style.border = '1px solid #d1d5db';
        this.elements.chapterSelect.style.borderRadius = '0.375rem';
        this.elements.chapterSelect.style.fontSize = '1rem';
        this.elements.chapterSelect.style.background = 'white';
        this.elements.chapterSelect.classList.add('hidden');
        
        // Insert after book select
        this.elements.bookSelect.parentNode.insertBefore(
            this.elements.chapterSelect, 
            this.elements.verseControls
        );
        
        this.elements.chapterSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                this.updateVerseInputLimits();
            }
        });
    }

    showChapterSelect() {
        if (this.elements.chapterSelect) {
            this.elements.chapterSelect.classList.remove('hidden');
        }
    }

    hideChapterSelect() {
        if (this.elements.chapterSelect) {
            this.elements.chapterSelect.classList.add('hidden');
        }
    }

    updateVerseInputLimits() {
        const bookAbbreviation = this.elements.bookSelect.value;
        const chapterNumber = parseInt(this.elements.chapterSelect.value);
        
        if (!bookAbbreviation || !chapterNumber) return;
        
        const book = this.findBookByAbbrev(bookAbbreviation);
        if (!book || !book.chapters || !book.chapters[chapterNumber - 1]) return;

        const totalVerses = book.chapters[chapterNumber - 1].length;
        
        this.elements.startVerse.max = totalVerses;
        this.elements.endVerse.max = totalVerses;
        this.elements.startVerse.placeholder = `Start verse (1-${totalVerses})`;
        this.elements.endVerse.placeholder = `End verse (1-${totalVerses})`;
    }

    autoSelectDefaults() {
        // Select Genesis (first book)
        if (this.bibleData && this.bibleData.length > 0) {
            const firstBook = this.bibleData[0];
            this.elements.bookSelect.value = firstBook.abbrev;
            
            // Populate chapters for Genesis
            this.populateChapterSelect(firstBook.abbrev);
            this.showVerseControls();
            
            // Select Chapter 1
            if (this.elements.chapterSelect) {
                this.elements.chapterSelect.value = '1';
                this.updateVerseInputLimits();
            }
            
            // Auto-display Genesis 1 (all verses)
            this.displayVerses();
        }
    }

    showControls() {
        this.elements.controls.classList.remove('hidden');
    }

    hideControls() {
        this.elements.controls.classList.add('hidden');
        this.hideChapterSelect();
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
        const bookAbbreviation = this.elements.bookSelect.value;
        const chapterNumber = parseInt(this.elements.chapterSelect?.value);
        
        if (!bookAbbreviation) {
            this.showError('Please select a book first.');
            return;
        }

        if (!chapterNumber) {
            this.showError('Please select a chapter first.');
            return;
        }

        const book = this.findBookByAbbrev(bookAbbreviation);
        if (!book || !book.chapters || !book.chapters[chapterNumber - 1]) {
            this.showError('Chapter data not found.');
            return;
        }

        const startVerse = parseInt(this.elements.startVerse.value) || 1;
        let endVerse = parseInt(this.elements.endVerse.value);
        
        // If no end verse specified, use end of chapter
        if (!endVerse) {
            endVerse = book.chapters[chapterNumber - 1].length;
        }
        
        const chapterVerses = book.chapters[chapterNumber - 1];
        const verses = this.getVerseRange(chapterVerses, startVerse, endVerse);
        
        if (verses.length === 0) {
            this.showError('No verses found for the specified range.');
            return;
        }

        this.renderVerses(book.name, chapterNumber, verses, startVerse, endVerse);
        this.showReading();
    }

    getVerseRange(chapterVerses, start, end) {
        const allVerses = chapterVerses.map((text, index) => ({
            verse: index + 1,
            text: text
        }));

        return allVerses.filter(v => v.verse >= start && v.verse <= end);
    }

    renderVerses(bookName, chapterNumber, verses, startVerse, endVerse) {
        // Set title
        let title = `${bookName} ${chapterNumber}`;
        
        if (startVerse === endVerse) {
            title += `:${startVerse}`;
        } else if (startVerse !== 1 || endVerse !== verses.length + startVerse - 1) {
            title += `:${startVerse}-${endVerse}`;
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
        
        if (!this.elements.reading.classList.contains('hidden')) {
            this.elements.verses.className = `font-${this.currentFontSize}`;
        }
        
        localStorage.setItem('bibleFontSize', this.currentFontSize);
        
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
}

// Initialize app when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new BibleApp());
} else {
    new BibleApp();
}
