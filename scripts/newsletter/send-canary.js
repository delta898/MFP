#!/usr/bin/env node
'use strict';

const { randomUUID } = require('node:crypto');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendCanary(env = process.env, { fetcher = fetch, wait = sleep, signalId = randomUUID(), attempts = 60 } = {}) {
  const environment = String(env.BLOGGENIUS_ENV || '').trim();
  const expectedMode = environment === 'development' || environment === 'production' ? 'disabled' : '';
  const apiUrl = String(env.BLOGGENIUS_TRENDS_API_URL || '').trim().replace(/\/+$/, '');
  const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const secretKey = String(env.TRENDS_SUPABASE_SECRET_KEY || '').trim();
  const canaryToken = String(env.TRENDS_NEWSLETTER_CANARY_TOKEN || '').trim();
  const newsletterToken = String(env.TRENDS_NEWSLETTER_WORKER_TOKEN || '').trim();
  const releaseSha = String(env.NEWSLETTER_RELEASE_SHA || '').trim().toLowerCase();
  const deploymentId = String(env.NEWSLETTER_DEPLOYMENT_ID || '').trim();
  const expectedApi = environment === 'development' ? 'https://trendapi-dev.bloggenius.kr' : 'https://trendapi.bloggenius.kr';
  if (!expectedMode || apiUrl !== expectedApi || !/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(supabaseUrl)
      || !secretKey || !canaryToken || !newsletterToken || !/^[0-9a-f]{40}$/.test(releaseSha)
      || !/^[0-9a-f-]{36}$/.test(deploymentId)) throw new Error('Canary environment configuration is incomplete or inconsistent.');

  const auth = { authorization: `Bearer ${newsletterToken}`, 'content-type': 'application/json' };
  const modeResponse = await fetcher(`${supabaseUrl}/functions/v1/trends-mailing-list`, {
    method: 'POST', headers: auth, body: JSON.stringify({ action: 'delivery_mode' })
  });
  if (!modeResponse.ok) throw new Error(`Newsletter mode check failed with HTTP ${modeResponse.status}.`);
  const mode = await modeResponse.json();
  if (mode.success !== true || mode.environment !== environment || mode.mode !== expectedMode || mode.deploymentId !== deploymentId) {
    throw new Error(`Newsletter mode/deployment identity did not match the expected ${environment} canary state.`);
  }

  const latestResponse = await fetcher(`${supabaseUrl}/rest/v1/items?select=trend_date&source=eq.naver_creator_advisor&order=trend_date.desc&limit=1`, {
    headers: { apikey: secretKey, authorization: `Bearer ${secretKey}`, 'accept-profile': 'trends' }
  });
  if (!latestResponse.ok) throw new Error(`Latest trend date lookup failed with HTTP ${latestResponse.status}.`);
  const rows = await latestResponse.json();
  const trendDate = rows?.[0]?.trend_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(trendDate || ''))) throw new Error('No valid trend date is available for the canary.');

  const startResponse = await fetcher(`${apiUrl}/internal/newsletter/canary`, {
    method: 'POST', headers: { authorization: `Bearer ${canaryToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ trendDate, signalId, releaseSha })
  });
  if (!startResponse.ok) throw new Error(`Newsletter canary trigger failed with HTTP ${startResponse.status}.`);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetcher(`${apiUrl}/internal/newsletter/canary/${signalId}/status`, {
      headers: { authorization: `Bearer ${canaryToken}` }
    });
    if (response.status === 200) {
      const body = await response.json();
      if (body.status === 'errored' || body.status === 'terminated') throw new Error('Newsletter canary Workflow failed.');
      if (body.status === 'complete') {
        const result = body.result;
        if (result?.canaryStatus !== 'sent' || result.environment !== environment || result.trendDate !== trendDate
            || result.releaseSha !== releaseSha || result.deploymentId !== deploymentId) {
          throw new Error('Newsletter canary did not confirm the expected send and deployed release.');
        }
        return { environment, trendDate, signalId, deploymentId };
      }
    } else if (response.status !== 404) {
      throw new Error(`Newsletter canary status check failed with HTTP ${response.status}.`);
    }
    if (attempt + 1 < attempts) await wait(5000);
  }
  throw new Error('Newsletter canary did not complete within five minutes.');
}

if (require.main === module) {
  sendCanary().then((result) => console.log(JSON.stringify({ event: 'newsletter_canary_sent', ...result })))
    .catch((error) => { console.error(`[Newsletter canary] ${error.message}`); process.exitCode = 1; });
}

module.exports = { sendCanary };
