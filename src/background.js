// background.js - Service worker for LeetSmith
import { fetchLatestSubmission, fetchSubmissionDetails, fetchQuestionData } from './lib/leetcodeApi.js';
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
  }
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  // 2. Fetch code and question data
  const [details, question] = await Promise.all([
    fetchSubmissionDetails(latestSub.id),
    fetchQuestionData(slug)
  ]);

  if (!details || !question) {
    throw new Error('Failed to retrieve full submission details or question data.');
  }

  // 3. Prepare Config
  const storage = await chrome.storage.local.get(['githubPat', 'githubOwner', 'githubRepo', 'customFolder']);
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

  // 5. Commit to GitHub
  console.log(`LeetSmith: Pushing to GitHub -> ${solutionPath}`);
  
  try {
    await commitFile(
      githubOwner, githubRepo, solutionPath,
      solutionContent, `Sync solution for ${question.title}`, githubPat
    );

    // Commit README as well
    await commitFile(
      githubOwner, githubRepo, readmePath,
      readmeContent, `Add problem description for ${question.title}`, githubPat
    );
  } catch (error) {
    console.error('LeetSmith: Failed to commit to GitHub', error);
    throw new Error('Failed to commit to GitHub. Check your PAT and Repo settings.');
  }

  return { success: true, message: `Successfully synced ${question.title} to GitHub!` };
}
