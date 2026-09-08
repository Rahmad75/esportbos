function updateEconomyDisplay() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) return;

    const email = user.email;
    
    // Ambil data
    const diamonds = parseInt(localStorage.getItem(`esportbos_diamonds_${email}`) || '0');
    const gold = parseInt(localStorage.getItem(`esportbos_gold_${email}`) || '0');
    const currency = parseInt(localStorage.getItem(`esportbos_currency_${email}`) || '0');

    // Update HTML (Pastikan ID di HTML lo sesuai: diamondBalance, goldBalance, currencyBalance)
    const elDiamond = document.getElementById('diamondBalance');
    const elGold = document.getElementById('goldBalance');
    const elCurrency = document.getElementById('currencyBalance');

    if (elDiamond) elDiamond.textContent = diamonds.toLocaleString('id-ID');
    if (elGold) elGold.textContent = gold.toLocaleString('id-ID');
    if (elCurrency) elCurrency.textContent = currency.toLocaleString('id-ID');
}

// Jalankan saat halaman dimuat
document.addEventListener('DOMContentLoaded', function() {
    updateEconomyDisplay();
    
    // Opsional: Auto-refresh setiap 10 detik biar terasa real-time
    setInterval(updateEconomyDisplay, 10000);

    // Migration: Hapus data lama yang tidak sesuai format baru
function migrateOldData() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) return;
    
    // Hapus key lama (jika masih ada)
    localStorage.removeItem('esportbos_team_funds');
    localStorage.removeItem('esportbos_diamonds');
    localStorage.removeItem('esportbos_currency');
    
    // Pastikan key baru ada dengan nilai 0
    if (localStorage.getItem(`esportbos_diamonds_${user.email}`) === null) {
        localStorage.setItem(`esportbos_diamonds_${user.email}`, '0');
    }
    if (localStorage.getItem(`esportbos_gold_${user.email}`) === null) {
        localStorage.setItem(`esportbos_gold_${user.email}`, '0');
    }
    if (localStorage.getItem(`esportbos_currency_${user.email}`) === null) {
        localStorage.setItem(`esportbos_currency_${user.email}`, '0');
    }
}

// Panggil di awal DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    migrateOldData(); // ← TAMBAH INI
    updateEconomyDisplay();
});
});
