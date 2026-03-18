// leetcode.js - Content script for LeetSmith

console.log("LeetSmith content script loaded.");

// TODO: Implement robust submission detection (page state, network events, polling)

// Helper to extract the slug from the URL
function getProblemSlug() {
  const match = window.location.pathname.match(/\/problems\/([^/]+)/);
  return match ? match[1] : null;
}

let submissionInProgress = false;

// We monitor the DOM for success states "Accepted" to appear.
const observer = new MutationObserver((mutations) => {
  const slug = getProblemSlug();
  if (!slug) return;

  // Modern LeetCode displays "Accepted" in specific data attributes or text.
  // We'll look for general text/attributes that indicate a successful submission,
  // or changes to the submission panel.
  const pageText = document.body.innerText;
  
  // Quick and dirty heuristic: user clicks submit, state goes to pending/judging, then "Accepted".
  // A more robust way is to hook into `fetch` requests in the background script using declarativeNetRequest
  // or webRequest, but for MV3 content scripts, DOM observation + polling is our safest bet without breaking changes.
  
  // We look for elements containing "Accepted" that appear in the test result / submission area
  const successElements = Array.from(document.querySelectorAll('*')).filter(
    el => el.textContent === 'Accepted' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE'
  );

  // If we identify a newly generated "Accepted" tag and aren't already syncing
  if (successElements.length > 0 && !submissionInProgress) {
    // Check if the closest container is a submission result panel.
    // (This is highly susceptible to LeetCode DOM changes, so we will also provide a manual trigger in popup).
    const isSubmissionResult = successElements.some(el => el.closest('[data-e2e-locator="submission-result"]') || el.className.includes('success'));
    
    if (isSubmissionResult) {
      console.log(`LeetSmith: Detected "Accepted" state for slug: ${slug}`);
      submissionInProgress = true;
      triggerSync(slug);
      
      // Reset lock after 10s to allow multiple submissions if the user modifies code
      setTimeout(() => { submissionInProgress = false; }, 10000);
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

// Listen for messages from popup (Manual Sync)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'MANUAL_SYNC') {
    const slug = getProblemSlug();
    if (slug) {
      triggerSync(slug).then(res => sendResponse(res));
    } else {
      sendResponse({ success: false, error: "Not on a valid problem page." });
    }
    return true; // async
  }
});

async function triggerSync(slug) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'FETCH_LATEST_SUBMISSION', slug }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("LeetSmith: Worker communication error", chrome.runtime.lastError);
        resolve({ success: false, error: "Communication Error" });
      } else {
        console.log("LeetSmith Sync Response:", response);
        resolve(response);
      }
    });
  });
}
