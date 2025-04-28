/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-undef */

// Debug: Log script load
console.log("background.js loaded");

// Track current engine state
let currentEngine = {
  taskName: null,
  isCreated: false
};

// Check runtime availability with retries
async function checkRuntimeAvailability() {
  console.log("Checking runtime availability...");
  for (let attempt = 1; attempt <= 5; attempt++) {
    console.log(`Runtime check attempt ${attempt}`);
    if (browser.trial && browser.trial.ml && typeof browser.trial.ml.createEngine === 'function') {
      console.log("browser.trial.ml available:", true);
      console.log("browser.trial.ml.createEngine available:", true);
      return true;
    }
    console.log("browser.trial available:", !!browser.trial);
    console.log("browser.trial.ml available:", !!(browser.trial && browser.trial.ml));
    console.log("browser.trial.ml.createEngine available:", !!(browser.trial && browser.trial.ml && typeof browser.trial.ml.createEngine === 'function'));
    await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff: 1s, 2s, 3s, 4s, 5s
  }
  console.warn("Firefox AI Runtime unavailable after retries.");
  return false;
}

// Check trialML permission
async function ensurePermissions() {
  const granted = await browser.permissions.contains({ permissions: ["trialML"] });
  console.log("trialML permission granted:", granted);
  if (!granted) {
    console.warn("trialML permission missing. Opening settings...");
    await browser.tabs.create({ url: browser.runtime.getURL("settings.html") });
    throw new Error("trialML permission required. Please grant it in settings.html.");
  }
}

// Initialize runtime and permissions
(async () => {
  try {
    await ensurePermissions();
    const runtimeAvailable = await checkRuntimeAvailability();
    if (!runtimeAvailable) {
      console.error("Initialization failed: Firefox AI Runtime unavailable.");
    }
  } catch (err) {
    console.error("Initialization error:", err.message);
  }
})();

// Debug: Confirm ensureEngine definition
console.log("Defining ensureEngine function...");

/**
 * Ensures the engine is set to the desired task, destroying the existing one if needed
 */
async function ensureEngine(taskName) {
  console.log(`ensureEngine called for task: ${taskName}`);
  if (!browser.trial || !browser.trial.ml || typeof browser.trial.ml.createEngine !== 'function') {
    const permissionGranted = await browser.permissions.contains({ permissions: ["trialML"] });
    throw new Error(
      `Firefox AI Runtime is not available. Please ensure:
      1. You are using Firefox Nightly (129.0a1 or later).
      2. browser.ml.enable is set to true in about:config.
      3. trialML permission is granted in settings.html or add-on permissions.
      Permission status: ${permissionGranted ? "Granted" : "Not granted"}
      If the issue persists, contact Mozilla AI Discord: https://discord.gg/Jmmq9mGwy7`
    );
  }

  // Always attempt to destroy any existing engine to clear API state
  if (currentEngine.isCreated || taskName === "summarization") {
    console.log(`Attempting to destroy existing ${currentEngine.taskName || "unknown"} engine...`);
    try {
      await browser.trial.ml.destroyEngine?.({ taskName: currentEngine.taskName || taskName });
      console.log(`Destroyed ${currentEngine.taskName || "unknown"} engine.`);
    } catch (err) {
      console.warn("Failed to destroy engine:", err.message || "Unknown error");
    }
    currentEngine.isCreated = false;
    currentEngine.taskName = null;
    // Add delay to ensure API state is cleared
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (!currentEngine.isCreated) {
    console.log(`Creating ${taskName} engine...`);
    // Log runtime state before creation
    console.log("Runtime state before engine creation:", {
      taskName,
      modelInfo: await browser.trial.ml.getEngineInfo?.() || "No model info available"
    });

    // Retry logic for engine creation
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`Engine creation attempt ${attempt} for ${taskName}...`);
      try {
        if (taskName === "summarization") {
          // Clear cached models only on first attempt
          if (attempt === 1) {
            console.log("Clearing cached models for summarization...");
            try {
              await browser.trial.ml.deleteCachedModels?.();
              console.log("Cached models cleared successfully.");
            } catch (err) {
              console.warn("Failed to clear cached models:", err.message || "Unknown error");
            }
          }
          // Try models in sequence
          const models = [
            { hub: "mozilla", id: null },
            { hub: "huggingface", id: "Xenova/distilbart-cnn-6-6" }
          ];
          let lastError = null;
          for (const model of models) {
            console.log(`Attempting to use ${model.hub}${model.id ? `/${model.id}` : ''} for summarization...`);
            try {
              await browser.trial.ml.createEngine({
                modelHub: model.hub,
                modelId: model.id,
                taskName: "summarization"
              });
              console.log(`Successfully created engine with ${model.hub}${model.id ? `/${model.id}` : ''}`);
              break;
            } catch (err) {
              console.warn(`Failed to use ${model.hub}${model.id ? `/${model.id}` : ''}:`, err.message || "Unknown error");
              lastError = err;
              if (model.hub === "huggingface") {
                throw new Error(`All model attempts failed: ${err.message || "Unknown error"}`);
              }
            }
          }
          if (lastError && !currentEngine.isCreated) {
            throw lastError;
          }
        } else {
          console.log("Creating engine with mozilla model...");
          await browser.trial.ml.createEngine({
            modelHub: "mozilla",
            taskName
          });
        }
        currentEngine.isCreated = true;
        currentEngine.taskName = taskName;
        console.log(`${taskName} engine created, model info (if available):`, 
          await browser.trial.ml.getEngineInfo?.() || "No model info available");
        break;
      } catch (err) {
        console.error(`Engine creation attempt ${attempt} failed:`, err.message || "Unknown error", err.stack || "No stack available");
        if (attempt === 5) {
          throw new Error(`Unable to create ${taskName} engine after 5 attempts: ${err.message || "Unexpected error"}`);
        }
        // Add delay before retry to avoid API conflicts
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff: 1s, 2s, 3s, 4s, 5s
      }
    }
  } else {
    console.log(`Using existing ${taskName} engine...`);
  }
}

