const SUPABASE_URL = "https://tmsboqbwckkghverjxwb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtc2JvcWJ3Y2trZ2h2ZXJqeHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzA1MTkxMiwiZXhwIjoyMDg4NjI3OTEyfQ.4xmQKXoxJt8IHuVi3rGSfTzACJLZoOWv2Enr9bgjF-M";

const qs = encodeURIComponent("*,stores(*,customer_type:customer_types(*),store_tags(customer_tags(*)),representative:profiles!stores_representative_id_fkey(id,full_name))");
const url = `${SUPABASE_URL}/rest/v1/profiles?select=${qs}&role=eq.client&limit=1`;

fetch(url, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }
}).then(r => r.json()).then(data => console.log(JSON.stringify(data, null, 2))).catch(console.error);
