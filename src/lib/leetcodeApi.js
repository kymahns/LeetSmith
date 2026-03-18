// leetcodeApi.js - Handles communication with LeetCode GraphQL

const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';

/**
 * Fetch the latest submission for a given problem slug.
 */
export async function fetchLatestSubmission(slug) {
  const query = `
    query submissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
      submissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
        submissions {
          id
          statusDisplay
          lang
          timestamp
        }
      }
    }
  `;

  const variables = { offset: 0, limit: 1, questionSlug: slug };

  try {
    const response = await fetch(LEETCODE_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    const data = await response.json();
    return data?.data?.submissionList?.submissions?.[0] || null;
  } catch (error) {
    console.error('LeetSmith: Error fetching latest submission', error);
    throw error;
  }
}

/**
 * Fetch the details (including code) of a specific submission.
 */
export async function fetchSubmissionDetails(submissionId) {
  const query = `
    query submissionDetails($submissionId: Int!) {
      submissionDetails(submissionId: $submissionId) {
        code
        timestamp
        statusCode
        runtimeDisplay
        runtimePercentile
        memoryDisplay
        memoryPercentile
        lang {
          name
          verboseName
        }
        question {
          questionId
        }
      }
    }
  `;

  const variables = { submissionId };

  try {
    const response = await fetch(LEETCODE_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    const data = await response.json();
    return data?.data?.submissionDetails || null;
  } catch (error) {
    console.error('LeetSmith: Error fetching submission details', error);
    throw error;
  }
}

/**
 * Fetch the full question data to build the README.md
 */
export async function fetchQuestionData(slug) {
  const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        titleSlug
        content
        difficulty
      }
    }
  `;

  const variables = { titleSlug: slug };

  try {
    const response = await fetch(LEETCODE_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    const data = await response.json();
    return data?.data?.question || null;
  } catch (error) {
    console.error('LeetSmith: Error fetching question data', error);
    throw error;
  }
}

/**
 * Fetch the user's global profile stats
 */
export async function fetchUserStats() {
  try {
    // 1. Get identity
    const globalRes = await fetch(LEETCODE_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `query { userStatus { username } }` })
    });
    const globalData = await globalRes.json();
    const username = globalData?.data?.userStatus?.username;
    
    if (!username) return null;

    // 2. Fetch stats and streak
    const statsQuery = `
      query userProfileStats($username: String!) {
        matchedUser(username: $username) {
          submitStats: submitStatsGlobal {
            acSubmissionNum {
              difficulty
              count
            }
          }
          userCalendar {
            streak
          }
        }
      }
    `;

    const statsRes = await fetch(LEETCODE_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: statsQuery, variables: { username } })
    });
    const statsData = await statsRes.json();
    const user = statsData?.data?.matchedUser;

    return {
      stats: user?.submitStats?.acSubmissionNum || [],
      streak: user?.userCalendar?.streak || 0
    };
  } catch (err) {
    console.error('LeetSmith: Error fetching user stats', err);
    return null;
  }
}
