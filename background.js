console.log('Background script loaded');

self.oninstall = (event) => {
    console.log('Extension installed');
};

self.onactivate = (event) => {
    console.log('Extension activated');
};

function prefetchShortcuts() {
    console.log('Attempting to prefetch shortcuts...');
    chrome.storage.local.get(['token', 'user_id'], ({ token, user_id }) => {
        console.log('Storage data for prefetch:', { token: !!token, user_id });
        if (token && user_id) {
            const url = `https://shortcuts.advokati-bg.com:3222/getShortcuts/${user_id}`;
            console.log('Prefetch URL:', url);
            
            fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(response => {
                console.log('Prefetch response status:', response.status);
                return response.json();
            })
            .then(data => {
                console.log('Prefetch data received:', data);
                chrome.storage.local.set({ cachedShortcuts: data });
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, { 
                            action: 'shortcutsUpdated', 
                            shortcuts: data 
                        }).catch(() => {});
                    });
                });
            })
            .catch(error => console.error('Prefetch error details:', error));
        } else {
            console.log('Prefetch skipped - missing token or user_id');
        }
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in background with action:', request?.action);
    console.log('Full message details:', request);

    if (request.action === 'login') {
        console.log('Processing login request...');
        console.log('Login credentials:', {
            username: request.credentials.username,
            passwordLength: request.credentials.password?.length
        });

        // First, try to check server availability
        console.log('Testing server connection...');
        fetch('https://shortcuts.advokati-bg.com:3222/', {
            method: 'GET',
            mode: 'no-cors'  // Try with no-cors first
        })
        .then(() => {
            console.log('Server is reachable, proceeding with login');
            return fetch('https://shortcuts.advokati-bg.com:3222/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(request.credentials)
            });
        })
        .then(response => {
            console.log('Login response received:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Login successful:', data);
            if (data.token) {
                chrome.storage.local.set({ 
                    token: data.token,
                    user_id: 1
                }, () => {
                    sendResponse({ success: true, token: data.token });
                    prefetchShortcuts();
                });
            } else {
                sendResponse({ success: false, error: 'No token received' });
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }

    if (request.action === 'getShortcuts') {
        chrome.storage.local.get(['token', 'user_id'], ({ token, user_id }) => {
            if (!token || !user_id) {
                sendResponse({ success: false, error: 'Not authenticated' });
                return;
            }

            fetch(`https://shortcuts.advokati-bg.com:3222/getShortcuts/${user_id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(response => response.json())
            .then(data => {
                chrome.storage.local.set({ cachedShortcuts: data });
                sendResponse({ success: true, data });
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        });
        return true;
    }

    if (request.action === 'addShortcut') {
        chrome.storage.local.get(['token', 'user_id'], ({ token, user_id }) => {
            if (!token || !user_id) {
                sendResponse({ success: false, error: 'Not authenticated' });
                return;
            }

            const shortcutData = {
                ...request.shortcutData,
                user_id: user_id
            };

            fetch('https://shortcuts.advokati-bg.com:3222/addShortcut', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(shortcutData)
            })
            .then(response => response.json())
            .then(data => {
                prefetchShortcuts();
                sendResponse({ success: true, data });
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        });
        return true;
    }

    if (request.action === 'updateShortcut') {
        chrome.storage.local.get(['token', 'user_id'], ({ token, user_id }) => {
            if (!token || !user_id) {
                sendResponse({ success: false, error: 'Not authenticated' });
                return;
            }

            const shortcutData = {
                ...request.shortcutData,
                user_id: user_id
            };

            fetch('https://shortcuts.advokati-bg.com:3222/updateShortcut', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(shortcutData)
            })
            .then(response => response.json())
            .then(data => {
                prefetchShortcuts();
                sendResponse({ success: true, data });
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        });
        return true;
    }

    if (request.action === 'deleteShortcut') {
        chrome.storage.local.get(['token', 'user_id'], ({ token, user_id }) => {
            if (!token || !user_id) {
                sendResponse({ success: false, error: 'Not authenticated' });
                return;
            }

            fetch(`https://shortcuts.advokati-bg.com:3222/deleteShortcut/${request.shortcutId}?user_id=${user_id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(response => response.json())
            .then(data => {
                prefetchShortcuts();
                sendResponse({ success: true, data });
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        });
        return true;
    }
});