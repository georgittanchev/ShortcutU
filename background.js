console.log("Background script loaded");

self.oninstall = (event) => {
  console.log("Extension installed");
};

self.onactivate = (event) => {
  console.log("Extension activated");
};

function prefetchShortcuts() {
  console.log("Attempting to prefetch shortcuts...");
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["token", "user_id"], ({ token, user_id }) => {
      console.log("Storage data for prefetch:", { token: !!token, user_id });
      if (token && user_id) {
        const url = `https://shortcuts.tanchev.net:3222/getShortcuts/${user_id}`;
        console.log("Prefetch URL:", url);

        fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
          .then((response) => {
            console.log("Prefetch response status:", response.status);
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
          })
          .then((data) => {
            console.log("Prefetch data received:", data);
            chrome.storage.local.set({ cachedShortcuts: data }, () => {
              chrome.tabs.query({}, (tabs) => {
                const notifyPromises = tabs.map((tab) =>
                  chrome.tabs
                    .sendMessage(tab.id, {
                      action: "shortcutsUpdated",
                      shortcuts: data,
                    })
                    .catch(() => {})
                );
                Promise.all(notifyPromises).then(() => resolve(data));
              });
            });
          })
          .catch((error) => {
            console.error("Prefetch error details:", error);
            reject(error);
          });
      } else {
        console.log("Prefetch skipped - missing token or user_id");
        reject(new Error("Missing token or user_id"));
      }
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in background with action:", request?.action);
  console.log("Full message details:", request);

  if (request.action === "login") {
    console.log("Processing login request...");
    console.log("Login credentials:", {
      username: request.credentials.username,
      passwordLength: request.credentials.password?.length,
    });

    // First, try to check server availability
    console.log("Testing server connection...");
    fetch("https://shortcuts.tanchev.net:3222/", {
      method: "GET",
      mode: "no-cors", // Try with no-cors first
    })
      .then(() => {
        console.log("Server is reachable, proceeding with login");
        return fetch("https://shortcuts.tanchev.net:3222/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request.credentials),
        });
      })
      .then((response) => {
        console.log("Login response received:", response.status);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("Login successful:", data);
        if (data.token && data.user_id) {
          // Check for both token and user_id
          chrome.storage.local.set(
            {
              token: data.token,
              user_id: data.user_id, // Use the user_id from the server response
            },
            () => {
              sendResponse({
                success: true,
                token: data.token,
                user_id: data.user_id,
              });
              prefetchShortcuts();
            }
          );
        } else {
          sendResponse({
            success: false,
            error: "Invalid server response: missing token or user_id",
          });
        }
      })
      .catch((error) => {
        console.error("Login error:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === "getShortcuts") {
    console.log("Processing getShortcuts request");

    chrome.storage.local.get(["token", "user_id"], ({ token, user_id }) => {
      console.log("Retrieved storage data:", { hasToken: !!token, user_id });

      if (!token || !user_id) {
        console.log("Not authenticated");
        sendResponse({ success: false, error: "Not authenticated" });
        return;
      }

      fetch(`https://shortcuts.tanchev.net:3222/getShortcuts/${user_id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then(async (response) => {
          console.log("Get shortcuts response status:", response.status);

          if (!response.ok) {
            const errorText = await response.text();
            console.error("Get shortcuts error response:", errorText);
            throw new Error(`Failed to get shortcuts: ${response.status}`);
          }

          return response.json();
        })
        .then((data) => {
          console.log("Retrieved shortcuts:", data);
          chrome.storage.local.set({ cachedShortcuts: data });
          sendResponse({ success: true, data });
        })
        .catch((error) => {
          console.error("Get shortcuts error:", error);
          sendResponse({
            success: false,
            error: error.message || "Failed to get shortcuts",
          });
        });
    });
    return true;
  }

  if (request.action === "register") {
    console.log("Processing registration request...");
    const API_URL = "https://shortcuts.tanchev.net:3222";

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.userData),
    };

    // Direct registration without test endpoint
    fetch(`${API_URL}/register`, fetchOptions)
      .then(async (response) => {
        console.log("Registration response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Registration error response:", errorText);
          throw new Error(`Registration failed: ${response.status}`);
        }

        return response.json();
      })
      .then((data) => {
        console.log("Registration successful:", data);
        if (data.token && data.user_id) {
          chrome.storage.local.set(
            {
              token: data.token,
              user_id: data.user_id,
            },
            () => {
              sendResponse({
                success: true,
                token: data.token,
                user_id: data.user_id,
              });
            }
          );
        } else {
          throw new Error("Invalid response format");
        }
      })
      .catch((error) => {
        console.error("Registration error:", error);
        sendResponse({
          success: false,
          error: error.message || "Registration failed",
        });
      });

    return true;
  }

  if (request.action === "addShortcut") {
    console.log("Processing addShortcut request:", request.shortcutData);

    chrome.storage.local.get(["token", "user_id"], ({ token, user_id }) => {
      if (!token || !user_id) {
        console.log("Authentication missing:", { token: !!token, user_id });
        sendResponse({ success: false, error: "Not authenticated" });
        return;
      }

      const shortcutData = {
        ...request.shortcutData,
        user_id: user_id,
      };

      console.log("Sending shortcut data:", shortcutData);

      fetch("https://shortcuts.tanchev.net:3222/addShortcut", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(shortcutData),
      })
        .then(async (response) => {
          console.log("Add shortcut response status:", response.status);

          if (!response.ok) {
            const errorText = await response.text();
            console.error("Add shortcut error response:", errorText);
            throw new Error(`Failed to add shortcut: ${response.status}`);
          }

          return response.json();
        })
        .then((data) => {
          console.log("Shortcut added successfully:", data);
          // Refresh shortcuts after adding
          prefetchShortcuts()
            .then(() => {
              sendResponse({ success: true, data });
            })
            .catch((error) => {
              console.error("Error refreshing shortcuts:", error);
              sendResponse({ success: true, data }); // Still return success even if refresh fails
            });
        })
        .catch((error) => {
          console.error("Add shortcut error:", error);
          sendResponse({
            success: false,
            error: error.message || "Failed to add shortcut",
          });
        });
    });

    return true;
  }

  if (request.action === "updateShortcut") {
    console.log("Processing update request:", request.shortcutData);

    chrome.storage.local.get(["token", "user_id"], ({ token, user_id }) => {
      if (!token || !user_id) {
        console.log("Authentication missing:", { token: !!token, user_id });
        sendResponse({ success: false, error: "Not authenticated" });
        return;
      }

      const shortcutData = {
        ...request.shortcutData,
        user_id: user_id,
      };

      console.log("Sending update request with data:", shortcutData);

      fetch("https://shortcuts.tanchev.net:3222/updateShortcut", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(shortcutData),
      })
        .then(async (response) => {
          const text = await response.text();
          console.log("Raw response:", text);

          if (!response.ok) {
            throw new Error(
              `HTTP error! status: ${response.status}, response: ${text}`
            );
          }

          let data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            console.error("Response parsing error:", e);
            throw new Error("Invalid server response");
          }
          return data;
        })
        .then((data) => {
          console.log("Update successful:", data);

          if (data.shortcuts) {
            // Update local cache with the new shortcuts
            chrome.storage.local.set({ cachedShortcuts: data.shortcuts });

            // Notify all tabs
            chrome.tabs.query({}, (tabs) => {
              tabs.forEach((tab) => {
                chrome.tabs
                  .sendMessage(tab.id, {
                    action: "shortcutsUpdated",
                    shortcuts: data.shortcuts,
                  })
                  .catch(() => {});
              });
            });
          }

          sendResponse({ success: true, data: data.shortcuts || data });
        })
        .catch((error) => {
          console.error("Update error:", error);
          sendResponse({
            success: false,
            error: error.message || "Failed to update shortcut",
          });
        });
    });
    return true;
  }

  if (request.action === "deleteShortcut") {
    chrome.storage.local.get(["token", "user_id"], ({ token, user_id }) => {
      if (!token || !user_id) {
        sendResponse({ success: false, error: "Not authenticated" });
        return;
      }

      fetch(
        `https://shortcuts.tanchev.net:3222/deleteShortcut/${request.shortcutId}?user_id=${user_id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
        .then(async (response) => {
          console.log("Delete shortcut response status:", response.status);

          if (!response.ok) {
            const errorText = await response.text();
            console.error("Delete shortcut error response:", errorText);
            throw new Error(`Failed to delete shortcut: ${response.status}`);
          }

          return response.json();
        })
        .then((data) => {
          console.log("Delete successful:", data);
          prefetchShortcuts()
            .then(() => {
              sendResponse({ success: true, data });
            })
            .catch((error) => {
              console.error("Error refreshing shortcuts after delete:", error);
              sendResponse({ success: true, data }); // Still return success even if refresh fails
            });
        })
        .catch((error) => {
          console.error("Delete error:", error);
          sendResponse({
            success: false,
            error: error.message || "Failed to delete shortcut",
          });
        });
    });
    return true;
  }
});
