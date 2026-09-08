// ===== SUPABASE CLIENT CONFIGURATION =====

const SUPABASE_URL = 'https://xvnpbmxyxphrddjzldbt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2bm1wYm15eHBocmRkampsZGJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NDI0OTgsImV4cCI6MjEwNDQxODQ5OH0.YvXP6nGV7QkQwi9S9xKGKDHUhrLP-sWY83N1iOcVEi0';

// Inisialisasi Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export agar bisa dipakai di file lain
window.supabaseClient = supabase;

console.log('✅ Supabase client initialized successfully');
