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
    this.element.textContent = text;
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
  const modal = getModal();
  modal.updateText("Initializing...");
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message);
  // Handle progress updates or other messages
  if (message.progress) {
    const modal = getModal();
    modal.updateText(`Progress: ${message.progress}`);
  }
  sendResponse({ received: true });
});