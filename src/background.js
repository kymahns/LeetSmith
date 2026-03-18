// background.js - Service worker for LeetSmith
import { fetchLatestSubmission, fetchSubmissionDetails, fetchQuestionData, fetchUserStats } from './lib/leetcodeApi.js';
import { commitFile } from './lib/githubApi.js';

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
  const iconPath = type === 'success' 
    ? 'assets/logo_success.png' 
    : type === 'error' 
      ? 'assets/logo_error.png' 
      : 'assets/logo2.png';
  
  chrome.action.setIcon({ path: iconPath });

  if (type !== 'normal') {
    setTimeout(() => {
      chrome.action.setIcon({ path: 'assets/logo2.png' });
    }, 5000);
  }
}

async function handleSubmission(slug) {
  console.log(`LeetSmith: Processing submission for problem slug -> ${slug}`);
  
  // Wait a short moment to allow LeetCode's backend to register the submission
  await sleep(2000);

  // 1. Fetch Latest Submission
  const latestSub = await fetchLatestSubmission(slug);
  if (!latestSub) {
    throw new Error('No recent submissions found for this problem.');
  }

  if (latestSub.statusDisplay !== 'Accepted') {
    return { success: false, message: `Submission status is ${latestSub.statusDisplay}, skipping sync.` };
  }

  // Deduplication Check
  const storage = await chrome.storage.local.get(['syncedSubmissions', 'githubPat', 'githubOwner', 'githubRepo', 'customFolder']);
  const syncedSubs = storage.syncedSubmissions || [];
  
  if (syncedSubs.includes(latestSub.id)) {
    console.log(`LeetSmith: Submission ${latestSub.id} already synced, skipping.`);
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
