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

    // AI intake: extract structured metadata from raw document text
    if (url.pathname === '/api/ai-intake' && request.method === 'POST') {
      if (!env.ANTHROPIC_API_KEY) {
        return new Response(JSON.stringify({ error: 'API key not configured' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }
      try {
        const body = await request.json();
        const { text, type } = body;
        if (!text || !type) {
          return new Response(JSON.stringify({ error: 'Missing text or type' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }

        const TYPE_CONTEXT = {
          research: 'a research paper or academic preprint',
          policy:   'a policy proposal or regulatory framework document',
          legal:    'a legal analysis, case study, or statutory commentary',
          essay:    'an argumentative or idea-driven essay',
          article:  'a timely news article or commentary piece',
          report:   'a comprehensive reference report or review document',
        };

        const prompt = `You are a research librarian for Phronesis Research, a technology law and policy publication. 
Extract structured metadata from the following ${TYPE_CONTEXT[type] || 'document'}.

Document text:
---
${text.slice(0, 6000)}
---

Respond ONLY with a valid JSON object. No preamble, no markdown fences. Include these fields:
{
  "title": "exact title of the piece",
  "subtitle": "one sentence describing the piece",
  "abstract": "2-4 sentence summary in neutral academic language",
  "fields": ["array from: Computer Science, Public Policy, Economics, Mathematics, Philosophy"],
  "tags": ["3-6 specific topic tags"],
  "origin": "original if authored content / via if external source",
  "publisher": "publisher or outlet name if external, or Phronesis Research if original",
  "doi": "DOI if present or null",
  "venue_type": "journal / preprint / working-paper / report / news / null"
}`;

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 800,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (!aiRes.ok) {
          const err = await aiRes.text();
          return new Response(JSON.stringify({ error: 'Anthropic error', detail: err }), {
            status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          });
        }

        const aiData = await aiRes.json();
        const raw = aiData.content?.[0]?.text || '{}';
        // strip accidental markdown fences
        const cleaned = raw.replace(/^```[^\n]*\n?|```$/gm, '').trim();
        const parsed = JSON.parse(cleaned);

        return new Response(JSON.stringify({ ok: true, fields: parsed }), {
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }
    }

    // All other requests: serve static assets
    return env.ASSETS.fetch(request);
  },
};
