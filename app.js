// ===== ESPORTBOS APP CONTROLLER (GLOBAL) =====
// File ini wajib dipanggil di SEMUA halaman yang butuh login

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 App Controller Loaded');

    // 1. Cek apakah Supabase Client sudah siap
    if (typeof window.supabaseClient === 'undefined') {
        console.error('❌ Supabase Client belum siap!');
        return;
    }

    // 2. Cek Session Login
    const { data: { session } } = await window.supabaseClient.auth.getSession();

    // Jika TIDAK ada session, tendang ke halaman login
    if (!session) {
        console.log('⚠️ User belum login, redirect ke index.html');
        window.location.href = 'index.html';
        return;
    }

    // 3. Ambil Data Profil dari Database Supabase
    const { data: profile, error } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (error) {
        console.error('❌ Gagal mengambil profil:', error);
        // Jika profil belum ada (error), kita buat data default dulu
        // (Ini backup jika trigger di Supabase belum jalan)
    }

    // 4. Simpan data user ke variabel global agar bisa dipakai script lain
    const currentUser = profile || {
        id: session.user.id,
        email: session.user.email,
        username: session.user.user_metadata?.username || 'Manager',
        club_name: 'My Club',
        diamonds: 0,
        gold: 0,
        currency: 0,
        popularity: 50,
        moral: 70,
        role: 'OWNER',
        joined_date: new Date().toISOString()
    };

    window.currentUser = currentUser;
    console.log('✅ Data User Loaded:', currentUser.username);

    // 5. UPDATE TAMPILAN DI SEMUA HALAMAN (Navbar & Sidebar)
    updateGlobalUI(currentUser);
});

// Fungsi untuk update elemen-elemen umum di semua halaman
function updateGlobalUI(user) {
    // --- NAVBAR ---
    const navUserName = document.getElementById('userName');
    const navAvatar = document.getElementById('navAvatar');
    if (navUserName) navUserName.textContent = user.username;
    if (navAvatar) navAvatar.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`;

    // --- SIDEBAR (SALDO & KLUB) ---
    const elDiamond = document.getElementById('diamondBalance');
    const elGold = document.getElementById('goldBalance');
    const elCurrency = document.getElementById('currencyBalance');
    const elClubName = document.getElementById('clubName');
    const popBar = document.getElementById('popularityBar');
    const moralBar = document.getElementById('moralBar');

    if (elDiamond) elDiamond.textContent = (user.diamonds || 0).toLocaleString('id-ID');
    if (elGold) elGold.textContent = (user.gold || 0).toLocaleString('id-ID');
    if (elCurrency) elCurrency.textContent = (user.currency || 0).toLocaleString('id-ID');
    if (elClubName) elClubName.textContent = user.club_name || 'My Club';
    
    if (popBar) popBar.style.width = `${user.popularity || 50}%`;
    if (moralBar) moralBar.style.width = `${user.moral || 70}%`;
}

// Fungsi Helper untuk Update Saldo di Database (PENTING!)
async function updateUserBalance(field, amountChange) {
    if (!window.currentUser) return;
    
    const newAmount = (window.currentUser[field] || 0) + amountChange;
    
    const { error } = await window.supabaseClient
        .from('profiles')
        .update({ [field]: newAmount })
        .eq('id', window.currentUser.id);

    if (error) {
        console.error('❌ Gagal update saldo:', error);
        alert('Gagal menyimpan perubahan saldo!');
        return false;
    }

    // Update variabel global & UI
    window.currentUser[field] = newAmount;
    updateGlobalUI(window.currentUser);
    console.log(`✅ ${field} diupdate: ${newAmount}`);
    return true;
}
