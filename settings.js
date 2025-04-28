/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* globals browser */

/**
 * Deletes cached ML models from IndexDB.
 */
function deleteCachedModels() {
  browser.trial.ml.deleteCachedModels().then(() => {
    alert("Cached models deleted successfully.");
  }).catch(err => {
    alert(`Error deleting cached models: ${err}`);
  });
}

/**
 * Requests the trialML permission for the extension.
 */
async function askPermission() {
  try {
    const granted = await browser.permissions.request({ permissions: ["trialML"] });
    if (granted) {
      await updateGranted();
    } else {
      alert("Permission denied. The extension requires ML permissions to function.");
    }
  } catch (err) {
    alert(`Error requesting permission: ${err}`);
  }
}

/**
 * Updates the UI based on whether the trialML permission is granted.
 */
async function updateGranted() {
  const granted = await browser.permissions.contains({
    permissions: ["trialML"],
  });
  document.body.classList.toggle("granted", granted);
}

// Initialize event listeners and UI state
document.querySelector("#grant").addEventListener("click", askPermission);
document.querySelector("#clear").addEventListener("click", deleteCachedModels);
updateGranted();