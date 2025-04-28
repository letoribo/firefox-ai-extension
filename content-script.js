/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Simple modal class for displaying text
 */
class AltTextModal {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'alt-text-modal';
    this.element.style.display = 'none';
    document.body.appendChild(this.element);
  }

  updateText(text) {
    // Format error messages with newlines for readability
    const formattedText = text.replace(/\n/g, '<br>').replace(/(\d\.)/g, '<br>$1');
    this.element.innerHTML = formattedText;
    this.element.style.display = text ? 'block' : 'none';
  }

  destroy() {
    if (this.element) {
      this.element.remove();
    }
  }
}

/**
 * Returns the modal instance for displaying text
 */
function getModal() {
  return new AltTextModal();
}

/**
 * Initialize the modal
 */
async function initModal() {
  getModal().updateText("Initializing...");
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message);
  const modal = getModal();
  if (message.progress) {
    modal.updateText(`Progress: ${message.progress}`);
  } else if (message.error) {
    modal.updateText(`Error: ${message.error}`);
  } else if (message.action === "displayAltText") {
    modal.updateText(message.text);
  } else if (message.action === "displaySummary") {
    modal.updateText(message.text);
  }
  sendResponse({ received: true });
});