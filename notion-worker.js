/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║          KOSMOS PROSPECTOR — Cloudflare Worker → Notion API         ║
 * ╠══════════════════════════════════════════════════════════════════════╣
 * ║                                                                      ║
 * ║  DEPLOYMENT INSTRUCTIONS (step by step)                             ║
 * ║  ─────────────────────────────────────                              ║
 * ║  1. Go to https://dash.cloudflare.com → Workers & Pages → Create   ║
 * ║     → Create Worker → name it "kosmos-notion" → Deploy             ║
 * ║                                                                      ║
 * ║  2. Click "Edit code" → paste this entire file → Deploy            ║
 * ║                                                                      ║
 * ║  3. Settings tab → Variables → Environment Variables → Add:        ║
 * ║       NOTION_TOKEN  →  secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx      ║
 * ║       NOTION_DB_ID  →  5651e966b4c041ada6912db3baf293f0            ║
 * ║     (Mark NOTION_TOKEN as "Encrypt" for security)                  ║
 * ║                                                                      ║
 * ║  4. Get your Notion token:                                          ║
 * ║       notion.so/my-integrations → New integration → Submit         ║
 * ║       → copy "Internal Integration Token" (secret_...)             ║
 * ║                                                                      ║
 * ║  5. Share your Notion database with the integration:               ║
 * ║       Open database → ··· menu → Add connections → your integration║
 * ║                                                                      ║
 * ║  6. Copy Worker URL → paste in app Settings (⚙ icon)              ║
 * ║                                                                      ║
 * ║  REQUIRED NOTION DATABASE PROPERTIES (create if missing):          ║
 * ║    • Negocio     → Title                                            ║
 * ║    • Teléfono    → Phone number                                     ║
 * ║    • Rubro       → Rich text                                        ║
 * ║    • Ciudad      → Rich text                                        ║
 * ║    • Estado      → Select (options below ↓)                        ║
 * ║    • Agente      → Select (options: Soledad, Silvina, Kosmos)      ║
 * ║    • Fecha       → Date                                             ║
 * ║    • Sitio web   → URL                                              ║
 * ║    • Rating      → Number                                           ║
 * ║    • Score       → Number                                           ║
 * ║    • Notas       → Rich text                                        ║
 * ║                                                                      ║
 * ║  Estado SELECT OPTIONS (add all in Notion):                        ║
 * ║    Nuevo · Contactado · Respondió · Interesado ·                   ║
 * ║    Propuesta enviada · Cliente · No interesa                        ║
 * ║                                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400); }

    // ── PATCH: update status and/or notes on existing record ──────────
    if (body.action === 'actualizar_estado' && body.pageId) {
      const props = {};
      if (body.estado) {
        props['Estado'] = { select: { name: body.estado } };
      }
      if (body.notas !== undefined) {
        props['Notas'] = { rich_text: [{ text: { content: String(body.notas).slice(0, 2000) } }] };
      }
      const patchRes = await fetch(`https://api.notion.com/v1/pages/${body.pageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: props }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.text();
        return json({ error: 'Notion PATCH error', details: err }, patchRes.status);
      }
      return json({ ok: true });
    }

    // ── POST: create new lead record ───────────────────────────────────
    const { nombre, telefono, rubro, ciudad, direccion, agente, sitio_web, rating, score, notas } = body;
    if (!nombre) return json({ error: 'nombre is required' }, 400);

    const todayISO = new Date().toISOString().slice(0, 10);

    const properties = {
      'Negocio':   { title: [{ text: { content: nombre } }] },
      'Teléfono':  { phone_number: telefono || null },
      'Rubro':     { rich_text: [{ text: { content: rubro || '' } }] },
      'Ciudad':    { rich_text: [{ text: { content: ciudad || direccion || '' } }] },
      'Estado':    { select: { name: 'Contactado' } },
      'Agente':    { select: { name: agente || 'Kosmos' } },
      'Fecha':     { date: { start: todayISO } },
    };

    if (sitio_web?.trim()) properties['Sitio web'] = { url: sitio_web.trim() };
    if (rating)            properties['Rating']    = { number: parseFloat(rating) || null };
    if (score)             properties['Score']     = { number: parseInt(score) || null };
    if (notas?.trim())     properties['Notas']     = { rich_text: [{ text: { content: notas.slice(0, 2000) } }] };

    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: env.NOTION_DB_ID }, properties }),
    });

    if (!notionRes.ok) {
      const errText = await notionRes.text();
      return json({ error: 'Notion API error', details: errText }, notionRes.status);
    }

    const notionData = await notionRes.json();
    // Return the Notion page ID so the app can update it later (status changes, notes)
    return json({ ok: true, pageId: notionData.id });
  },
};
