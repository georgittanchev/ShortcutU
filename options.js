// State management
let grid = null;
let isLoading = false;

// DOM Elements
const elements = {
  loadingBar: document.getElementById("loadingBar"),
  loginForm: document.getElementById("loginForm"),
  mainContent: document.getElementById("mainContent"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  loginButton: document.getElementById("loginButton"),
  logoutButton: document.getElementById("logoutButton"),
  shortcutInput: document.getElementById("shortcut"),
  expansionInput: document.getElementById("expansion"),
  addButton: document.getElementById("add"),
  shortcutsContainer: document.getElementById("shortcuts"),
  toasts: document.getElementById("toasts"),

  registrationForm: document.getElementById("registrationForm"),
  regUsername: document.getElementById("regUsername"),
  regEmail: document.getElementById("regEmail"),
  regPassword: document.getElementById("regPassword"),
  regConfirmPassword: document.getElementById("regConfirmPassword"),
  registerButton: document.getElementById("registerButton"),
  showLoginLink: document.getElementById("showLoginLink"),
  showRegisterLink: document.getElementById("showRegisterLink"),
};

// Utility Functions
const setLoading = (loading) => {
  isLoading = loading;
  elements.loadingBar.classList.toggle("hidden", !loading);
  if (elements.loginButton) elements.loginButton.disabled = loading;
  if (elements.addButton) elements.addButton.disabled = loading;
};

const showToast = (message, type = "success") => {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type} animate-slide-in`;
  toast.textContent = message;
  elements.toasts.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

const register = async () => {
  const username = elements.regUsername.value.trim();
  const email = elements.regEmail.value.trim();
  const password = elements.regPassword.value;
  const confirmPassword = elements.regConfirmPassword.value;

  // Basic validation
  if (!username || !email || !password || !confirmPassword) {
    showToast("All fields are required", "error");
    return;
  }

  if (password !== confirmPassword) {
    showToast("Passwords do not match", "error");
    return;
  }

  setLoading(true);
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "register",
          userData: { username, email, password },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    if (response && response.success) {
      showToast("Registration successful");
      // Store token and user_id
      chrome.storage.local.set(
        {
          token: response.token,
          user_id: response.user_id,
        },
        () => {
          checkLoginStatus();
        }
      );
    } else {
      throw new Error(response?.error || "Registration failed");
    }
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
};

// Add form switching functions
const showLoginForm = () => {
  elements.registrationForm.classList.add("hidden");
  elements.loginForm.classList.remove("hidden");
};

const showRegistrationForm = () => {
  elements.loginForm.classList.add("hidden");
  elements.registrationForm.classList.remove("hidden");
};

// Modal Functions
const showModal = (
  template,
  { title = "", onConfirm = () => {}, defaultValues = {} } = {}
) => {
  const modalTemplate = document.getElementById(template);
  const modalElement = modalTemplate.content.cloneNode(true);
  const modal = modalElement.querySelector(".modal-backdrop");

  // Set title if provided
  if (title) {
    modal.querySelector(".modal-title").textContent = title;
  }

  // Set default values for edit modal
  if (template === "editModalTemplate" && defaultValues) {
    const shortcutInput = modal.querySelector(".edit-shortcut");
    const expansionInput = modal.querySelector(".edit-expansion");

    if (shortcutInput && defaultValues.shortcut) {
      shortcutInput.value = defaultValues.shortcut;
    }

    if (expansionInput && defaultValues.expansion) {
      expansionInput.value = defaultValues.expansion;
    }

    // Focus and select all text in shortcut field
    setTimeout(() => {
      if (shortcutInput) {
        shortcutInput.focus();
        shortcutInput.select();
      }
    }, 100);
  }

  // Handle cancel
  modal.querySelector(".modal-cancel").addEventListener("click", () => {
    modal.remove();
  });

  // Handle backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Handle escape key
  const handleEscape = (e) => {
    if (e.key === "Escape") {
      modal.remove();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);

  // Handle confirm
  modal.querySelector(".modal-confirm").addEventListener("click", async () => {
    let values = null;
    if (template === "editModalTemplate") {
      values = {
        shortcut: modal.querySelector(".edit-shortcut").value.trim(),
        expansion: modal.querySelector(".edit-expansion").value.trim(),
      };
    }
    await onConfirm(values);
    modal.remove();
  });

  document.body.appendChild(modal);

  // Handle enter key in edit modal
  if (template === "editModalTemplate") {
    const form = modal.querySelector(".modal");
    form.addEventListener("keypress", async (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const values = {
          shortcut: modal.querySelector(".edit-shortcut").value.trim(),
          expansion: modal.querySelector(".edit-expansion").value.trim(),
        };
        await onConfirm(values);
        modal.remove();
      }
    });
  }
};

// API Functions
const checkLoginStatus = () => {
  chrome.storage.local.get(["token", "user_id"], ({ token, user_id }) => {
    if (token && user_id) {
      console.log("User is logged in with ID:", user_id);
      elements.loginForm.classList.add("hidden");
      elements.registrationForm.classList.add("hidden");
      elements.mainContent.classList.remove("hidden");
      loadShortcuts();
    } else {
      console.log("User is not logged in");
      elements.loginForm.classList.remove("hidden");
      elements.mainContent.classList.add("hidden");
      elements.registrationForm.classList.add("hidden");
    }
  });
};

const login = async () => {
  setLoading(true);
  elements.loginButton.disabled = true;
  
  try {
    // Validate input
    const username = elements.username.value.trim();
    const password = elements.password.value;
    
    if (!username || !password) {
      showToast("Please enter both username and password", "error");
      return;
    }

    // Attempt login with timeout
    const loginPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Login request timed out"));
      }, 10000);

      chrome.runtime.sendMessage(
        {
          action: "login",
          credentials: { username, password },
        },
        (response) => {
          clearTimeout(timeoutId);
          
          if (chrome.runtime.lastError) {
            console.error("Chrome runtime error:", chrome.runtime.lastError);
            reject(new Error("Connection error: " + chrome.runtime.lastError.message));
            return;
          }
          
          if (!response) {
            reject(new Error("No response received from server"));
            return;
          }
          
          resolve(response);
        }
      );
    });

    const response = await loginPromise;
    
    if (!response.success) {
      throw new Error(response.error || response.details || "Login failed");
    }

    // Store credentials and check status
    await new Promise((resolve) => {
      chrome.storage.local.set(
        {
          token: response.token,
          user_id: response.user_id,
          lastLogin: Date.now(),
        },
        resolve
      );
    });

    showToast("Login successful");
    checkLoginStatus();
    
  } catch (error) {
    console.error("Login error:", error);
    
    let errorMessage = "Login failed: ";
    if (error.message.includes("Failed to fetch")) {
      errorMessage += "Cannot connect to server. Please check your internet connection.";
    } else if (error.message.includes("timeout")) {
      errorMessage += "Request timed out. Please try again.";
    } else {
      errorMessage += error.message;
    }
    
    showToast(errorMessage, "error");
    
  } finally {
    setLoading(false);
    elements.loginButton.disabled = false;
  }
};

const logout = () => {
  chrome.storage.local.remove(["token", "user_id"], () => {
    checkLoginStatus();
    showToast("Logged out successfully");
    if (grid) {
      grid.destroy();
      grid = null;
    }
  });
};

const loadShortcuts = async () => {
  setLoading(true);
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "getShortcuts",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    if (response && response.success) {
      displayShortcuts(response.data);
    } else {
      throw new Error(response?.error || "Failed to load shortcuts");
    }
  } catch (error) {
    console.error("Load shortcuts error:", error);
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
};

const addShortcut = async () => {
  const shortcut = elements.shortcutInput.value.trim(); // Only trim whitespace, preserve prefixes
  const expansion = elements.expansionInput.value.trim();

  if (!shortcut || !expansion) {
    showToast("Please fill in both fields", "error");
    return;
  }

  setLoading(true);
  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "addShortcut",
          shortcutData: { shortcut, expansion },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });

    if (response && response.success) {
      showToast("Shortcut added successfully");
      elements.shortcutInput.value = "";
      elements.expansionInput.value = "";
      loadShortcuts();
      elements.shortcutInput.focus();
    } else {
      throw new Error(response?.error || "Failed to add shortcut");
    }
  } catch (error) {
    console.error("Error adding shortcut:", error);
    showToast(error.message, "error");
  } finally {
    setLoading(false);
  }
};

const deleteShortcut = (id) => {
  showModal("deleteModalTemplate", {
    onConfirm: async () => {
      setLoading(true);
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              action: "deleteShortcut",
              shortcutId: id,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            }
          );
        });

        if (response && response.success) {
          showToast("Shortcut deleted successfully");
          loadShortcuts();
        } else {
          throw new Error(response?.error || "Failed to delete shortcut");
        }
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        setLoading(false);
      }
    },
  });
};

const editShortcut = (id, currentShortcut, currentExpansion) => {
  showModal("editModalTemplate", {
    defaultValues: {
      shortcut: currentShortcut, // Show exact shortcut text in edit modal
      expansion: currentExpansion,
    },
    onConfirm: async (values) => {
      if (!values) return;

      const { shortcut, expansion } = values;

      if (!shortcut || !expansion) {
        showToast("Please fill in both fields", "error");
        return;
      }

      if (shortcut === currentShortcut && expansion === currentExpansion) {
        return; // No changes made
      }

      setLoading(true);
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              action: "updateShortcut",
              shortcutData: {
                id,
                shortcut: shortcut.trim(), // Only trim whitespace, preserve prefix
                expansion,
              },
            },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            }
          );
        });

        if (response && response.success) {
          showToast("Shortcut updated successfully");
          await loadShortcuts();
        } else {
          throw new Error(response?.error || "Failed to update shortcut");
        }
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        setLoading(false);
      }
    },
  });
};

const displayShortcuts = (shortcuts) => {
  if (!shortcuts || !Array.isArray(shortcuts)) {
    console.error("Invalid shortcuts data:", shortcuts);
    return;
  }

  const container = elements.shortcutsContainer;

  // Sort shortcuts alphabetically, considering prefixes
  const sortedShortcuts = [...shortcuts].sort((a, b) =>
    a.shortcut.localeCompare(b.shortcut)
  );

  // Create a map of existing items by shortcut ID
  const existingItems = new Map();
  if (grid) {
    grid.getItems().forEach((item) => {
      const id = item.getElement().querySelector(".item-content")
        .dataset.shortcutId;
      existingItems.set(id, item);
    });
  } else {
    container.innerHTML = "";
  }

  // Process all shortcuts
  const itemsToAdd = [];
  sortedShortcuts.forEach(({ id, shortcut, expansion }) => {
    const existingItem = existingItems.get(id.toString());

    if (existingItem) {
      // Update existing item content if needed
      const element = existingItem.getElement();
      const shortcutText = element.querySelector(".shortcut-text");
      const expansionText = element.querySelector(".expansion-text");

      if (
        shortcutText.textContent !== shortcut ||
        expansionText.textContent !== expansion
      ) {
        shortcutText.textContent = shortcut; // Show exact shortcut text
        expansionText.textContent = expansion;
      }
      existingItems.delete(id.toString());
    } else {
      // Create new item
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="item-content" data-shortcut-id="${id}">
          <div class="item-header">
            <span class="shortcut-text">${shortcut}</span>
            <div>
              <button class="btn-icon edit-btn" title="Edit">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn-icon delete-btn" title="Delete">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="expansion-text">${expansion}</div>
        </div>
      `;

      // Add event listeners
      item
        .querySelector(".edit-btn")
        .addEventListener("click", () => editShortcut(id, shortcut, expansion));
      item
        .querySelector(".delete-btn")
        .addEventListener("click", () => deleteShortcut(id));

      itemsToAdd.push(item);
    }
  });

  // Remove items that no longer exist
  existingItems.forEach((item) => {
    grid?.remove([item], { removeElements: true });
  });

  // Add new items
  if (itemsToAdd.length > 0) {
    if (grid) {
      grid.add(itemsToAdd);
    } else {
      itemsToAdd.forEach((item) => container.appendChild(item));
      initializeGrid();
    }
  }

  // Refresh layout
  grid?.layout();
};

