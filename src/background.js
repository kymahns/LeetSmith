// background.js - Service worker for LeetSmith

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_LATEST_SUBMISSION') {
    handleSubmission(request.slug)
      .then(result => sendResponse(result))
      .catch(err => {
        console.error('LeetSmith Sync Error:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep the message channel open for async response
  }
});

async function handleSubmission(slug) {
  console.log(`LeetSmith: Processing submission for problem slug -> ${slug}`);
  // TODO: Call LeetCode GraphQL to verify Accept status
  // TODO: Fetch Submission Code
  // TODO: Fetch Question Data (Title, Number, Content)
  // TODO: Commit to GitHub via REST API
  return { success: true, message: 'Sync sequence initiated.' };
}
