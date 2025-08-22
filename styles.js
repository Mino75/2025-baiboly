// Inject CSS styles
const styles = `
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #1f2937;
    background: #f9fafb;
    min-height: 100vh;
}

#app {
    max-width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

header {
    background: #2563eb;
    color: white;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

header h1 {
    font-size: 1.25rem;
    font-weight: 600;
}

#fontBtn {
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.3);
    color: white;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s;
}

#fontBtn:hover {
    background: rgba(255,255,255,0.3);
}

main {
    flex: 1;
    padding: 1rem;
}

#bibleSelection {
    margin-bottom: 1.5rem;
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

#languageFilter {
    margin-bottom: 1rem;
}

#languageFilter label,
#bibleList label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #374151;
}

#languageSelect,
#bibleSelect {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 1rem;
    background: white;
}

#controls {
    margin-bottom: 1.5rem;
}

#bookSelect {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 1rem;
    background: white;
    margin-bottom: 1rem;
}

#verseControls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
}

#startVerse, #endVerse {
    flex: 1;
    min-width: 120px;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 1rem;
}

#readBtn {
    background: #2563eb;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 0.375rem;
    font-size: 1rem;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.2s;
}

#readBtn:hover {
    background: #1d4ed8;
}

#content {
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    overflow: hidden;
}

#welcome {
    padding: 3rem 1.5rem;
    text-align: center;
    color: #6b7280;
}

#reading {
    padding: 1.5rem;
}

#chapterTitle {
    margin-bottom: 1.5rem;
    color: #1f2937;
    font-size: 1.5rem;
    font-weight: 600;
    text-align: center;
}

#verses {
    font-size: var(--font-size, 1rem);
    line-height: 1.8;
    max-width: 100%;
}

.verse {
    margin-bottom: 0.75rem;
    text-align: justify;
}

.verse-number {
    display: inline-block;
    background: #f3f4f6;
    color: #6b7280;
    font-size: 0.75em;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    margin-right: 0.5rem;
    vertical-align: top;
    line-height: 1.2;
    min-width: 1.5rem;
    text-align: center;
}

.verse-text {
    display: inline;
}

#loading {
    padding: 3rem 1.5rem;
    text-align: center;
    color: #6b7280;
}

#loading::after {
    content: '';
    display: inline-block;
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid #e5e7eb;
    border-top: 2px solid #2563eb;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-left: 0.5rem;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

#error {
    padding: 1.5rem;
    text-align: center;
}

#errorMessage {
    color: #dc2626;
    background: #fef2f2;
    border: 1px solid #fecaca;
    padding: 1rem;
    border-radius: 0.375rem;
}

.hidden {
    display: none !important;
}
    main {
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
    }
    
    #verseControls {
        flex-wrap: nowrap;
    }
    
    #startVerse, #endVerse {
        min-width: 150px;
    }
}

@media (min-width: 768px) {
    #verses {
        font-size: var(--font-size, 1.125rem);
    }
    
    header h1 {
        font-size: 1.5rem;
    }
}

/* Font size variations */
.font-small { --font-size: 0.875rem; }
.font-medium { --font-size: 1rem; }
.font-large { --font-size: 1.25rem; }
.font-xlarge { --font-size: 1.5rem; }

@media (min-width: 768px) {
    .font-small { --font-size: 1rem; }
    .font-medium { --font-size: 1.125rem; }
    .font-large { --font-size: 1.375rem; }
    .font-xlarge { --font-size: 1.625rem; }
}

/* PWA specific styles */
@media (display-mode: standalone) {
    body {
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
    }
    
    #verses {
        user-select: text;
        -webkit-user-select: text;
    }
}
`;

// Create and inject style element
const styleElement = document.createElement('style');
styleElement.textContent = styles;
document.head.appendChild(styleElement);
