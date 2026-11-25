let shortcuts = [];

const endsWithWordBoundary = (text) => {
  return text.length === 0 || /[\s\n]$/.test(text) || text.length === text.lastIndexOf('\n') + 1;
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (
    request.action === "shortcutsUpdated" &&
    Array.isArray(request.shortcuts)
  ) {
    shortcuts = request.shortcuts;
  }
});

chrome.storage.local.get("cachedShortcuts", ({ cachedShortcuts }) => {
  if (Array.isArray(cachedShortcuts)) {
    shortcuts = cachedShortcuts;
  }
});

const handleInput = (e) => {
  if (
    !e.target.isContentEditable &&
    e.target.tagName !== "TEXTAREA" &&
    e.target.tagName !== "INPUT" &&
    !(e.target.tagName === "IFRAME" && e.target.contentDocument)
  ) {
    return;
  }

  const el = e.target;
  let text, cursorPosition;

  if (el.tagName === "IFRAME") {
    const doc = el.contentDocument;
    if (doc.activeElement) {
      text = doc.activeElement.value || doc.activeElement.innerText;
      cursorPosition = doc.activeElement.selectionStart || getCaretPosition(doc.activeElement);
    } else {
      return;
    }
  } else if (el.isContentEditable) {
    text = el.innerText;
    cursorPosition = getCaretPosition(el);
  } else {
    text = el.value || "";
    cursorPosition = el.selectionStart;
  }

  const lines = text.split('\n');
  let currentLineIndex = 0;
  let currentPosition = 0;

  for (let i = 0; i < lines.length; i++) {
    if (currentPosition + lines[i].length >= cursorPosition) {
      currentLineIndex = i;
      break;
    }
    currentPosition += lines[i].length + 1;
  }

  const currentLine = lines[currentLineIndex];
  const lineStartPosition = currentPosition;
  const positionInLine = cursorPosition - lineStartPosition;

  // Get the text before the cursor to look for shortcuts
const textBeforeCursor = currentLine.slice(0, positionInLine);
// Look for any word characters preceded by optional colon anywhere in text
const shortcutMatch = textBeforeCursor.match(/(?::?\w+)$/);

let matchingShortcut = null;
let shortcutStartPos = 0;
let shortcutEndPos = 0;

if (shortcutMatch) {
  const potentialShortcut = shortcutMatch[0];
  // Try both with and without colon prefix
  matchingShortcut = shortcuts.find(s => 
    s.shortcut === potentialShortcut || 
    s.shortcut === potentialShortcut.slice(1) ||
    `:${s.shortcut}` === potentialShortcut
  );

  if (matchingShortcut) {
    shortcutEndPos = lineStartPosition + positionInLine;
    shortcutStartPos = shortcutEndPos - potentialShortcut.length;
  }
}

  if (matchingShortcut && (shortcutEndPos === text.length || /[\s\n]/.test(text[shortcutEndPos]))) {
    if (el.tagName === "IFRAME") {
      replaceTextInIframe(
        el.contentDocument.activeElement,
        shortcutStartPos,
        shortcutEndPos,
        matchingShortcut.expansion
      );
    } else if (el.isContentEditable) {
      replaceTextInContentEditable(
        el,
        shortcutStartPos,
        shortcutEndPos,
        matchingShortcut.expansion
      );
    } else {
      const newText =
        text.slice(0, shortcutStartPos) +
        matchingShortcut.expansion +
        text.slice(shortcutEndPos);
      el.value = newText;

      const newCursorPos = shortcutStartPos + matchingShortcut.expansion.length;
      el.setSelectionRange(newCursorPos, newCursorPos);
    }

    e.preventDefault();

    chrome.runtime.sendMessage({
      action: "shortcutUsed",
      shortcutId: matchingShortcut.id,
    });
  }
};

function getCaretPosition(element) {
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  return preCaretRange.toString().length;
}

function replaceTextInIframe(el, startPos, endPos, replacement) {
  if (el.isContentEditable) {
    replaceTextInContentEditable(el, startPos, endPos, replacement);
  } else {
    const text = el.value;
    el.value = text.slice(0, startPos) + replacement + text.slice(endPos);
    el.setSelectionRange(startPos + replacement.length, startPos + replacement.length);
  }
}

document.addEventListener("input", handleInput, true);
document.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    handleInput(e);
  }
}, true);

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const inputs = node.querySelectorAll('input[type="text"], textarea, [contenteditable="true"], iframe');
        inputs.forEach((input) => {
          input.addEventListener("input", handleInput, true);
        });
      }
    });
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

window.onerror = (message, source, lineno, colno, error) => {
  console.error("Content script error:", {
    message,
    source,
    lineno,
    colno,
    error,
  });
};

function replaceTextInContentEditable(el, startPos, endPos, replacement) {
  const selection = window.getSelection();
  const range = document.createRange();

  let currentPos = 0;
  let startNode, startOffset, endNode, endOffset;

  function traverseNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (currentPos + node.length >= startPos && !startNode) {
        startNode = node;
        startOffset = startPos - currentPos;
      }
      if (currentPos + node.length >= endPos) {
        endNode = node;
        endOffset = endPos - currentPos;
        return true;
      }
      currentPos += node.length;
    } else {
      for (let child of node.childNodes) {
        if (traverseNodes(child)) return true;
      }
    }
    return false;
  }

  traverseNodes(el);

  if (startNode && endNode) {
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    range.deleteContents();
    const textNode = document.createTextNode(replacement);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}
