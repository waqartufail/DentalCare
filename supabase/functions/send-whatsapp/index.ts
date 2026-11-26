// OPTIONAL: WhatsApp Business Cloud API se message_queue ke pending messages khud bhejta hai.
// Ye abhi test nahi hua. Pehle Meta (WhatsApp Business) account, phone number aur approved template chahiye.
// Deploy: Supabase Dashboard -> Edge Functions -> Deploy a new function -> Via Editor -> ye code paste.
// Secrets (Edge Functions -> Secrets): WA_TOKEN, WA_PHONE_NUMBER_ID, WA_TEMPLATE, WA_LANG (jaise "en"), CRON_SECRET
// Template ki body me sirf ek variable ho: {{1}}  (poora message us me jata hai)
// Schedule: Integrations -> Cron -> har minute is function ko call (header: x-cron-secret = CRON_SECRET).
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = Deno.env.get('WA_TOKEN')!
  const phoneId = Deno.env.get('WA_PHONE_NUMBER_ID')!
  const template = Deno.env.get('WA_TEMPLATE')!
  const lang = Deno.env.get('WA_LANG') ?? 'en'

  const { data: msgs } = await sb.from('message_queue')
    .select('id, phone, body, clinics(country_code)').eq('status', 'pending').order('created_at').limit(50)

  let sent = 0
  for (const m of msgs ?? []) {
    const cc = (m as any).clinics?.country_code ?? '92'
    let to = String(m.phone).replace(/\D/g, '')
    if (to.startsWith('00')) to = to.slice(2)
    else if (to.startsWith('0')) to = cc + to.slice(1)

    const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: [{ type: 'text', text: m.body }] }] },
      }),
    })
    if (res.ok) {
      await sb.from('message_queue').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', m.id)
      sent++
    } else {
      await sb.from('message_queue').update({ last_error: (await res.text()).slice(0, 500) }).eq('id', m.id)
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
})
