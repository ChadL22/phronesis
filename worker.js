const SANITY_QUERY = `*[_type == "policy_action" && !(_id in path("drafts.**"))]{category, country, dateInitiated, lastUpdate, _id, slug, status, title, relatedTopics[]->{_id, name, slug, displayName}, type}|order(lastUpdate desc)`;
const SANITY_URL = `https://3tzzh18d.api.sanity.io/v2023-05-03/data/query/production?query=${encodeURIComponent(SANITY_QUERY)}`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Proxy route: /api/tracker
    if (url.pathname === '/api/tracker') {
      try {
        const upstream = await fetch(SANITY_URL, {
          headers: { 'Accept': 'application/json' },
          cf: { cacheTtl: 3600, cacheEverything: true },
        });

        if (!upstream.ok) {
          return new Response(JSON.stringify({ error: 'Upstream error', status: upstream.status }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }

        const data = await upstream.json();
        return new Response(JSON.stringify(data), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            ...CORS_HEADERS,
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }
    }

    // All other requests: serve static assets
    return env.ASSETS.fetch(request);
  },
};
