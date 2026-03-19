// popup.js - LeetSmith Onboarding & Main Logic

const GITHUB_CLIENT_ID = 'Ov23liGaqJV67v8esSRu';
const VERCEL_AUTH_URL = 'https://leet-smith.vercel.app/api/github-auth';

document.addEventListener('DOMContentLoaded', () => {
  // Views
  const onboardingView = document.getElementById('onboardingView');
  const mainView = document.getElementById('mainView');

  // Elements
  const gitAuthBtn = document.getElementById('gitAuthBtn');
  const authSuccessMsg = document.getElementById('authSuccessMsg');
  const repoSetupSection = document.getElementById('repoSetupSection');
  const repoUrlInput = document.getElementById('githubRepoUrl');
  const customFolderInput = document.getElementById('customFolder');
  
  const finishSetupBtn = document.getElementById('finishSetupBtn');
  const backToMainBtn = document.getElementById('backToMainBtn');
  const syncBtn = document.getElementById('syncNowBtn');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const statusMsg = document.getElementById('statusMessage');

  // Initialization
  chrome.storage.local.get(['githubPat', 'githubOwner', 'githubRepo', 'customFolder'], (items) => {
    if (items.githubPat && items.githubOwner && items.githubRepo) {
      // Fully configured -> Go straight to main view
      showMainView();
    } else {
      // Missing config -> Show onboarding
      showOnboardingView();
      if (items.githubPat) setAuthStateComplete();
    }

    if (items.githubOwner && items.githubRepo) {
      repoUrlInput.value = `https://github.com/${items.githubOwner}/${items.githubRepo}`;
    }
    if (items.customFolder) customFolderInput.value = items.customFolder;
  });

  function showMainView() {
    onboardingView.style.display = 'none';
    mainView.style.display = 'flex';
    statusMsg.className = 'status-msg';
    
    // Fetch rendering stats async
    const statContainer = document.getElementById('forgeStatsContainer');
    const loadingContainer = document.getElementById('forgeStatsLoading');

    chrome.runtime.sendMessage({ type: 'FETCH_STATS' }, (response) => {
      loadingContainer.style.display = 'none';
      if (response && response.success && response.data) {
        const { stats, streak } = response.data;
        statContainer.style.display = 'block';
        
        // Parse the stat array
        let e = 0, m = 0, h = 0, t = 0;
        stats.forEach(s => {
          if (s.difficulty === 'Easy') e = s.count;
          if (s.difficulty === 'Medium') m = s.count;
          if (s.difficulty === 'Hard') h = s.count;
          if (s.difficulty === 'All') t = s.count;
        });

        document.getElementById('statEasy').textContent = e;
        document.getElementById('statMedium').textContent = m;
        document.getElementById('statHard').textContent = h;
        document.getElementById('statTotal').textContent = t;
        document.getElementById('statStreak').textContent = `${streak} Days`;

        // Daily Reminder Logic
        const dailyReminder = document.getElementById('dailyReminder');
        const calendar = JSON.parse(response.data.submissionCalendar || '{}');
        
        // LeetCode uses UTC midnight timestamps as keys
        const now = new Date();
        const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
        const submissionsToday = calendar[utcMidnight.toString()] || 0;

        dailyReminder.style.display = 'block';
        if (submissionsToday > 0) {
          dailyReminder.textContent = "The forge is roaring! Keep tempering that steel.";
          dailyReminder.classList.add('roaring');
        } else {
          dailyReminder.textContent = "The forge is cold today. Stoke the fire with a solution!";
          dailyReminder.classList.remove('roaring');
        }
      } else {
        showStatus('Could not load LeetCode Forge Stats.', 'error');
      }
    });
  }

  function showOnboardingView() {
    mainView.style.display = 'none';
    onboardingView.style.display = 'flex';
    statusMsg.className = 'status-msg';

    // Show back button if already configured
    chrome.storage.local.get(['githubPat', 'githubOwner', 'githubRepo'], (items) => {
      if (items.githubPat && items.githubOwner && items.githubRepo) {
        backToMainBtn.style.display = 'block';
      } else {
        backToMainBtn.style.display = 'none';
      }
    });
  }

  backToMainBtn.addEventListener('click', showMainView);

  function setAuthStateComplete() {
    gitAuthBtn.style.display = 'none';
    authSuccessMsg.style.display = 'block';
    
    // Unlock the rest of the form
    repoSetupSection.style.opacity = '1';
    repoSetupSection.style.pointerEvents = 'auto';
  }

  // OAUTH Logic
  gitAuthBtn.addEventListener('click', () => {
    gitAuthBtn.textContent = 'Forging Connection...';
    gitAuthBtn.disabled = true;

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo`;

    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Cancelled by user';
        console.error("OAuth Error:", errorMsg);
        gitAuthBtn.textContent = '⛓️ Connect to GitHub';
        gitAuthBtn.disabled = false;
        showStatus('OAuth Flow failed: ' + errorMsg, 'error');
        return;
      }

      const urlParams = new URLSearchParams(new URL(responseUrl).search);
      const code = urlParams.get('code');

      if (!code) {
        gitAuthBtn.textContent = '⛓️ Connect to GitHub';
        gitAuthBtn.disabled = false;
        showStatus('No auth code returned from GitHub.', 'error');
        return;
      }

      gitAuthBtn.textContent = 'Tempering Token...';

      try {
        const res = await fetch(VERCEL_AUTH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        
        const data = await res.json();
        if (data.access_token) {
          chrome.storage.local.set({ githubPat: data.access_token }, () => {
            setAuthStateComplete();
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

  // Finish Setup Logic / Repo Parsing
  finishSetupBtn.addEventListener('click', () => {
    const rawUrl = repoUrlInput.value.trim();
    if (!rawUrl) {
      showStatus('Repository URL is required to forge solutions.', 'error');
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

    chrome.storage.local.get(['githubPat'], (items) => {
      if (!items.githubPat) {
        showStatus('Please Connect to GitHub first.', 'error');
        return;
      }

      chrome.storage.local.set(config, () => {
        showStatus('Settings saved!', 'success');
        setTimeout(showMainView, 1000);
      });
    });
  });

  // Return to Setup (Reconfigure)
  openSettingsBtn.addEventListener('click', showOnboardingView);

  // Manual Sync
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = 'Forging...';
    statusMsg.className = 'status-msg';
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url.includes('leetcode.com/problems/')) {
      showStatus('You must be on a LeetCode problem page.', 'error');
      syncBtn.disabled = false;
      syncBtn.textContent = 'Forge Current Problem';
      return;
    }

    chrome.storage.local.get(['githubPat', 'githubOwner', 'githubRepo'], (items) => {
      if (!items.githubPat || !items.githubOwner || !items.githubRepo) {
        showStatus('Please complete setup first.', 'error');
        showOnboardingView();
        syncBtn.disabled = false;
        syncBtn.textContent = 'Forge Current Problem';
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_SYNC' }, (response) => {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Forge Current Problem';
        
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
    setTimeout(() => { statusMsg.className = 'status-msg'; }, type === 'success' ? 4000 : 7000);
  }
});
