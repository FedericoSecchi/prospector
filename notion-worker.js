/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          KOSMOS PROSPECTOR — Cloudflare Worker → Notion API         ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║                                                                      ║
 * ║  DEPLOYMENT INSTRUCTIONS (step by step)                             ║
 * ║  ─────────────────────────────────────                              ║
 * ║  1. Go to https://dash.cloudflare.com and log in (free account OK)  ║
 * ║                                                                      ║
 * ║  2. In the sidebar click "Workers & Pages" → "Create"               ║
 * ║     → "Create Worker" → give it a name (e.g. "kosmos-notion")       ║
 * ║     → click "Deploy" (the default Hello World code is fine for now) ║
 * ║                                                                      ║
 * ║  3. On the next screen click "Edit code", then paste the entire     ║
 * ║     contents of this file, replacing the existing code.             ║
 * ║     Click "Deploy" again.                                           ║
 * ║                                                                      ║
 * ║  4. Go back to the Worker's overview page → "Settings" tab          ║
 * ║     → "Variables" → "Environment Variables" → Add the following:    ║
 * ║                                                                      ║
 * ║       NOTION_TOKEN  →  secret_xxxxxxxxxxxxxxxxxxxx                  ║
 * ║         (your Notion Internal Integration Token — keep it secret!)  ║
 * ║                                                                      ║
 * ║       NOTION_DB_ID  →  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx             ║
 * ║         (32-char ID from your Notion database URL)                  ║
 * ║                                                                      ║
 * ║  5. To get your Notion token:                                        ║
 * ║       https://www.notion.so/my-integrations → "New integration"     ║
 * ║       → give it a name → copy the "Internal Integration Token"      ║
 * ║                                                                      ║
 * ║  6. To get your Notion database ID:                                  ║
 * ║       Open the database in Notion → copy the URL.                   ║
 * ║       The ID is the part after the last "/" and before "?":         ║
 * ║       notion.so/My-DB-<DATABASE_ID>?v=...                           ║
 * ║                                                                      ║
 * ║  7. Share your Notion database with the integration:                ║
 * ║       Open database in Notion → "..." menu → "Add connections"      ║
 * ║       → select your integration                                      ║
 * ║                                                                      ║
 * ║  8. Copy your Worker's URL (looks like:                             ║
 * ║       https://kosmos-notion.your-subdomain.workers.dev)             ║
 * ║     Paste it as the "Cloudflare Worker URL" in the app's Settings.  ║
 * ║                                                                      ║
 * ║  Your Notion database must have these exact property names/types:   ║
 * ║    • Negocio    → Title                                             ║
 * ║    • Teléfono   → Phone number                                      ║
 * ║    • Rubro      → Rich text                                         ║
 * ║    • Ciudad     → Rich text                                         ║
 * ║    • Estado     → Select  (with option "Contactado")                ║
 * ║    • Agente     → Select  (with options "Soledad", "Silvina", etc.) ║
 * ║    • Fecha      → Date                                              ║
 * ║    • Sitio web  → URL                                               ║
 * ║    • Rating     → Rich text                                         ║
 * ║                                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { nombre, telefono, rubro, ciudad, agente, sitio_web, rating } = body;

    if (!nombre) {
      return new Response(JSON.stringify({ error: 'nombre is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const todayISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Build Notion page properties
    const properties = {
      'Negocio': {
        title: [{ text: { content: nombre || '' } }],
      },
      'Teléfono': {
        phone_number: telefono || null,
      },
      'Rubro': {
        rich_text: [{ text: { content: rubro || '' } }],
      },
      'Ciudad': {
        rich_text: [{ text: { content: ciudad || '' } }],
      },
      'Estado': {
        select: { name: 'Contactado' },
      },
      'Agente': {
        select: { name: agente || 'Kosmos' },
      },
      'Fecha': {
        date: { start: todayISO },
      },
    };

    // Only add Sitio web if provided and non-empty
    if (sitio_web && sitio_web.trim()) {
      properties['Sitio web'] = { url: sitio_web.trim() };
    }

    // Only add Rating if provided and non-empty
    if (rating && String(rating).trim()) {
      properties['Rating'] = {
        rich_text: [{ text: { content: String(rating).trim() } }],
      };
    }

    try {
      const notionRes = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: env.NOTION_DB_ID },
          properties,
        }),
      });

      if (!notionRes.ok) {
        const errText = await notionRes.text();
        return new Response(JSON.stringify({ error: 'Notion API error', details: errText }), {
          status: notionRes.status,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Worker fetch error', details: String(err) }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },
};