// Debug: Verify ensureEngine is defined
console.log("ensureEngine defined:", typeof ensureEngine === 'function');

/**
 * Handles alt-text generation in the background script
 */
async function performAltTextGeneration(imageUrl, tabId) {
  console.log("performAltTextGeneration: Processing image URL:", imageUrl);
  try {
    await ensurePermissions();
    await ensureEngine("image-to-text");
    if (typeof browser.trial.ml.runEngine !== 'function') {
      throw new Error("browser.trial.ml.runEngine is not available");
    }
    const res = await browser.trial.ml.runEngine({
      args: [imageUrl],
      taskName: "image-to-text"
    });
    const altText = res[0].generated_text || "No alt text generated";
    console.log("Alt text generated:", altText);
    await browser.tabs.sendMessage(tabId, { action: "displayAltText", text: altText });
  } catch (err) {
    console.error("performAltTextGeneration error:", err.message || "Unknown error");
    await browser.tabs.sendMessage(tabId, { error: err.message || "Failed to generate alt text" });
  }
}

/**
 * Summarizes text in the background script
 */
async function performSummarization(inputText, tabId = null) {
  console.log("performSummarization: Processing input text:", inputText.slice(0, 50) + "...");
  try {
    await ensurePermissions();
    // Preprocess input
    let normalizedInput = inputText
      .replace(/[^\x00-\x7F]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    console.log("Normalized input text:", normalizedInput);
    console.log("Input length (characters):", normalizedInput.length);

    // Validate input
    if (normalizedInput.startsWith("/*") || normalizedInput.includes("console.log")) {
      throw new Error("Input appears to be code, which is not suitable for summarization. Please provide natural language text.");
    }
    if (normalizedInput.length > 100) {
      console.warn("Input exceeds 100 characters, truncating...");
      normalizedInput = normalizedInput.slice(0, 100);
      console.log("Truncated input:", normalizedInput);
    }
    if (normalizedInput.length < 10) {
      throw new Error("Input text is too short, please provide more content");
    }

    // Log runtime state
    console.log("Runtime state before inference:", {
      engineCreated: currentEngine.isCreated,
      taskName: currentEngine.taskName,
      modelInfo: await browser.trial.ml.getEngineInfo?.() || "No model info available"
    });

    // Verify runtime before engine creation
    const runtimeAvailable = await checkRuntimeAvailability();
    if (!runtimeAvailable) {
      throw new Error("Firefox AI Runtime is not available for summarization.");
    }

    await ensureEngine("summarization");
    if (typeof browser.trial.ml.runEngine !== 'function') {
      throw new Error("browser.trial.ml.runEngine is not available");
    }

    // Retry logic for runEngine with exponential backoff
    let res;
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`Running summarization inference (attempt ${attempt})...`);
      try {
        res = await browser.trial.ml.runEngine({
          args: [normalizedInput],
          taskName: "summarization"
        });
        console.log("Raw summarization result:", JSON.stringify(res, null, 2));
        break;
      } catch (err) {
        console.error(`Inference attempt ${attempt} failed:`, err.message || "Unknown error", err.stack || "No stack available");
        if (attempt === 5) {
          throw new Error(`Summarization inference failed after 5 attempts: ${err.message || "Unexpected error"}`);
        }
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
        // Reset engine before retry
        await browser.trial.ml.destroyEngine?.({ taskName: "summarization" });
        await ensureEngine("summarization");
      }
    }

    let summary = res[0].summary_text || res[0].text || "No summary returned";

    // Check for truncation
    if (summary.endsWith(" ") || !/[.!?]$/.test(summary.trim())) {
      console.warn("Summary appears truncated, retrying with shorter input...");
      const shorterInput = normalizedInput.slice(0, Math.floor(normalizedInput.length * 0.5));
      console.log("Retrying with shorter input:", shorterInput);
      res = await browser.trial.ml.runEngine({
        args: [shorterInput],
        taskName: "summarization"
      });
      console.log("Retry raw summarization result:", JSON.stringify(res, null, 2));
      summary = res[0].summary_text || res[0].text || "No summary returned";
      if (summary.endsWith(" ") || !/[.!?]$/.test(summary.trim())) {
        summary = summary.trim() + "...";
      }
    }

    console.log("Extracted summary:", summary);
    console.log("Summary length (characters):", summary.length);
    if (tabId) {
      await browser.tabs.sendMessage(tabId, { action: "displaySummary", text: summary });
    }
    return summary;
  } catch (err) {
    console.error("performSummarization error:", err.message || "Unknown error", err.stack || "No stack available");
    const errorMessage = err.message || "Summarization failed. Try clearing cached models in settings, using a shorter input, or contact Mozilla AI Discord: https://discord.gg/Jmmq9mGwy7";
    if (tabId) {
      await browser.trial.ml.destroyEngine?.({ taskName: "summarization" });
      await browser.trial.ml.deleteCachedModels?.();
      await browser.tabs.sendMessage(tabId, { error: errorMessage });
    }
    throw new Error(errorMessage);
  }
}

