/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-undef */
/**
 * Called in the tab content to generate alt text for an image
 */
async function generateAltText(targetElementId) {
  const modal = getModal();
  try {
    const imageUrl = browser.menus.getTargetElement(targetElementId).src;
    modal.updateText("Running inference...");

    const res = await browser.trial.ml.runEngine({
      args: [imageUrl],
    });
    modal.updateText(res[0].generated_text);
  } catch (err) {
    modal.updateText(`${err}`);
  }
}

/**
 * Summarizes text, called in the background for popup requests or in tab for content scripts
 */
async function summarizeText(inputText, useModal = false) {
  let modal;
  if (useModal) {
    modal = getModal();
    modal.updateText("Running summarization...");
  }
  try {
    console.log("Creating summarization engine...");
    await browser.trial.ml.createEngine({
      modelHub: "mozilla",
      taskName: "summarization",
    });
    console.log("Running summarization inference...");
    const res = await browser.trial.ml.runEngine({
      args: [inputText],
      taskName: "summarization",
    });
    console.log("Summarization result:", res);
    if (useModal) {
      modal.updateText(res[0].summary_text);
    }
    return res[0].summary_text;
  } catch (err) {
    console.error("Summarization error:", err);
    if (useModal) {
      modal.updateText(`Error: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Called in the tab content to initialize the modal
 */
async function initModal() {
  getModal().updateText("Initializing...");
}

// Initialize the Map to track first run status per tab
const firstRunOnTab = new Map();

/**
 * Sets the first run status for a specific tab.
 *
 * @param {number} tabId - The ID of the tab.
 * @param {boolean} isFirstRun - True if this is the first run on this tab, false otherwise.
 */
function setFirstRun(tabId, isFirstRun) {
  firstRunOnTab.set(tabId, isFirstRun);
}

/**
 * Checks if this is the first run on a specific tab.
 * Defaults to true if the tab has no entry in the map.
 *
 * @param {number} tabId - The ID of the tab.
 * @returns {boolean} - True if this is the first run on this tab, false otherwise.
 */
function isFirstRun(tabId) {
  return firstRunOnTab.get(tabId) !== false;
}

/**
 * Clears the first run status for a tab when it closes or when necessary.
 *
 * @param {number} tabId - The ID of the tab.
 */
function clearFirstRun(tabId) {
  firstRunOnTab.delete(tabId);
}

/**
 * Handles context menu click for alt text generation
 */
async function onclick(info, tab) {
  if (isFirstRun(tab.id)) {
    browser.tabs.insertCSS(tab.id, {
      file: "./alt-text-modal.css",
    });
  }

  const listener = progressData => {
    browser.tabs.sendMessage(tab.id, progressData);
  };

  browser.trial.ml.onProgress.addListener(listener);
  try {
    if (isFirstRun(tab.id)) {
      // Injecting content-script.js, which creates the AltTextModal instance
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["./content-script.js"],
      });

      // Running initModal
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: initModal,
      });

      await browser.trial.ml.createEngine({
        modelHub: "mozilla",
        taskName: "image-to-text",
      });
    }
    // Running generateAltText
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: generateAltText,
      args: [info.targetElementId],
    });
  } catch (err) {
    console.error("Error in onclick handler:", err);
    const modal = getModal();
    modal.updateText(`Error: ${err}`);
  } finally {
    browser.trial.ml.onProgress.removeListener(listener);
    setFirstRun(tab.id, false);
  }
}

/**
 * Handles messages for text summarization
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "summarize") {
    const listener = progressData => {
      // Optionally send progress to popup or tab
      if (sender.tab?.id) {
        browser.tabs.sendMessage(sender.tab.id, progressData);
      }
    };

    browser.trial.ml.onProgress.addListener(listener);

    (async () => {
      try {
        // Check if the request comes from a tab (content script) or popup
        const isTabContext = !!sender.tab?.id;
        let summary;

        if (isTabContext) {
          const tabId = sender.tab.id;
          if (isFirstRun(tabId)) {
            // Inject CSS and content script for modal
            await browser.tabs.insertCSS(tabId, {
              file: "./alt-text-modal.css",
            });

            await browser.scripting.executeScript({
              target: { tabId: tabId },
              files: ["./content-script.js"],
            });

            // Initialize modal
            await browser.scripting.executeScript({
              target: { tabId: tabId },
              func: initModal,
            });

            setFirstRun(tabId, false);
          }

          // Run summarization in the tab with modal
          summary = (await browser.scripting.executeScript({
            target: { tabId: tabId },
            func: summarizeText,
            args: [message.text, true], // Enable modal
          }))[0].result;
        } else {
          // Run summarization in background for popup
          console.log("Processing popup summarization request...");
          summary = await summarizeText(message.text, false); // No modal
          console.log("Sending summary to popup:", summary);
        }

        sendResponse({ summary });
      } catch (error) {
        console.error("Error in summarization handler:", error);
        sendResponse({ error: error.message });
      } finally {
        browser.trial.ml.onProgress.removeListener(listener);
      }
    })();

    return true; // Keep message channel open for async response
  }
});

// Create context menu item for alt text generation
browser.menus.create({
  title: "✨ Generate Alt Text",
  documentUrlPatterns: ["*://*/*"],
  contexts: ["image"],
  onclick,
});

// Check if trialML permission is granted, otherwise open settings
browser.permissions.contains({ permissions: ["trialML"] }).then(granted => {
  if (!granted) {
    browser.tabs.create({ url: browser.runtime.getURL("settings.html") });
  }
});