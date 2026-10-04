import { createClient } from '@supabase/supabase-js';

const url = 'https://eaixkworazrzxcttdlpd.supabase.co';
const key = ''; // EMPTY KEY
const supabaseAdmin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  console.log('Calling createUser with empty key...');
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: 'test_empty_key@4sclima.com',
    password: 'password123',
    email_confirm: true
  });
  console.log('Error:', error);
}

run();