/**
 * Called in the tab content to initialize the modal
 */
async function initModal() {
  getModal().updateText("Initializing...");
}

/**
 * Called in the tab content to trigger alt-text generation
 */
async function triggerAltTextGeneration(targetElementId) {
  const modal = getModal();
  try {
    const image = browser.menus.getTargetElement(targetElementId);
    if (!image || !image.src) {
      throw new Error("No valid image selected");
    }
    modal.updateText("Running inference...");
    console.log("triggerAltTextGeneration: Sending message for image:", image.src);
    await browser.runtime.sendMessage({
      action: "generateAltText",
      imageUrl: image.src
    });
  } catch (err) {
    console.error("triggerAltTextGeneration error:", err.message);
    modal.updateText(`Error: ${err.message}`);
  }
}

/**
 * Called in the tab content to trigger summarization
 */
async function triggerSummarization(inputText) {
  const modal = getModal();
  try {
    modal.updateText("Running summarization...");
    console.log("triggerSummarization: Sending message for text:", inputText.slice(0, 50) + "...");
    await browser.runtime.sendMessage({
      action: "summarizeInTab",
      text: inputText
    });
  } catch (err) {
    console.error("triggerSummarization error:", err.message);
    modal.updateText(`Error: ${err.message}`);
  }
}

// Initialize the Map to track first run status per tab
const firstRunOnTab = new Map();

/**
 * Sets the first run status for a specific tab.
 * @param {number} tabId - The ID of the tab.
 * @param {boolean} isFirstRun - True if this is the first run on this tab, false otherwise.
 */
function setFirstRun(tabId, isFirstRun) {
  firstRunOnTab.set(tabId, isFirstRun);
}

/**
 * Checks if this is the first run on a specific tab.
 * Defaults to true if the tab has no entry in the map.
 * @param {number} tabId - The ID of the tab.
 * @returns {boolean} - True if this is the first run on this tab, false otherwise.
 */
function isFirstRun(tabId) {
  return firstRunOnTab.get(tabId) !== false;
}

/**
 * Clears the first run status for a tab when it closes or when necessary.
 * @param {number} tabId - The ID of the tab.
 */
function clearFirstRun(tabId) {
  firstRunOnTab.delete(tabId);
}

/**
 * Checks if a tab is scriptable (not privileged or restricted)
 */
async function isTabScriptable(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    const url = tab.url || '';
    return !url.startsWith('about:') && !url.startsWith('chrome:') && !url.startsWith('file:');
  } catch (err) {
    console.error("Error checking tab scriptability:", err);
    return false;
  }
}

