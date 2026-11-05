'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sendCanary } = require('./send-canary');

function fixture(environment = 'development') {
  return {
    BLOGGENIUS_ENV: environment,
    BLOGGENIUS_TRENDS_API_URL: environment === 'development' ? 'https://trendapi-dev.bloggenius.kr' : 'https://trendapi.bloggenius.kr',
    SUPABASE_URL: `https://${environment === 'development' ? 'bvtlwjbmjnfphxlrkzhm' : 'hocfjolcthvtgfaxjmse'}.supabase.co`,
    TRENDS_SUPABASE_SECRET_KEY: 'service-secret',
    TRENDS_NEWSLETTER_CANARY_TOKEN: 'canary-token',
    TRENDS_NEWSLETTER_WORKER_TOKEN: 'newsletter-token',
    NEWSLETTER_RELEASE_SHA: 'a'.repeat(40),
    NEWSLETTER_DEPLOYMENT_ID: '123e4567-e89b-42d3-a456-426614174000'
  };
}

test('sends a fixed-recipient canary flow only after matching environment policy and deployment identity', async () => {
  const requests = [];
  const result = await sendCanary(fixture(), {
    signalId: 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9',
    wait: async () => {},
    fetcher: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).endsWith('/functions/v1/trends-mailing-list')) {
        return Response.json({ success: true, environment: 'development', mode: 'disabled', deploymentId: fixture().NEWSLETTER_DEPLOYMENT_ID });
      }
      if (String(url).includes('/rest/v1/items?')) return Response.json([{ trend_date: '2026-11-05' }]);
      if (String(url).endsWith('/internal/newsletter/canary')) return Response.json({ success: true, accepted: true }, { status: 202 });
      return Response.json({ success: true, status: 'complete', result: {
        environment: 'development', trendDate: '2026-11-05', canaryStatus: 'sent',
        releaseSha: fixture().NEWSLETTER_RELEASE_SHA, deploymentId: fixture().NEWSLETTER_DEPLOYMENT_ID
      } });
    }
  });
  assert.deepEqual(result, { environment: 'development', trendDate: '2026-11-05', signalId: 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9', deploymentId: fixture().NEWSLETTER_DEPLOYMENT_ID });
  assert.equal(requests.length, 4);
  assert.equal(requests[2].options.headers.authorization, 'Bearer canary-token');
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    trendDate: '2026-11-05', signalId: 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9', releaseSha: 'a'.repeat(40)
  });
  assert.equal('email' in JSON.parse(requests[2].options.body), false);
});

test('refuses a canary when the environment delivery mode is not the safe configured mode', async () => {
  let calls = 0;
  await assert.rejects(sendCanary(fixture('production'), {
    fetcher: async () => { calls += 1; return Response.json({ success: true, environment: 'production', mode: 'live', deploymentId: fixture().NEWSLETTER_DEPLOYMENT_ID }); }
  }), /expected production canary state/);
  assert.equal(calls, 1);
});

test('refuses to activate Production live mode when the canary reports an unsuccessful send', async () => {
  const calls = [];
  await assert.rejects(sendCanary(fixture('production'), {
    signalId: 'f53d0eb8-93d5-4d4a-82b6-2392d13c22f9', wait: async () => {},
    fetcher: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith('/functions/v1/trends-mailing-list')) return Response.json({ success: true, environment: 'production', mode: 'disabled', deploymentId: fixture().NEWSLETTER_DEPLOYMENT_ID });
      if (String(url).includes('/rest/v1/items?')) return Response.json([{ trend_date: '2026-11-05' }]);
      if (String(url).endsWith('/internal/newsletter/canary')) return Response.json({ success: true }, { status: 202 });
      return Response.json({ success: true, status: 'complete', result: { environment: 'production', trendDate: '2026-11-05', canaryStatus: 'failed', releaseSha: 'a'.repeat(40), deploymentId: fixture().NEWSLETTER_DEPLOYMENT_ID } });
    }
  }), /did not confirm the expected send/);
  assert.equal(calls.length, 4);
});
