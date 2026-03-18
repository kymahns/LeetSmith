// githubApi.js - Handles communication with GitHub REST API

const GITHUB_API_URL = 'https://api.github.com';

/**
 * Base fetch wrapper for GitHub API requests to handle auth.
 */
async function githubFetch(url, pat, options = {}) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `token ${pat}`,
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  const response = await fetch(`${GITHUB_API_URL}${url}`, { ...options, headers });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API Error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

/**
 * Checks if a file exists in the repo and returns its SHA (needed for updates).
 * Returns null if the file doesn't exist.
 */
export async function getFileSha(owner, repo, path, pat) {
  try {
    const response = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${path}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${pat}`
      }
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Failed to check file: ${response.statusText}`);
    
    const data = await response.json();
    return data.sha || null;
  } catch (err) {
    if (err.message.includes('404')) return null;
    throw err;
  }
}

/**
 * Creates or updates a file in the GitHub repository.
 */
export async function commitFile(owner, repo, path, content, commitMessage, pat) {
  // Convert content to Base64 (handling UTF-8 correctly)
  // btoa() struggles with non-ascii characters, so we handle it:
  const base64Content = btoa(unescape(encodeURIComponent(content)));
  
  // Check if file exists so we can update it
  const sha = await getFileSha(owner, repo, path, pat);
  
  const body = {
    message: commitMessage,
    content: base64Content
  };
  
  if (sha) {
    body.sha = sha;
  }

  return githubFetch(`/repos/${owner}/${repo}/contents/${path}`, pat, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}
