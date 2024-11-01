console.log('Options script loaded:', chrome.runtime.getURL('options.js'));

document.addEventListener('DOMContentLoaded', () => {
    console.log('Options page loaded');

    const loginButton = document.getElementById('loginButton');
    const addButton = document.getElementById('add');
    const updateButton = document.getElementById('update');
    const cancelButton = document.getElementById('cancel');
    const logoutButton = document.getElementById('logoutButton');

    loginButton.addEventListener('click', login);
    addButton.addEventListener('click', addShortcut);
    updateButton.addEventListener('click', updateShortcut);
    cancelButton.addEventListener('click', cancelEdit);
    logoutButton.addEventListener('click', logout);

    let editingShortcutId = null;

    function checkLoginStatus() {
        console.log('Checking login status');
        chrome.storage.local.get('token', ({ token }) => {
            if (token) {
                console.log('User is logged in');
                document.getElementById('loginForm').style.display = 'none';
                document.getElementById('shortcutForm').style.display = 'block';
                displayShortcuts();
            } else {
                console.log('User is not logged in');
                document.getElementById('loginForm').style.display = 'block';
                document.getElementById('shortcutForm').style.display = 'none';
            }
        });
    }

    function login() {
        console.log('Login function called');
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        console.log('Username:', username, 'Password:', password);
        try {
            console.log('Sending login message to background script');
            chrome.runtime.sendMessage({
                action: 'login',
                credentials: { username, password }
            }, response => {
                console.log('Response received from background script:', response);
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    alert('Error: ' + chrome.runtime.lastError.message);
                    return;
                }
                if (response && response.success) {
                    console.log('Login successful');
                    checkLoginStatus();
                } else {
                    console.error('Login failed:', response ? response.error : 'No response');
                    alert('Login failed. Please try again.');
                }
            });
        } catch (error) {
            console.error('Error in login function:', error);
            alert('An error occurred during login. Please check the console for details.');
        }
    }

    function logout() {
        console.log('Logout function called');
        chrome.storage.local.remove('token', () => {
            console.log('Token removed from storage');
            checkLoginStatus();
        });
    }

    function addShortcut() {
        console.log('Add shortcut function called');
        const shortcut = document.getElementById('shortcut').value.trim().replace(/^:/, '');
        const expansion = document.getElementById('expansion').value.trim();
        console.log('Shortcut to add:', { shortcut, expansion });
        if (shortcut && expansion) {
            chrome.storage.local.get('user_id', (data) => {
                const user_id = data.user_id || 1;
                console.log('Sending addShortcut message to background script');
                chrome.runtime.sendMessage({
                    action: 'addShortcut',
                    shortcutData: { user_id, shortcut, expansion }
                }, response => {
                    console.log('Received response from background script:', response);
                    if (response.success) {
                        console.log('Shortcut saved:', response.data);
                        displayShortcuts();
                        clearForm();
                    } else {
                        console.error('Error:', response.error);
                        alert('Failed to add shortcut. Please try again.');
                    }
                });
            });
        }
    }

    function updateShortcut() {
        console.log('Update shortcut function called');
        const shortcut = document.getElementById('shortcut').value.trim().replace(/^:/, '');
        const expansion = document.getElementById('expansion').value.trim();
        console.log('Shortcut to update:', { id: editingShortcutId, shortcut, expansion });
        if (shortcut && expansion && editingShortcutId) {
            chrome.storage.local.get('user_id', (data) => {
                const user_id = data.user_id || 1;
                console.log('Sending updateShortcut message to background script');
                chrome.runtime.sendMessage({
                    action: 'updateShortcut',
                    shortcutData: { id: editingShortcutId, user_id, shortcut, expansion }
                }, response => {
                    console.log('Received response from background script:', response);
                    if (response.success) {
                        console.log('Shortcut updated:', response.data);
                        displayShortcuts();
                        clearForm();
                    } else {
                        console.error('Error:', response.error);
                        alert('Failed to update shortcut. Please try again.');
                    }
                });
            });
        }
    }

    function editShortcut(id, shortcut, expansion) {
        console.log('Edit shortcut function called', { id, shortcut, expansion });
        editingShortcutId = id;
        document.getElementById('shortcut').value = shortcut;
        document.getElementById('expansion').value = expansion;
        document.getElementById('add').style.display = 'none';
        document.getElementById('update').style.display = 'inline';
        document.getElementById('cancel').style.display = 'inline';
    }

    function cancelEdit() {
        console.log('Cancel edit function called');
        clearForm();
    }

    function clearForm() {
        console.log('Clear form function called');
        editingShortcutId = null;
        document.getElementById('shortcut').value = '';
        document.getElementById('expansion').value = '';
        document.getElementById('add').style.display = 'inline';
        document.getElementById('update').style.display = 'none';
        document.getElementById('cancel').style.display = 'none';
    }

    function deleteShortcut(id) {
        console.log('Delete shortcut function called', { id });
        if (confirm('Are you sure you want to delete this shortcut?')) {
            console.log('Sending deleteShortcut message to background script');
            chrome.runtime.sendMessage({
                action: 'deleteShortcut',
                shortcutId: id
            }, response => {
                console.log('Received response from background script:', response);
                if (response.success) {
                    console.log('Shortcut deleted:', id);
                    displayShortcuts();
                } else {
                    console.error('Error:', response.error);
                    alert('Failed to delete shortcut. Please try again.');
                }
            });
        }
    }

    function displayShortcuts() {
        console.log('Display shortcuts function called');
        chrome.storage.local.get('user_id', (data) => {
            const user_id = data.user_id || 1;
            console.log('Sending getShortcuts message to background script');
            chrome.runtime.sendMessage({ action: 'getShortcuts', userId: user_id }, response => {
                console.log('Received response from background script:', response);
                if (response.success) {
                    const shortcuts = response.data;
                    console.log('Shortcuts received:', shortcuts);
                    const container = document.getElementById('shortcuts');
                    container.innerHTML = '<h2>Your Shortcuts:</h2>';
                    shortcuts.forEach(({ id, shortcut, expansion }) => {
                        const div = document.createElement('div');
                        div.className = 'shortcut-item';
                        div.innerHTML = `
                            <span>:${shortcut}: ${expansion}</span>
                            <button class="edit-button" data-id="${id}" data-shortcut="${shortcut}" data-expansion="${expansion}">Edit</button>
                            <button class="delete-button" data-id="${id}">Delete</button>
                        `;
                        container.appendChild(div);
                    });
                    
                    // Add event listeners to edit and delete buttons
                    container.querySelectorAll('.edit-button').forEach(button => {
                        button.addEventListener('click', function() {
                            const { id, shortcut, expansion } = this.dataset;
                            editShortcut(id, shortcut, expansion);
                        });
                    });
                    
                    container.querySelectorAll('.delete-button').forEach(button => {
                        button.addEventListener('click', function() {
                            const { id } = this.dataset;
                            deleteShortcut(id);
                        });
                    });
                } else {
                    console.error('Error:', response.error);
                    alert('Failed to load shortcuts. Please try again.');
                }
            });
        });
    }

    // Call this function when the options page loads
    checkLoginStatus();
});

window.onerror = function (message, source, lineno, colno, error) {
    console.error('Error in options page:', message, 'at', source, lineno, colno, error);
};