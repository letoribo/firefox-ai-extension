/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* globals AltTextModal */

/**
 * Returns the modal instance for displaying text.
 * Assumes AltTextModal is defined (replace with actual implementation).
 */
function getModal() {
  // Placeholder: Assumes AltTextModal is a class  const modal = new AltTextModal();
  modal.updateText = function(text) {
    // Update modal text (replace with actual modal logic)
    console.log("Modal update:", text);
  };
  return modal;
}