// Username OSINT Investigation Provider
// Checks public profiles across top developer, community, and content platforms
// Uses legitimate public APIs and non-intrusive public endpoint probes.

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        ...(options.headers || {})
      }
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function checkGitHub(username) {
  const targetUrl = `https://github.com/${username}`;
  try {
    const res = await fetchWithTimeout(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (res.status === 200) {
      const data = await res.json();
      return {
        platform: 'GitHub',
        status: 'confirmed',
        confidence: 'Confirmed',
        url: targetUrl,
        httpStatus: 200,
        metadata: {
          name: data.name || null,
          bio: data.bio || null,
          blog: data.blog || null,
          company: data.company || null,
          publicRepos: data.public_repos,
          followers: data.followers,
          createdAt: data.created_at
        },
        observation: `Active public GitHub profile. ${data.public_repos} public repositories, ${data.followers} followers.`,
        collectionMethod: 'Public REST API (api.github.com)'
      };
    } else if (res.status === 404) {
      return { platform: 'GitHub', status: 'not_found', confidence: 'Confirmed', url: targetUrl, httpStatus: 404, observation: 'Account not found.' };
    }
  } catch (err) {
    return { platform: 'GitHub', status: 'unavailable', confidence: 'Unverified', url: targetUrl, observation: 'Request timed out or rate limited.' };
  }
  return { platform: 'GitHub', status: 'not_found', confidence: 'Moderate', url: targetUrl };
}

async function checkGitLab(username) {
  const targetUrl = `https://gitlab.com/${username}`;
  try {
    const res = await fetchWithTimeout(`https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`);
    if (res.status === 200) {
      const users = await res.json();
      if (Array.isArray(users) && users.length > 0) {
        const u = users[0];
        return {
          platform: 'GitLab',
          status: 'confirmed',
          confidence: 'Confirmed',
          url: targetUrl,
          httpStatus: 200,
          metadata: { name: u.name, id: u.id, webUrl: u.web_url },
          observation: `Confirmed public GitLab profile (${u.name || username}).`,
          collectionMethod: 'Public REST API (gitlab.com/api/v4)'
        };
      }
      return { platform: 'GitLab', status: 'not_found', confidence: 'Confirmed', url: targetUrl, httpStatus: 200, observation: 'Username not registered on GitLab.' };
    }
  } catch (err) {
    return { platform: 'GitLab', status: 'unavailable', confidence: 'Unverified', url: targetUrl, observation: 'GitLab API unavailable.' };
  }
  return { platform: 'GitLab', status: 'not_found', confidence: 'Moderate', url: targetUrl };
}

async function checkReddit(username) {
  const targetUrl = `https://www.reddit.com/user/${username}`;
  try {
    const res = await fetchWithTimeout(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`);
    if (res.status === 200) {
      const data = await res.json();
      if (data && data.data && data.data.name) {
        const d = data.data;
        return {
          platform: 'Reddit',
          status: 'confirmed',
          confidence: 'Confirmed',
          url: targetUrl,
          httpStatus: 200,
          metadata: {
            totalKarma: d.total_karma,
            commentKarma: d.comment_karma,
            linkKarma: d.link_karma,
            createdUtc: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
            isSuspended: d.is_suspended || false
          },
          observation: `Confirmed Reddit user with ${d.total_karma || 0} total karma.`,
          collectionMethod: 'Public JSON Endpoint (reddit.com/user/about.json)'
        };
      }
    } else if (res.status === 404) {
      return { platform: 'Reddit', status: 'not_found', confidence: 'Confirmed', url: targetUrl, httpStatus: 404, observation: 'Reddit user not found.' };
    }
  } catch (err) {
    return { platform: 'Reddit', status: 'unavailable', confidence: 'Unverified', url: targetUrl, observation: 'Reddit check timed out.' };
  }
  return { platform: 'Reddit', status: 'not_found', confidence: 'Moderate', url: targetUrl };
}

async function checkDevTo(username) {
  const targetUrl = `https://dev.to/${username}`;
  try {
    const res = await fetchWithTimeout(`https://dev.to/api/users/by_username?url=${encodeURIComponent(username)}`);
    if (res.status === 200) {
      const data = await res.json();
      if (data && data.username) {
        return {
          platform: 'Dev.to',
          status: 'confirmed',
          confidence: 'Confirmed',
          url: targetUrl,
          httpStatus: 200,
          metadata: { name: data.name, summary: data.summary, website: data.website_url, joinedAt: data.joined_at },
          observation: `Confirmed Dev.to developer account: "${data.name || username}".`,
          collectionMethod: 'Public REST API (dev.to/api)'
        };
      }
    } else if (res.status === 404) {
      return { platform: 'Dev.to', status: 'not_found', confidence: 'Confirmed', url: targetUrl, httpStatus: 404, observation: 'Dev.to user not found.' };
    }
  } catch (err) {
    return { platform: 'Dev.to', status: 'unavailable', confidence: 'Unverified', url: targetUrl, observation: 'Dev.to check timed out.' };
  }
  return { platform: 'Dev.to', status: 'not_found', confidence: 'Moderate', url: targetUrl };
}

async function checkHackerNews(username) {
  const targetUrl = `https://news.ycombinator.com/user?id=${username}`;
  try {
    const res = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(username)}.json`);
    if (res.status === 200) {
      const data = await res.json();
      if (data && data.id) {
        return {
          platform: 'Hacker News',
          status: 'confirmed',
          confidence: 'Confirmed',
          url: targetUrl,
          httpStatus: 200,
          metadata: { karma: data.karma, created: data.created ? new Date(data.created * 1000).toISOString() : null, about: data.about || null },
          observation: `Confirmed Hacker News account with ${data.karma} karma.`,
          collectionMethod: 'Official Firebase REST API'
        };
      }
      return { platform: 'Hacker News', status: 'not_found', confidence: 'Confirmed', url: targetUrl, observation: 'Hacker News user not found.' };
    }
  } catch (err) {
    return { platform: 'Hacker News', status: 'unavailable', confidence: 'Unverified', url: targetUrl, observation: 'HN API timed out.' };
  }
  return { platform: 'Hacker News', status: 'not_found', confidence: 'Moderate', url: targetUrl };
}

async function checkGenericProfile(platform, targetUrl, notFoundIndicator) {
  try {
    const res = await fetchWithTimeout(targetUrl, { method: 'GET' });
    if (res.status === 200) {
      const html = await res.text();
      if (notFoundIndicator && html.includes(notFoundIndicator)) {
        return { platform, status: 'not_found', confidence: 'High confidence', url: targetUrl, httpStatus: 200, observation: 'Profile page returned not-found indicator.' };
      }
      return {
        platform,
        status: 'possible',
        confidence: 'Moderate confidence',
        url: targetUrl,
        httpStatus: 200,
        observation: `Public URL returned HTTP 200 OK. Verification requires manual or authenticated probe.`,
        collectionMethod: 'HTTP GET Probe'
      };
    } else if (res.status === 404) {
      return { platform, status: 'not_found', confidence: 'Confirmed', url: targetUrl, httpStatus: 404, observation: 'Profile URL returned HTTP 404.' };
    }
  } catch (err) {
    return { platform, status: 'unavailable', confidence: 'Unverified', url: targetUrl, observation: 'Target host connection failed or timed out.' };
  }
  return { platform, status: 'possible', confidence: 'Low confidence', url: targetUrl };
}

async function investigateUsername(username) {
  const cleanUsername = username.replace(/^@/, '').trim();
  const timestamp = new Date().toISOString();

  // Run platform checks concurrently with Promise.allSettled
  const results = await Promise.allSettled([
    checkGitHub(cleanUsername),
    checkGitLab(cleanUsername),
    checkReddit(cleanUsername),
    checkDevTo(cleanUsername),
    checkHackerNews(cleanUsername),
    checkGenericProfile('Medium', `https://medium.com/@${cleanUsername}`, 'Out of the ordinary'),
    checkGenericProfile('Stack Overflow', `https://stackoverflow.com/users/${cleanUsername}`, 'Page Not Found'),
    checkGenericProfile('X (Twitter)', `https://x.com/${cleanUsername}`, 'This account doesn’t exist'),
    checkGenericProfile('YouTube', `https://www.youtube.com/@${cleanUsername}`, 'This page isn\'t available'),
    checkGenericProfile('Pinterest', `https://www.pinterest.com/${cleanUsername}/`, 'Oops! We couldn\'t find that page'),
    checkGenericProfile('LinkedIn', `https://www.linkedin.com/in/${cleanUsername}/`, 'Page not found')
  ]);

  const findings = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      findings.push({
        ...r.value,
        timestamp,
        source: r.value.platform,
        sourceUrl: r.value.url
      });
    }
  }

  return {
    target: cleanUsername,
    type: 'username',
    timestamp,
    findings
  };
}

module.exports = {
  investigateUsername
};
