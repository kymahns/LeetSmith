// leetcode.js - Content script for LeetSmith

console.log("LeetSmith content script loaded.");

// TODO: Implement robust submission detection (page state, network events, polling)

// Helper to extract the slug from the URL
function getProblemSlug() {
  const match = window.location.pathname.match(/\/problems\/([^/]+)/);
  return match ? match[1] : null;
}
