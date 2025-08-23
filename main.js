// Bible PWA Main JavaScript

class BibleApp {
    constructor() {
        this.bibleData = null; // Store original structure
        this.availableBibles = [];
        this.currentFontSize = 'medium';
        this.fontSizes = ['small', 'medium', 'large', 'xlarge'];
        this.dbName = 'BibleReader';
        this.dbVersion = 1;
        this.db = null;
        
        this.elements = {};
        this.init();
    }

    initElements() {
        // Safely get all DOM elements with error checking
        const elementIds = [
            'languageSelect',
            'bibleSelect', 
            'controls',
            'bookSelect',
            'verseControls',
            'startVerse',
            'endVerse', 
            'readBtn',
            'fontBtn',
            'welcome',
            'reading',
            'loading',
            'error',
            'chapterTitle',
            'verses',
            'errorMessage'
        ];

        elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (!element) {
                console.error(`Required element with id '${id}' not found in DOM`);
            }
            this.elements[id] = element;
        });

        // Validate critical elements exist
        const criticalElements = ['languageSelect', 'bibleSelect', 'bookSelect', 'readBtn'];
        const missingElements = criticalElements.filter(id => !this.elements[id]);
        
        if (missingElements.length > 0) {
            console.error('Critical DOM elements missing:', missingElements);
            this.showError(`App initialization failed: Missing required elements: ${missingElements.join(', ')}`);
            return false;
        }

        return true;
    }

    async init() {
        // Check if DOM elements were successfully initialized
        if (!this.initElements()) {
            return; // Exit if critical elements are missing
        }

        this.setupEventListeners();
        this.loadFontPreference();
        await this.initIndexedDB();
        await this.discoverBibles();
    }

    setupEventListeners() {
        // Safely add event listeners with null checks
        if (this.elements.languageSelect) {
            this.elements.languageSelect.addEventListener('change', () => {
                this.filterBiblesByLanguage();
            });
        }

        if (this.elements.bibleSelect) {
            this.elements.bibleSelect.addEventListener('change', async (e) => {
                if (e.target.value) {
                    await this.loadSelectedBible(e.target.value);
                } else {
                    this.hideControls();
                    this.showWelcome();
                }
            });
        }

        if (this.elements.bookSelect) {
            this.elements.bookSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.populateChapterSelect(e.target.value);
                    this.showVerseControls();
                } else {
                    this.hideChapterSelect();
                    this.hideVerseControls();
                }
            });
        }

        if (this.elements.readBtn) {
            this.elements.readBtn.addEventListener('click', () => {
                this.displayVerses();
            });
        }

        if (this.elements.fontBtn) {
            this.elements.fontBtn.addEventListener('click', () => {
                this.cycleFontSize();
            });
        }

        // Allow Enter key to trigger reading
        if (this.elements.startVerse && this.elements.endVerse) {
            [this.elements.startVerse, this.elements.endVerse].forEach(input => {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.displayVerses();
                    }
                });
            });
        }
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

    async getBibleFilesFromServiceWorker() {
        try {
            // Get cache info from service worker
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                if (registration.active) {
                    // Create a message channel to communicate with service worker
                    const messageChannel = new MessageChannel();
                    
                    return new Promise((resolve) => {
                        messageChannel.port1.onmessage = (event) => {
                            const cacheInfo = event.data;
                            // Filter Bible JSON files (contain underscore and end with .json)
                            const bibleFiles = cacheInfo.cachedUrls.filter(url => {
                                const filename = url.split('/').pop();
                                return filename.includes('_') && filename.endsWith('.json');
                            });
                            resolve(bibleFiles);
                        };
                        
                        // Send message to service worker
                        registration.active.postMessage({
                            type: 'CACHE_INFO'
                        }, [messageChannel.port2]);
                        
                        // Fallback timeout
                        setTimeout(() => resolve([]), 2000);
                    });
                }
            }
        } catch (error) {
            console.warn('Could not get Bible files from service worker:', error);
        }
        
        return [];
    }

    parseBibleFilename(filepath) {
        const filename = filepath.split('/').pop();
        const nameWithoutExt = filename.replace('.json', '');
        
        // Split by underscore: first part = language, rest = version
        const parts = nameWithoutExt.split('_');
        
        if (parts.length >= 2) {
            const language = parts[0].toLowerCase();
            const version = parts.slice(1).join('_').toUpperCase();
            
            return {
                filename: filepath,
                language,
                version,
                name: `${language.toUpperCase()} - ${version}`
            };
        }
        
        return null;
    }

    async discoverBibles() {
        console.log('Discovering Bible files...');
        
        // First try to get files from service worker cache
        let bibleFiles = await this.getBibleFilesFromServiceWorker();
        
        if (bibleFiles.length === 0) {
            console.log('No Bible files found in service worker, trying fallback discovery...');
            // Fallback: try common Bible files directly
            const commonFiles = [
                '/es_rvr.json',
                '/ru_synodal.json', 
                '/en_kjv.json',
                '/zh_cuv.json'
            ];
            
            for (const file of commonFiles) {
                try {
                    const response = await fetch(file, { method: 'HEAD' });
                    if (response.ok) {
                        bibleFiles.push(file);
                    }
                } catch (e) {
                    // File doesn't exist, continue
                }
            }
        }
        
        console.log('Found Bible files:', bibleFiles);
        
        // Parse Bible files and create available Bibles list
        this.availableBibles = [];
        
        for (const file of bibleFiles) {
            const bibleInfo = this.parseBibleFilename(file);
            if (bibleInfo) {
                // Verify the file is actually accessible
                try {
                    const response = await fetch(bibleInfo.filename, { method: 'HEAD' });
                    if (response.ok) {
                        this.availableBibles.push(bibleInfo);
                        console.log(`✓ Added: ${bibleInfo.name}`);
                    }
                } catch (e) {
                    console.warn(`✗ Could not access: ${bibleInfo.filename}`);
                }
            }
        }
        
        console.log('Available Bibles:', this.availableBibles);
        
        if (this.availableBibles.length === 0) {
            this.showError('No Bible files found. Please check that Bible JSON files are available.');
            return;
        }
        
        this.populateLanguageFilter();
        this.populateBibleSelect();
    }

    populateLanguageFilter() {
        if (!this.elements.languageSelect) return;
        
        const languages = [...new Set(this.availableBibles.map(bible => bible.language))];
        
        console.log('Languages found:', languages);
        
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
        if (!this.elements.languageSelect || !this.elements.bibleSelect) return;
        
        const selectedLanguage = this.elements.languageSelect.value;
        const filteredBibles = selectedLanguage 
            ? this.availableBibles.filter(bible => bible.language === selectedLanguage)
            : this.availableBibles;

        console.log('Filtered Bibles:', filteredBibles);

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
            console.log('Loading Bible:', filename);
            
            let bibleData = await this.getBibleFromCache(filename);
            
            if (!bibleData) {
                console.log('Fetching from network:', filename);
                const response = await fetch(filename);
                if (!response.ok) {
                    throw new Error(`Failed to load ${filename} (${response.status})`);
                }
                bibleData = await response.json();
                console.log('Bible data loaded:', bibleData);
                await this.cacheBible(filename, bibleData);
            } else {
                console.log('Bible data loaded from cache');
            }
            
            this.bibleData = bibleData;
            this.populateBookSelect();
            this.showControls();
            this.hideLoading();
            
            // Auto-select Genesis and display all verses
            this.autoSelectDefaults();
            
        } catch (error) {
            console.error('Error loading Bible:', error);
            this.showError(`Failed to load Bible: ${error.message}`);
        }
    }

    findBookByAbbrev(abbreviation) {
        if (!this.bibleData || !Array.isArray(this.bibleData)) return null;
        return this.bibleData.find(book => book.abbrev === abbreviation);
    }

    populateBookSelect() {
        if (!this.bibleData || !Array.isArray(this.bibleData) || !this.elements.bookSelect) return;

        console.log('Populating book select with:', this.bibleData.length, 'books');

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

        if (!this.elements.chapterSelect) return; // Failed to create

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
        if (!this.elements.verseControls) {
            console.error('Cannot create chapter select: verseControls element not found');
            return;
        }

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
        
        // Insert before verse controls
        this.elements.verseControls.parentNode.insertBefore(
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
        if (!this.elements.bookSelect || !this.elements.chapterSelect) return;
        
        const bookAbbreviation = this.elements.bookSelect.value;
        const chapterNumber = parseInt(this.elements.chapterSelect.value);
        
        if (!bookAbbreviation || !chapterNumber) return;
        
        const book = this.findBookByAbbrev(bookAbbreviation);
        if (!book || !book.chapters || !book.chapters[chapterNumber - 1]) return;

        const totalVerses = book.chapters[chapterNumber - 1].length;
        
        if (this.elements.startVerse && this.elements.endVerse) {
            this.elements.startVerse.max = totalVerses;
            this.elements.endVerse.max = totalVerses;
            this.elements.startVerse.placeholder = `Start verse (1-${totalVerses})`;
            this.elements.endVerse.placeholder = `End verse (1-${totalVerses})`;
        }
    }

    autoSelectDefaults() {
        // Select Genesis (first book)
        if (this.bibleData && this.bibleData.length > 0 && this.elements.bookSelect) {
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
        if (this.elements.controls) {
            this.elements.controls.classList.remove('hidden');
        }
    }

    hideControls() {
        if (this.elements.controls) {
            this.elements.controls.classList.add('hidden');
        }
        this.hideChapterSelect();
        this.hideVerseControls();
    }

    showVerseControls() {
        if (this.elements.verseControls) {
            this.elements.verseControls.classList.remove('hidden');
        }
    }

    hideVerseControls() {
        if (this.elements.verseControls) {
            this.elements.verseControls.classList.add('hidden');
        }
    }

    showWelcome() {
        if (this.elements.welcome) this.elements.welcome.classList.remove('hidden');
        if (this.elements.reading) this.elements.reading.classList.add('hidden');
        if (this.elements.loading) this.elements.loading.classList.add('hidden');
        if (this.elements.error) this.elements.error.classList.add('hidden');
    }

    showLoading() {
        if (this.elements.welcome) this.elements.welcome.classList.add('hidden');
        if (this.elements.reading) this.elements.reading.classList.add('hidden');
        if (this.elements.loading) this.elements.loading.classList.remove('hidden');
        if (this.elements.error) this.elements.error.classList.add('hidden');
    }

    hideLoading() {
        if (this.elements.loading) {
            this.elements.loading.classList.add('hidden');
        }
    }

    showReading() {
        if (this.elements.welcome) this.elements.welcome.classList.add('hidden');
        if (this.elements.reading) this.elements.reading.classList.remove('hidden');
        if (this.elements.loading) this.elements.loading.classList.add('hidden');
        if (this.elements.error) this.elements.error.classList.add('hidden');
    }

    showError(message) {
        if (this.elements.welcome) this.elements.welcome.classList.add('hidden');
        if (this.elements.reading) this.elements.reading.classList.add('hidden');
        if (this.elements.loading) this.elements.loading.classList.add('hidden');
        if (this.elements.error) this.elements.error.classList.remove('hidden');
        if (this.elements.errorMessage) this.elements.errorMessage.textContent = message;
    }

    displayVerses() {
        if (!this.elements.bookSelect || !this.elements.chapterSelect) {
            this.showError('Required form elements not available.');
            return;
        }

        const bookAbbreviation = this.elements.bookSelect.value;
        const chapterNumber = parseInt(this.elements.chapterSelect.value);
        
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

        const startVerse = parseInt(this.elements.startVerse?.value) || 1;
        let endVerse = parseInt(this.elements.endVerse?.value);
        
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
        if (!this.elements.chapterTitle || !this.elements.verses) return;

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
        
        if (this.elements.reading && !this.elements.reading.classList.contains('hidden') && this.elements.verses) {
            this.elements.verses.className = `font-${this.currentFontSize}`;
        }
        
        localStorage.setItem('bibleFontSize', this.currentFontSize);
        
        const sizeLabels = { small: 'Aa', medium: 'Aa', large: 'AA', xlarge: 'AA' };
        if (this.elements.fontBtn) {
            this.elements.fontBtn.textContent = sizeLabels[this.currentFontSize];
        }
    }

    loadFontPreference() {
        const saved = localStorage.getItem('bibleFontSize');
        if (saved && this.fontSizes.includes(saved)) {
            this.currentFontSize = saved;
        }
        
        const sizeLabels = { small: 'Aa', medium: 'Aa', large: 'AA', xlarge: 'AA' };
        if (this.elements.fontBtn) {
            this.elements.fontBtn.textContent = sizeLabels[this.currentFontSize];
        }
    }
}

// Initialize app when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new BibleApp());
} else {
    new BibleApp();
}
