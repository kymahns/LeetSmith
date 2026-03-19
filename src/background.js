// background.js - Service worker for LeetSmith
import { fetchLatestSubmission, fetchSubmissionDetails, fetchQuestionData, fetchUserStats } from './lib/leetcodeApi.js';
import { commitFile } from './lib/githubApi.js';

// When the extension is installed or reloaded, re-inject the content script
// into any already-open LeetCode tabs so the user doesn't have to refresh.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: 'https://leetcode.com/problems/*' });
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/leetcode.js']
      });
      console.log(`LeetSmith: Re-injected content script into tab ${tab.id}`);
    } catch (err) {
      console.warn(`LeetSmith: Could not re-inject into tab ${tab.id}:`, err.message);
    }
  }
});

// Language extension mapping
const LANG_EXT = {
  'cpp': 'cpp', 'java': 'java', 'python': 'py', 'python3': 'py',
  'c': 'c', 'csharp': 'cs', 'javascript': 'js', 'typescript': 'ts',
  'php': 'php', 'swift': 'swift', 'kotlin': 'kt', 'dart': 'dart',
  'golang': 'go', 'ruby': 'rb', 'scala': 'scala', 'rust': 'rs',
  'racket': 'rkt', 'erlang': 'erl', 'elixir': 'ex'
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_LATEST_SUBMISSION') {
    handleSubmission(request.slug)
      .then(result => sendResponse(result))
      .catch(err => {
        console.error('LeetSmith Sync Error:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep the message channel open for async response
  } else if (request.type === 'FETCH_STATS') {
    fetchUserStats()
      .then(stats => sendResponse({ success: true, data: stats }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function updateIcon(type) {
  if (type === 'success') {
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  } else if (type === 'error') {
    chrome.action.setBadgeText({ text: '✗' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  }

  if (type !== 'normal') {
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 5000);
  }
}

async function handleSubmission(slug) {
  console.log(`LeetSmith: Processing submission for problem slug -> ${slug}`);
  
  const storage = await chrome.storage.local.get(['syncedSubmissions', 'githubPat', 'githubOwner', 'githubRepo', 'customFolder']);
  const syncedSubs = storage.syncedSubmissions || [];

  // Wait a moment for LeetCode to process the submit
  await sleep(3000);

  let latestSub = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    latestSub = await fetchLatestSubmission(slug);
    
    if (latestSub && latestSub.statusDisplay === 'Accepted') {
      // If this ID is already synced, it might be the PREVIOUS submission.
      // Wait and retry to see if the new one appears.
      if (!syncedSubs.includes(latestSub.id)) {
        break; // Found the new one!
      }
      console.log(`LeetSmith: Latest sub ${latestSub.id} already synced. Retrying in 3s...`);
    } else {
      console.log(`LeetSmith: Latest sub not accepted yet. Retrying in 3s...`);
    }
    
    attempts++;
    if (attempts < maxAttempts) await sleep(3000);
  }

  if (!latestSub || latestSub.statusDisplay !== 'Accepted') {
    throw new Error('No new accepted submissions found after multiple checks.');
  }

  if (syncedSubs.includes(latestSub.id)) {
    return { success: true, message: 'Already synced.' };
  }

  // 2. Fetch code and question data
  const [details, question] = await Promise.all([
    fetchSubmissionDetails(latestSub.id),
    fetchQuestionData(slug)
  ]);

  if (!details || !question) {
    throw new Error('Failed to retrieve full submission details or question data.');
  }

  // 3. Prepare Config
  const { githubPat, githubOwner, githubRepo, customFolder } = storage;

  if (!githubPat || !githubOwner || !githubRepo) {
    throw new Error('GitHub configuration is missing. Please setup the options page.');
  }

  // 4. Prepare File Payload
  const difficultyStr = String(question.difficulty || 'Unknown');
  const dirName = `${question.questionFrontendId}-${question.titleSlug}`;
  
  // Clean up custom folder slashes, default to root or custom logic if empty.
  const baseFolder = customFolder ? customFolder.replace(/^\/+|\/+$/g, '') : '';
  const dirPath = baseFolder ? `${baseFolder}/${dirName}` : dirName;
  
  const ext = LANG_EXT[details.lang.name] || 'txt';
  const solutionPath = `${dirPath}/solution.${ext}`;
  const readmePath = `${dirPath}/README.md`;

  const solutionContent = `// Problem: ${question.title}\n// URL: https://leetcode.com/problems/${question.titleSlug}\n// Difficulty: ${difficultyStr}\n// Language: ${details.lang.verboseName}\n// Date: ${new Date(Number(details.timestamp) * 1000).toISOString().split('T')[0]}\n\n${details.code}`;
  
  const readmeContent = `# ${question.questionFrontendId}. ${question.title}\n\n**Difficulty:** ${difficultyStr}\n\n**Link:** [${question.title}](https://leetcode.com/problems/${question.titleSlug})\n\n---\n\n${question.content}`;

  // Prepare Commit Message
  const timeStr = details.runtimeDisplay || 'N/A';
  const timePct = typeof details.runtimePercentile === 'number' ? details.runtimePercentile.toFixed(2) : '0.00';
  const memStr = details.memoryDisplay || 'N/A';
  const memPct = typeof details.memoryPercentile === 'number' ? details.memoryPercentile.toFixed(2) : '0.00';
  const customCommitMsg = `Time: ${timeStr} (${timePct}%) | Memory: ${memStr} (${memPct}%) - LeetSmith`;
  const readmeCommitMsg = `Added README.md file for ${question.title}`;

  // 5. Commit to GitHub
  console.log(`LeetSmith: Pushing to GitHub -> ${solutionPath}`);
  
  try {
    await commitFile(
      githubOwner, githubRepo, solutionPath,
      solutionContent, customCommitMsg, githubPat
    );

    // Commit README as well
    await commitFile(
      githubOwner, githubRepo, readmePath,
      readmeContent, readmeCommitMsg, githubPat
    );

    // Save submission ID to prevent duplicates
    const updatedSynced = [latestSub.id, ...syncedSubs.slice(0, 99)]; // Keep last 100
    await chrome.storage.local.set({ syncedSubmissions: updatedSynced });

    updateIcon('success');
  } catch (error) {
    console.error('LeetSmith: Failed to commit to GitHub', error);
    updateIcon('error');
    throw new Error('Failed to commit to GitHub. Check your PAT and Repo settings.');
  }

  return { success: true, message: `Successfully synced ${question.title} to GitHub!` };
}
