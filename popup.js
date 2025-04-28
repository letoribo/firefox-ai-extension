/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* globals browser */

document.querySelector("#summarize").addEventListener("click", async () => {
  const input = document.querySelector("#input").value.trim();
  const output = document.querySelector("#output");

  if (!input) {
    output.textContent = "Please enter text to summarize.";
    console.log("No input provided");
    return;
  }

  output.textContent = "Summarizing...";
  console.log("Sending summarization request for text:", input);

  try {
    const response = await browser.runtime.sendMessage({
      action: "summarize",
      text: input,
    });

    console.log("Full response received:", response);

    if (response.summary) {
      output.textContent = response.summary;
      console.log("Summary displayed:", response.summary);
    } else {
      output.textContent = `Error: ${response.error || "Failed to summarize text. Check console for details."}`;
      console.error("Summarization failed, response:", response);
    }
  } catch (err) {
    output.textContent = `Error: ${err.message || "Unexpected error during summarization."}`;
    console.error("Unexpected error during summarization:", err);
  }
});