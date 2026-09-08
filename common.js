// ===== COMMON FUNCTIONS FOR ALL PAGES =====

// Fungsi untuk load data user ke navbar & sidebar
function loadCommonData() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    const email = user.email;
    const username = user.username || user.email.split('@')[0];
    
    // Update Navbar
    const navUserName = document.getElementById('userName');
    const navAvatar = document.getElementById('navAvatar');
    if (navUserName) navUserName.textContent = username;
    if (navAvatar) {
        navAvatar.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    }
    
    // Update Saldo di Sidebar
    const diamonds = parseInt(localStorage.getItem(`esportbos_diamonds_${email}`) || '0');
    const gold = parseInt(localStorage.getItem(`esportbos_gold_${email}`) || '0');
    const currency = parseInt(localStorage.getItem(`esportbos_currency_${email}`) || '0');
    
    const elDiamond = document.getElementById('diamondBalance');
    const elGold = document.getElementById('goldBalance');
    const elCurrency = document.getElementById('currencyBalance');
    
    if (elDiamond) elDiamond.textContent = diamonds.toLocaleString('id-ID');
    if (elGold) elGold.textContent = gold.toLocaleString('id-ID');
    if (elCurrency) elCurrency.textContent = currency.toLocaleString('id-ID');
    
    // Update Profil Klub di Sidebar
    const clubName = localStorage.getItem(`esportbos_club_name_${email}`) || 'My Club';
    const popularity = parseInt(localStorage.getItem(`esportbos_popularity_${email}`) || '76');
    const moral = parseInt(localStorage.getItem(`esportbos_moral_${email}`) || '78');
    
    const elClubName = document.querySelector('.team-name');
    if (elClubName && !elClubName.id) elClubName.textContent = clubName;
    
    const elPopularity = document.getElementById('popularityBar');
    if (elPopularity) elPopularity.style.width = `${popularity}%`;
    
    const elMoral = document.getElementById('moralBar');
    if (elMoral) elMoral.style.width = `${moral}%`;
}

// Jalankan saat semua halaman load
document.addEventListener('DOMContentLoaded', function() {
    loadCommonData();
});
