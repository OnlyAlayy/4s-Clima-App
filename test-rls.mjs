import { createClient } from '@supabase/supabase-js';

const url = 'https://eaixkworazrzxcttdlpd.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhaXhrd29yYXpyenhjdHRkbHBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4OTc0MjIsImV4cCI6MjEwNjQ3MzQyMn0.cuUQGtQJMzJ48gm6K4uM_vjRSEVZFWxlpt3exPnNFn8';
const supabase = createClient(url, key);

async function run() {
  const { data: auth, error: loginErr } = await supabase.auth.signInWithPassword({
    email: 'lmtf4244@gmail.com',
    password: 'shitalay12'
  });
  if (loginErr) return console.error('Login error:', loginErr);
  
  console.log('Logged in.');

  // Test is_admin() function if it's exposed, but we can just query users table.
  const { data: profile } = await supabase.from('users').select('role').eq('id', auth.user.id).single();
  console.log('User Role:', profile?.role);

  // Try to insert a work order
  const { data: insertData, error: insertError } = await supabase
    .from('work_orders')
    .insert({
      client_id: '00000000-0000-0000-0000-000000000000', // invalid but we want to see if RLS blocks it first
      status: 'pending',
      type: 'preventive'
    });
    
  console.log('Insert Error:', insertError);
}

run();