// Helper function to initialize grid
const initializeGrid = () => {
  grid = new Muuri(".grid", {
    items: ".item",
    dragEnabled: true,
    dragSortHeuristics: {
      sortInterval: 100,
      minDragDistance: 10,
    },
    dragPlaceholder: {
      enabled: true,
      duration: 300,
      createElement: (item) => item.getElement().cloneNode(true),
    },
    layout: {
      fillGaps: false,
      horizontal: false,
      alignRight: false,
      alignBottom: false,
      rounding: false,
      spacing: 20,
    },
    layoutOnInit: true,
    layoutOnResize: true,
    layoutDuration: 300,
    layoutEasing: "ease-out",
  });

  grid.on("dragEnd", () => {
    const order = grid.getItems().map((item) => {
      const shortcutEl = item.getElement().querySelector(".shortcut-text");
      return shortcutEl.textContent;
    });
    console.log("New order:", order);
  });
};

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  // Initialize
  checkLoginStatus();

  // Add event listeners for existing functionality
  elements.loginButton?.addEventListener("click", login);
  elements.logoutButton?.addEventListener("click", logout);
  elements.addButton?.addEventListener("click", addShortcut);

  // Add event listeners for registration functionality
  elements.registerButton?.addEventListener("click", register);
  elements.showLoginLink?.addEventListener("click", (e) => {
    e.preventDefault();
    showLoginForm();
  });
  elements.showRegisterLink?.addEventListener("click", (e) => {
    e.preventDefault();
    showRegistrationForm();
  });

  // Handle enter key in login form
  elements.password?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      login();
    }
  });

  // Handle enter key in registration form
  elements.regConfirmPassword?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      register();
    }
  });

  // Handle enter key in add shortcut form
  elements.expansionInput?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addShortcut();
    }
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    if (grid) {
      grid.refreshItems().layout();
    }
  });
});

// Error handling
window.onerror = (message, source, lineno, colno, error) => {
  console.error("Global error:", { message, source, lineno, colno, error });
  showToast(error.message || "An error occurred", "error");
};
