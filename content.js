console.log('Content script loaded:', chrome.runtime.getURL('content.js'));

let inMemoryShortcuts = [];

function expandShortcut(text, cursorPosition) {
    if (!text || typeof cursorPosition !== 'number') {
        return null;
    }

    try {
        const beforeCursor = text.slice(0, cursorPosition);
        const afterCursor = text.slice(cursorPosition);
        const words = beforeCursor.split(/\s/);
        const lastWord = words[words.length - 1];
        
        if (lastWord && lastWord.startsWith(':')) {
            const shortcutText = lastWord.slice(1);
            const matchedShortcut = inMemoryShortcuts.find(s => s.shortcut === shortcutText);
            if (matchedShortcut) {
                return {
                    expansion: matchedShortcut.expansion,
                    text: beforeCursor,
                    afterCursor: afterCursor,
                    lastWord: lastWord
                };
            }
        }
    } catch (error) {
        console.error('Error in expandShortcut:', error);
    }
    return null;
}

function applyExpansion(input, expansion) {
    if (!input || !expansion) {
        return null;
    }

    try {
        const { text, afterCursor, lastWord } = input;
        const newBeforeCursor = text.slice(0, -lastWord.length) + expansion;
        return {
            text: newBeforeCursor + afterCursor,
            cursorPosition: newBeforeCursor.length
        };
    } catch (error) {
        console.error('Error in applyExpansion:', error);
        return null;
    }
}

function handleInput(e) {
    // Only process if it's a text input or textarea
    if (!e.target || !e.target.value || (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement))) {
        return;
    }

    try {
        const expansionResult = expandShortcut(e.target.value, e.target.selectionStart);
        if (expansionResult) {
            const result = applyExpansion(expansionResult, expansionResult.expansion);
            if (result) {
                e.target.value = result.text;
                e.target.selectionStart = e.target.selectionEnd = result.cursorPosition;
            }
        }
    } catch (error) {
        console.error('Error in handleInput:', error);
    }
}

document.addEventListener('input', handleInput);

function loadShortcuts() {
    chrome.storage.local.get(['cachedShortcuts', 'user_id'], (data) => {
        if (data.cachedShortcuts) {
            inMemoryShortcuts = data.cachedShortcuts;
            console.log('Loaded cached shortcuts:', inMemoryShortcuts);
        } else {
            chrome.runtime.sendMessage({ action: 'getShortcuts', userId: data.user_id || 1 }, response => {
                if (response && response.success) {
                    inMemoryShortcuts = response.data;
                    console.log('Loaded shortcuts from server:', inMemoryShortcuts);
                } else {
                    console.error('Failed to load shortcuts:', response);
                }
            });
        }
    });
}

// Load shortcuts when the script starts
loadShortcuts();

// Reload shortcuts periodically (every 5 minutes)
setInterval(loadShortcuts, 5 * 60 * 1000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request && request.action === 'shortcutsUpdated') {
        console.log('Shortcuts updated:', request.shortcuts);
        inMemoryShortcuts = request.shortcuts || [];
    }
});

window.onerror = function (message, source, lineno, colno, error) {
    console.error('Error in content script:', message, 'at', source, lineno, colno, error);
};