/**
 * Handles context menu click for alt text generation
 */
async function onclick(info, tab) {
  if (!(await isTabScriptable(tab.id))) {
    console.warn("Cannot inject scripts into this tab:", tab.url);
    return;
  }

  if (isFirstRun(tab.id)) {
    try {
      await browser.tabs.insertCSS(tab.id, {
        file: "./alt-text-modal.css"
      });
      console.log("CSS injected successfully");
    } catch (err) {
      console.error("Failed to insert CSS:", err.message);
    }
  }

  const listener = progressData => {
    browser.tabs.sendMessage(tab.id, progressData).catch(err => {
      console.warn("Failed to send progress message:", err.message);
    });
  };

  if (browser.trial && browser.trial.ml) {
    browser.trial.ml.onProgress?.addListener(listener);
  }
  try {
    if (isFirstRun(tab.id)) {
      // Injecting content-script.js
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["./content-script.js"]
        });
        console.log("Content script injected successfully");
      } catch (err) {
        console.error("Failed to inject content script:", err.message);
        throw new Error("Unable to inject content script");
      }

      // Running initModal
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: initModal
        });
        console.log("Modal initialized successfully");
      } catch (err) {
        console.error("Failed to initialize modal:", err.message);
        throw new Error("Unable to initialize modal");
      }
    }

    // Running triggerAltTextGeneration
    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: triggerAltTextGeneration,
        args: [info.targetElementId]
      });
      console.log("triggerAltTextGeneration executed successfully");
    } catch (err) {
      console.error("Failed to run triggerAltTextGeneration:", err.message);
      throw new Error("Unable to generate alt text");
    }
  } catch (err) {
    console.error("Error in onclick handler:", err.message);
    browser.tabs.sendMessage(tab.id, { error: err.message }).catch(err => {
      console.warn("Failed to send error message:", err.message);
    });
  } finally {
    if (browser.trial && browser.trial.ml) {
      browser.trial.ml.onProgress?.removeListener(listener);
    }
    setFirstRun(tab.id, false);
  }
}

/**
 * Handles messages for alt-text generation and summarization
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      await ensurePermissions();
      if (!browser.trial || !browser.trial.ml) {
        throw new Error(
          "Firefox AI Runtime is not available. Please ensure Firefox Nightly is used with browser.ml.enable set to true in about:config."
        );
      }

      if (message.action === "generateAltText") {
        await performAltTextGeneration(message.imageUrl, sender.tab.id);
        sendResponse({ success: true });
      } else if (message.action === "summarize") {
        const listener = progressData => {
          if (sender.tab?.id) {
            browser.tabs.sendMessage(sender.tab.id, progressData).catch(err => {
              console.warn("Failed to send progress message:", err.message);
            });
          }
        };

        browser.trial.ml.onProgress?.addListener(listener);

        try {
          const isTabContext = !!sender.tab?.id;
          let summary;

          if (isTabContext) {
            const tabId = sender.tab.id;
            if (isFirstRun(tabId)) {
              if (!(await isTabScriptable(tabId))) {
                throw new Error("Cannot inject scripts into this tab");
              }
              await browser.tabs.insertCSS(tabId, {
                file: "./alt-text-modal.css"
              });
              await browser.scripting.executeScript({
                target: { tabId: tabId },
                files: ["./content-script.js"]
              });
              await browser.scripting.executeScript({
                target: { tabId: tabId },
                func: initModal
              });
              setFirstRun(tabId, false);
            }
            await browser.scripting.executeScript({
              target: { tabId: tabId },
              func: triggerSummarization,
              args: [message.text]
            });
            sendResponse({ success: true });
          } else {
            console.log("Processing popup summarization request...");
            summary = await performSummarization(message.text);
            console.log("Sending summary to popup:", summary);
            sendResponse({ summary });
          }
        } finally {
          browser.trial.ml.onProgress?.removeListener(listener);
        }
      } else if (message.action === "summarizeInTab") {
        const summary = await performSummarization(message.text, sender.tab.id);
        sendResponse({ success: true });
      }
    } catch (err) {
      console.error("Message handler error:", err.message);
      sendResponse({ error: err.message });
    }
  })();
  return true; // Keep channel open for async response
});

// Create context menu item for alt text generation
browser.menus.create({
  title: "✨ Generate Alt Text",
  documentUrlPatterns: ["*://*/*"],
  contexts: ["image"],
  onclick
});

// Reset engine state on extension reload
browser.runtime.onStartup.addListener(() => {
  currentEngine.isCreated = false;
  currentEngine.taskName = null;
  console.log("Engine state reset on startup");
});