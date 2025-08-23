// Bible PWA Main JavaScript - Hierarchical Auto-reload Design

class BibleApp {
    constructor() {
        this.bibleData = null;
        this.availableBibles = [];
        this.currentFontSize = 'medium';
        this.fontSizes = ['small', 'medium', 'large', 'xlarge'];
        this.dbName = 'BibleReader';
        this.dbVersion = 1;
        this.db = null;
        
        // Current selection state
        this.currentSelection = {
            bible: null,
            book: null,
            chapter: null,
            startVerse: null,
            endVerse: null
        };
        
        this.elements = {};
        this.init();
    }

    initElements() {
        const elementIds = [
            'languageSelect', 'bibleSelect', 'controls', 'bookSelect',
            'verseControls', 'startVerse', 'endVerse', 'fontBtn',
            'welcome', 'reading', 'loading', 'error', 'chapterTitle',
            'verses', 'errorMessage', 'prevChapterBtn', 'nextChapterBtn'
        ];

        elementIds.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });

        const criticalElements = ['languageSelect', 'bibleSelect', 'bookSelect'];
        const missingElements = criticalElements.filter(id => !this.elements[id]);
        
        if (missingElements.length > 0) {
            console.error('Critical DOM elements missing:', missingElements);
            this.showError(`App initialization failed: Missing required elements: ${missingElements.join(', ')}`);
            return false;
        }

        return true;
    }

    async init() {
        if (!this.initElements()) return;

        this.setupEventListeners();
        this.loadFontPreference();
        await this.initIndexedDB();
        await this.discoverBibles();
    }

    setupEventListeners() {
        // Bible selection - triggers full reload
        if (this.elements.bibleSelect) {
            this.elements.bibleSelect.addEventListener('change', (e) => {
                this.handleSelectionChange('bible', e.target.value);
            });
        }

        // Language filter
        if (this.elements.languageSelect) {
            this.elements.languageSelect.addEventListener('change', () => {
                this.filterBiblesByLanguage();
            });
        }

        // Book selection - triggers book reload
        if (this.elements.bookSelect) {
            this.elements.bookSelect.addEventListener('change', (e) => {
                this.handleSelectionChange('book', e.target.value);
            });
        }

        // Chapter selection - triggers chapter reload
        if (this.elements.chapterSelect) {
            this.elements.chapterSelect.addEventListener('change', (e) => {
                this.handleSelectionChange('chapter', parseInt(e.target.value));
            });
        }

        // Verse selection - triggers verse reload
        if (this.elements.startVerse) {
            this.elements.startVerse.addEventListener('change', (e) => {
                this.handleSelectionChange('startVerse', parseInt(e.target.value) || null);
            });
        }

        if (this.elements.endVerse) {
            this.elements.endVerse.addEventListener('change', (e) => {
                this.handleSelectionChange('endVerse', parseInt(e.target.value) || null);
            });
        }

        // Navigation buttons
        if (this.elements.prevChapterBtn) {
            this.elements.prevChapterBtn.addEventListener('click', () => {
                this.navigateChapter(-1);
            });
        }

        if (this.elements.nextChapterBtn) {
            this.elements.nextChapterBtn.addEventListener('click', () => {
                this.navigateChapter(1);
            });
        }

        // Font button
        if (this.elements.fontBtn) {
            this.elements.fontBtn.addEventListener('click', () => {
                this.cycleFontSize();
            });
        }

        // Enter key support for verse inputs
        [this.elements.startVerse, this.elements.endVerse].forEach(input => {
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        input.blur(); // Trigger change event
                    }
                });
            }
        });
    }

    // Hierarchical selection handler with automatic reloading
    async handleSelectionChange(level, value) {
        console.log(`Selection change: ${level} = ${value}`);

        // Update current selection and reset lower levels
        switch (level) {
            case 'bible':
                this.currentSelection.bible = value;
                this.currentSelection.book = null;
                this.currentSelection.chapter = null;
                this.currentSelection.startVerse = null;
                this.currentSelection.endVerse = null;
                
                if (value) {
                    await this.loadSelectedBible(value);
                    // Auto-select first book
                    if (this.bibleData && this.bibleData.length > 0) {
                        const firstBook = this.bibleData[0].abbrev;
                        this.elements.bookSelect.value = firstBook;
                        await this.handleSelectionChange('book', firstBook);
                    }
                } else {
                    this.resetToWelcome();
                }
                break;

            case 'book':
                this.currentSelection.book = value;
                this.currentSelection.chapter = null;
                this.currentSelection.startVerse = null;
                this.currentSelection.endVerse = null;
                
                if (value) {
                    this.populateChapterSelect(value);
                    this.showControls();
                    // Auto-select first chapter
                    if (this.elements.chapterSelect) {
                        this.elements.chapterSelect.value = '1';
                        await this.handleSelectionChange('chapter', 1);
                    }
                } else {
                    this.hideChapterControls();
                }
                break;

            case 'chapter':
                this.currentSelection.chapter = value;
                this.currentSelection.startVerse = null;
                this.currentSelection.endVerse = null;
                
                if (value) {
                    this.updateVerseInputLimits();
                    this.showVerseControls();
                    // Auto-load all verses of the chapter
                    this.clearVerseInputs();
                    this.displayCurrentSelection();
                } else {
                    this.hideVerseControls();
                }
                break;

            case 'startVerse':
            case 'endVerse':
                this.currentSelection[level] = value;
                // Auto-reload with new verse selection
                this.displayCurrentSelection();
                break;

            default:
                console.warn(`Unknown selection level: ${level}`);
        }
    }

    navigateChapter(direction) {
        if (!this.currentSelection.book || !this.currentSelection.chapter) return;

        const book = this.findBookByAbbrev(this.currentSelection.book);
        if (!book) return;

        const newChapter = this.currentSelection.chapter + direction;
        
        if (newChapter >= 1 && newChapter <= book.chapters.length) {
            // Navigate within the same book
            this.elements.chapterSelect.value = newChapter.toString();
            this.handleSelectionChange('chapter', newChapter);
        } else if (direction === 1 && newChapter > book.chapters.length) {
            // Next book
            this.navigateToNextBook();
        } else if (direction === -1 && newChapter < 1) {
            // Previous book
            this.navigateToPreviousBook();
        }
    }

    navigateToNextBook() {
        if (!this.bibleData) return;
        
        const currentBookIndex = this.bibleData.findIndex(book => book.abbrev === this.currentSelection.book);
        if (currentBookIndex < this.bibleData.length - 1) {
            const nextBook = this.bibleData[currentBookIndex + 1];
            this.elements.bookSelect.value = nextBook.abbrev;
            this.handleSelectionChange('book', nextBook.abbrev);
        }
    }

    navigateToPreviousBook() {
        if (!this.bibleData) return;
        
        const currentBookIndex = this.bibleData.findIndex(book => book.abbrev === this.currentSelection.book);
        if (currentBookIndex > 0) {
            const prevBook = this.bibleData[currentBookIndex - 1];
            this.elements.bookSelect.value = prevBook.abbrev;
            this.handleSelectionChange('book', prevBook.abbrev);
            
            // Go to last chapter of previous book
            setTimeout(() => {
                if (this.elements.chapterSelect) {
                    const lastChapter = prevBook.chapters.length;
                    this.elements.chapterSelect.value = lastChapter.toString();
                    this.handleSelectionChange('chapter', lastChapter);
                }
            }, 100);
        }
    }

    displayCurrentSelection() {
        const { book, chapter, startVerse, endVerse } = this.currentSelection;
        
        if (!book || !chapter) {
            this.showWelcome();
            return;
        }

        const bookData = this.findBookByAbbrev(book);
        if (!bookData || !bookData.chapters || !bookData.chapters[chapter - 1]) {
            this.showError('Chapter data not found.');
            return;
        }

        const start = startVerse || 1;
        const end = endVerse || bookData.chapters[chapter - 1].length;
        
        const chapterVerses = bookData.chapters[chapter - 1];
        const verses = this.getVerseRange(chapterVerses, start, end);
        
        if (verses.length === 0) {
            this.showError('No verses found for the specified range.');
            return;
        }

        this.renderVerses(bookData.name, chapter, verses, start, end);
        this.showReading();
        this.updateNavigationButtons();
    }

    updateNavigationButtons() {
        if (!this.elements.prevChapterBtn || !this.elements.nextChapterBtn) return;
        if (!this.bibleData || !this.currentSelection.book || !this.currentSelection.chapter) return;

        const currentBookIndex = this.bibleData.findIndex(book => book.abbrev === this.currentSelection.book);
        const currentBook = this.bibleData[currentBookIndex];
        const currentChapter = this.currentSelection.chapter;

        // Enable/disable previous button
        const hasPrevious = (currentChapter > 1) || (currentBookIndex > 0);
        this.elements.prevChapterBtn.disabled = !hasPrevious;

        // Enable/disable next button
        const hasNext = (currentChapter < currentBook.chapters.length) || (currentBookIndex < this.bibleData.length - 1);
        this.elements.nextChapterBtn.disabled = !hasNext;
    }

    clearVerseInputs() {
        if (this.elements.startVerse) this.elements.startVerse.value = '';
        if (this.elements.endVerse) this.elements.endVerse.value = '';
    }

    resetToWelcome() {
        this.hideControls();
        this.showWelcome();
        this.currentSelection = {
            bible: null,
            book: null, 
            chapter: null,
            startVerse: null,
            endVerse: null
        };
    }

    // All the IndexedDB and discovery methods remain the same
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
                data,
                cached_at: Date.now()
            });
        } catch (error) {
            console.warn('Failed to cache Bible data:', error);
        }
    }

    async getBibleFilesFromServiceWorker() {
        try {
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                if (registration.active) {
                    const messageChannel = new MessageChannel();
                    
                    return new Promise((resolve) => {
                        messageChannel.port1.onmessage = (event) => {
                            const cacheInfo = event.data;
                            const bibleFiles = cacheInfo.cachedUrls.filter(url => {
                                const filename = url.split('/').pop();
                                return filename.includes('_') && filename.endsWith('.json');
                            });
                            resolve(bibleFiles);
                        };
                        
                        registration.active.postMessage({
                            type: 'CACHE_INFO'
                        }, [messageChannel.port2]);
                        
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
        
        let bibleFiles = await this.getBibleFilesFromServiceWorker();
        
        if (bibleFiles.length === 0) {
            const commonFiles = ['/es_rvr.json', '/ru_synodal.json', '/en_kjv.json', '/zh_cuv.json'];
            
            for (const file of commonFiles) {
                try {
                    const response = await fetch(file, { method: 'HEAD' });
                    if (response.ok) bibleFiles.push(file);
                } catch (e) {}
            }
        }
        
        this.availableBibles = [];
        
        for (const file of bibleFiles) {
            const bibleInfo = this.parseBibleFilename(file);
            if (bibleInfo) {
                try {
                    const response = await fetch(bibleInfo.filename, { method: 'HEAD' });
                    if (response.ok) {
                        this.availableBibles.push(bibleInfo);
                    }
                } catch (e) {}
            }
        }
        
        if (this.availableBibles.length === 0) {
            this.showError('No Bible files found.');
            return;
        }
        
        this.populateLanguageFilter();
        this.populateBibleSelect();
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
            this.hideLoading();
            
        } catch (error) {
            console.error('Error loading Bible:', error);
            this.showError(`Failed to load Bible: ${error.message}`);
        }
    }

    populateLanguageFilter() {
        if (!this.elements.languageSelect) return;
        
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
        if (!this.elements.languageSelect || !this.elements.bibleSelect) return;
        
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
        this.resetToWelcome();
    }

    findBookByAbbrev(abbreviation) {
        if (!this.bibleData || !Array.isArray(this.bibleData)) return null;
        return this.bibleData.find(book => book.abbrev === abbreviation);
    }

    populateBookSelect() {
        if (!this.bibleData || !Array.isArray(this.bibleData) || !this.elements.bookSelect) return;

        this.elements.bookSelect.innerHTML = '<option value="">Select a book...</option>';
        
        this.bibleData.forEach(book => {
            const option = document.createElement('option');
            option.value = book.abbrev;
            option.textContent = book.name;
            this.elements.bookSelect.appendChild(option);
        });
    }

    populateChapterSelect(bookAbbreviation) {
        const book = this.findBookByAbbrev(bookAbbreviation);
        if (!book || !book.chapters) return;

        if (!this.elements.chapterSelect) {
            this.createChapterSelect();
        }

        if (!this.elements.chapterSelect) return;

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
        if (!this.elements.verseControls) return;

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
        
        this.elements.verseControls.parentNode.insertBefore(
            this.elements.chapterSelect, 
            this.elements.verseControls
        );
        
        this.elements.chapterSelect.addEventListener('change', (e) => {
            this.handleSelectionChange('chapter', parseInt(e.target.value) || null);
        });
    }

    updateVerseInputLimits() {
        const book = this.findBookByAbbrev(this.currentSelection.book);
        if (!book || !book.chapters || !book.chapters[this.currentSelection.chapter - 1]) return;

        const totalVerses = book.chapters[this.currentSelection.chapter - 1].length;
        
        if (this.elements.startVerse && this.elements.endVerse) {
            this.elements.startVerse.max = totalVerses;
            this.elements.endVerse.max = totalVerses;
            this.elements.startVerse.placeholder = `Start verse (1-${totalVerses})`;
            this.elements.endVerse.placeholder = `End verse (1-${totalVerses})`;
        }
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

        let title = `${bookName} ${chapterNumber}`;
        
        if (startVerse === endVerse) {
            title += `:${startVerse}`;
        } else if (startVerse !== 1 || endVerse !== verses.length + startVerse - 1) {
            title += `:${startVerse}-${endVerse}`;
        }
        
        this.elements.chapterTitle.textContent = title;

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

    // UI state management
    showControls() {
        if (this.elements.controls) this.elements.controls.classList.remove('hidden');
    }

    hideControls() {
        if (this.elements.controls) this.elements.controls.classList.add('hidden');
        this.hideChapterControls();
    }

    showChapterSelect() {
        if (this.elements.chapterSelect) this.elements.chapterSelect.classList.remove('hidden');
    }

    hideChapterSelect() {
        if (this.elements.chapterSelect) this.elements.chapterSelect.classList.add('hidden');
    }

    hideChapterControls() {
        this.hideChapterSelect();
        this.hideVerseControls();
    }

    showVerseControls() {
        if (this.elements.verseControls) this.elements.verseControls.classList.remove('hidden');
    }

    hideVerseControls() {
        if (this.elements.verseControls) this.elements.verseControls.classList.add('hidden');
    }

    showWelcome() {
        const states = { welcome: false, reading: true, loading: true, error: true };
        this.setViewState(states);
    }

    showLoading() {
        const states = { welcome: true, reading: true, loading: false, error: true };
        this.setViewState(states);
    }

    hideLoading() {
        if (this.elements.loading) this.elements.loading.classList.add('hidden');
    }

    showReading() {
        const states = { welcome: true, reading: false, loading: true, error: true };
        this.setViewState(states);
    }

    showError(message) {
        const states = { welcome: true, reading: true, loading: true, error: false };
        this.setViewState(states);
        if (this.elements.errorMessage) this.elements.errorMessage.textContent = message;
    }

    setViewState(hiddenStates) {
        Object.entries(hiddenStates).forEach(([state, hidden]) => {
            if (this.elements[state]) {
                this.elements[state].classList.toggle('hidden', hidden);
            }
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

// Initialize app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new BibleApp());
} else {
    new BibleApp();
}
