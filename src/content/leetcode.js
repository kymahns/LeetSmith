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
  
  // We look for elements containing "Accepted" in the specific submission result area
  const successElements = Array.from(document.querySelectorAll('[data-e2e-locator="submission-result"], .success, [class*="status-accepted"]')).filter(
    el => el.textContent.trim() === 'Accepted'
  );

  // If we identify a newly generated "Accepted" tag and aren't already syncing
  if (successElements.length > 0 && !submissionInProgress) {
    // Basic verification that we are on a problem page and not just a static history page
    const isSubPage = window.location.pathname.includes('/submissions/');
    
    if (!isSubPage) {
      console.log(`LeetSmith: Detected "Accepted" state for slug: ${slug}`);
      submissionInProgress = true;
      triggerSync(slug);
      
      // Reset lock after 30s
      setTimeout(() => { submissionInProgress = false; }, 30000);
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
  if (!slug) return { success: false, error: "Missing problem slug" };

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'FETCH_LATEST_SUBMISSION', slug }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("LeetSmith: Connection lost (Extension may have been reloaded). Please refresh the page.");
          resolve({ success: false, error: "Connection Lost. Please refresh the page." });
        } else {
          console.log("LeetSmith Sync Response:", response);
          resolve(response || { success: false, error: "Empty response from background" });
        }
      });
    } catch (e) {
      console.error("LeetSmith: Failed to send message", e);
      resolve({ success: false, error: "Message Failed" });
    }
  });
}
