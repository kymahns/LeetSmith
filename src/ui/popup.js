// popup.js - Unified LeetSmith Popup Logic

// ==========================================
// ⚠️ REPLACE THIS WITH YOUR OAUTH CLIENT ID
// ==========================================
const GITHUB_CLIENT_ID = 'Ov23liGaqJV67v8esSRu';
const VERCEL_AUTH_URL = 'https://leet-smith-57wr8j8o0-nams-projects-e7f51bf4.vercel.app/api/github-auth';

document.addEventListener('DOMContentLoaded', () => {
  // Views
  const mainView = document.getElementById('mainView');
  const settingsView = document.getElementById('settingsView');

  // Main buttons
  const syncBtn = document.getElementById('syncNowBtn');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const statusMsg = document.getElementById('statusMessage');

  // Settings elements
  const gitAuthBtn = document.getElementById('gitAuthBtn');
  const authSuccessMsg = document.getElementById('authSuccessMsg');
  const repoUrlInput = document.getElementById('githubRepoUrl');
  const customFolderInput = document.getElementById('customFolder');
  const saveBtn = document.getElementById('saveBtn');
  const backBtn = document.getElementById('backBtn');

  // Load existing settings
  chrome.storage.local.get(['githubPat', 'githubOwner', 'githubRepo', 'customFolder'], (items) => {
    if (items.githubPat) {
      gitAuthBtn.style.display = 'none';
      authSuccessMsg.style.display = 'block';
    }
    if (items.githubOwner && items.githubRepo) {
      repoUrlInput.value = `https://github.com/${items.githubOwner}/${items.githubRepo}`;
    }
    if (items.customFolder) customFolderInput.value = items.customFolder;
  });

  // Navigation Logic
  openSettingsBtn.addEventListener('click', () => {
    mainView.style.display = 'none';
    settingsView.style.display = 'flex';
    statusMsg.className = 'status-msg'; // clear errors
  });

  backBtn.addEventListener('click', () => {
    settingsView.style.display = 'none';
    mainView.style.display = 'flex';
    statusMsg.className = 'status-msg';
  });

  // OAUTH: Connect to GitHub
  gitAuthBtn.addEventListener('click', () => {
    if (GITHUB_CLIENT_ID === 'YOUR_GITHUB_CLIENT_ID_HERE') {
      showStatus('Developer Error: Client ID not configured in popup.js', 'error');
      return;
    }

    gitAuthBtn.textContent = 'Connecting...';
    gitAuthBtn.disabled = true;

    const redirectUri = chrome.identity.getRedirectURL();
    console.log("LeetSmith Redirect URI:", redirectUri);

    // We must pass the exact redirectUri to GitHub. If this does not perfectly match the 
    // "Authorization callback URL" in GitHub Developer Settings, GitHub will throw a 400 error
    // which Chrome catches as "Authorization page could not be loaded."
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo`;

    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Cancelled by user';
        console.error("OAuth Error:", errorMsg);
        gitAuthBtn.textContent = '⛓️ Connect to GitHub';
        gitAuthBtn.disabled = false;
        showStatus('OAuth Flow failed: ' + errorMsg, 'error');
        return;
      }

      // Extract "code=" from url
      const urlParams = new URLSearchParams(new URL(responseUrl).search);
      const code = urlParams.get('code');

      if (!code) {
        gitAuthBtn.textContent = '⛓️ Connect to GitHub';
        gitAuthBtn.disabled = false;
        showStatus('No auth code returned from GitHub.', 'error');
        return;
      }

      gitAuthBtn.textContent = 'Verifying...';

      // Exchange code via Vercel Backend
      try {
        const res = await fetch(VERCEL_AUTH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        
        const data = await res.json();
        
        if (data.access_token) {
          // Success! Save it to storage.
          chrome.storage.local.set({ githubPat: data.access_token }, () => {
            gitAuthBtn.style.display = 'none';
            authSuccessMsg.style.display = 'block';
            showStatus('GitHub Account Linked!', 'success');
          });
        } else {
          throw new Error(data.error || 'Failed to exchange token');
        }
      } catch (err) {
        gitAuthBtn.textContent = '⛓️ Connect to GitHub';
        gitAuthBtn.disabled = false;
        console.error(err);
        showStatus('Verification Failed.', 'error');
      }
    });
  });

  // Settings Save Logic
  saveBtn.addEventListener('click', () => {
    const rawUrl = repoUrlInput.value.trim();
    if (!rawUrl) {
      showStatus('Repository URL is required.', 'error');
      return;
    }

    let owner = '', repo = '';
    try {
      let urlToParse = rawUrl.startsWith('http') ? rawUrl : `https://github.com/${rawUrl}`;
      const parsed = new URL(urlToParse);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length < 2) throw new Error();
      owner = parts[0];
      repo = parts[1].replace('.git', '');
    } catch {
      showStatus('Invalid GitHub Repository URL. Example: https://github.com/user/repo', 'error');
      return;
    }

    const config = {
      githubOwner: owner,
      githubRepo: repo,
      customFolder: customFolderInput.value.trim()
    };

    // Ensure they have authenticated
    chrome.storage.local.get(['githubPat'], (items) => {
      if (!items.githubPat) {
        showStatus('Please Connect to GitHub first.', 'error');
        return;
      }

      chrome.storage.local.set(config, () => {
        showStatus('Settings saved!', 'success');
        setTimeout(() => {
          settingsView.style.display = 'none';
          mainView.style.display = 'flex';
        }, 1000);
      });
    });
  });

  // Sync Logic
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Forging...';
    statusMsg.className = 'status-msg';
    
    // Query active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url.includes('leetcode.com/problems/')) {
      showStatus('You must be on a LeetCode problem page.', 'error');
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync Current Problem';
      return;
    }

    // Check if configuration exists before trying to sync
    chrome.storage.local.get(['githubPat', 'githubOwner', 'githubRepo'], (items) => {
      if (!items.githubPat || !items.githubOwner || !items.githubRepo) {
        showStatus('Please configure Settings first.', 'error');
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync Current Problem';
        return;
      }

      // Ping the content script to trigger sync
      chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_SYNC' }, (response) => {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync Current Problem';
        
        if (chrome.runtime.lastError) {
          showStatus('Please refresh the LeetCode page and try again.', 'error');
          return;
        }

        if (response && response.success) {
          showStatus(response.message, 'success');
        } else {
          showStatus(response ? response.error : 'Unknown error.', 'error');
        }
      });
    });
  });

  function showStatus(text, type) {
    statusMsg.textContent = text;
    statusMsg.className = `status-msg ${type}`;
    // clear after showing
    setTimeout(() => { statusMsg.className = 'status-msg'; }, type === 'success' ? 4000 : 7000);
  }
});
