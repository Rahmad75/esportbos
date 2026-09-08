// ===== COMMON FUNCTIONS - UNTUK SEMUA HALAMAN =====

// Load data user ke UI (navbar + sidebar)
async function loadCommonData() {
    // Cek login
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
        return null;
    }
    
    // Ambil data dari localStorage (sudah disimpan saat login)
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) {
        window.location.href = 'index.html';
        return null;
    }
    
    // Update Navbar
    const navUserName = document.getElementById('userName');
    const navAvatar = document.getElementById('navAvatar');
    if (navUserName) navUserName.textContent = user.username;
    if (navAvatar) {
        navAvatar.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`;
    }
    
    // Update Sidebar - Saldo
    const elDiamond = document.getElementById('diamondBalance');
    const elGold = document.getElementById('goldBalance');
    const elCurrency = document.getElementById('currencyBalance');
    
    if (elDiamond) elDiamond.textContent = user.diamonds.toLocaleString('id-ID');
    if (elGold) elGold.textContent = user.gold.toLocaleString('id-ID');
    if (elCurrency) elCurrency.textContent = user.currency.toLocaleString('id-ID');
    
    // Update Sidebar - Profil Klub
    const elClubName = document.getElementById('clubName');
    if (elClubName) elClubName.textContent = user.club_name;
    
    const popBar = document.getElementById('popularityBar');
    const moralBar = document.getElementById('moralBar');
    if (popBar) popBar.style.width = `${user.popularity}%`;
    if (moralBar) moralBar.style.width = `${user.moral}%`;
    
    return user;
}

// Jalankan saat halaman load
document.addEventListener('DOMContentLoaded', function() {
    if (window.supabaseClient) {
        loadCommonData();
    } else {
        // Tunggu supabase client ready
        setTimeout(() => {
            if (window.supabaseClient) loadCommonData();
        }, 1000);
    }
});
