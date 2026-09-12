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
// ===== FIRST MATCH BONUS SYSTEM =====

// Fungsi untuk cek dan beri bonus match pertama
function checkAndGiveFirstMatchBonus() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) return;
    
    const email = user.email;
    
    // Cek apakah user sudah pernah main match
    const hasPlayedFirstMatch = localStorage.getItem(`esportbos_first_match_${email}`);
    
    // Kalau belum pernah main (null atau 'true')
    if (hasPlayedFirstMatch === null || hasPlayedFirstMatch === 'true') {
        // Tandai sudah dapat bonus
        localStorage.setItem(`esportbos_first_match_${email}`, 'false');
        
        // Beri 500 Currency
        const currentCurrency = parseInt(localStorage.getItem(`esportbos_currency_${email}`) || '0');
        const newCurrency = currentCurrency + 500;
        localStorage.setItem(`esportbos_currency_${email}`, newCurrency.toString());
        
        // Tampilkan alert
        setTimeout(() => {
            alert(`🎉 SELAMAT DATANG DI ESPORTBOS!\n\nKamu mendapat bonus NEW MANAGER:\n💰 500 Currency\n\nGunakan untuk membayar gaji pemain minggu pertama!\n\nSelamat bermain!`);
            
            // Update tampilan
            updateEconomyDisplay();
        }, 1000);
    }
}

// Panggil fungsi ini saat dashboard load
document.addEventListener('DOMContentLoaded', function() {
    // ... kode existing lo ...
    
    // Tambahkan baris ini di akhir
    checkAndGiveFirstMatchBonus();
    // ===== KODE YANG UDAH ADA (baris 1-23) =====
function updateEconomyDisplay() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) return;
    
    const email = user.email;
    
    // Ambil data
    const diamonds = parseInt(localStorage.getItem(`esportbos_diamonds_${email}`) || '0');
    const gold = parseInt(localStorage.getItem(`esportbos_gold_${email}`) || '0');
    const currency = parseInt(localStorage.getItem(`esportbos_currency_${email}`) || '0');
    
    // Update HTML
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
});


// ===== TAMBAHKAN KODE INI DI BAWAH (First Match Bonus) =====

function checkAndGiveFirstMatchBonus() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) return;
    
    const email = user.email;
    
    // Cek apakah user sudah pernah main match
    const hasPlayedFirstMatch = localStorage.getItem(`esportbos_first_match_${email}`);
    
    // Kalau belum pernah main (null atau 'true')
    if (hasPlayedFirstMatch === null || hasPlayedFirstMatch === 'true') {
        // Tandai sudah dapat bonus
        localStorage.setItem(`esportbos_first_match_${email}`, 'false');
        
        // Beri 500 Currency
        const currentCurrency = parseInt(localStorage.getItem(`esportbos_currency_${email}`) || '0');
        const newCurrency = currentCurrency + 500;
        localStorage.setItem(`esportbos_currency_${email}`, newCurrency.toString());
        
        // Tampilkan alert setelah 1 detik
        setTimeout(() => {
            alert(`🎉 SELAMAT DATANG DI ESPORTBOS!\n\nKamu mendapat bonus NEW MANAGER:\n💰 500 Currency\n\nGunakan untuk membayar gaji pemain minggu pertama!\n\nSelamat bermain!`);
            
            // Update tampilan
            updateEconomyDisplay();
        }, 1000);
    }
}

// Tambahkan ke event listener yang udah ada
document.addEventListener('DOMContentLoaded', function() {
    checkAndGiveFirstMatchBonus();
    // Fungsi untuk load transfer data
async function loadTransferData() {
    try {
        // Load completed transfers
        const { data: transfers, error } = await supabase
            .from('transfers')
            .select('*')
            .eq('status', 'completed')
            .eq('transfer_type', 'transfer')
            .order('created_at', { ascending: false })
            .limit(5);

        const transfersTable = document.getElementById('latestTransfersTable');
        if (!transfers || transfers.length === 0) {
            transfersTable.innerHTML = `
                <div class="table-header"><span>Pos</span><span>Dari</span><span>Ke</span><span>Nilai Bid</span></div>
                <div class="table-row" style="justify-content:center; color:#999; padding: 15px;">Belum ada transfer</div>
            `;
        } else {
            const transfersHtml = transfers.map(t => {
                const posMap = { 'Top': 'GT', 'Jungle': 'JG', 'Mid': 'MID', 'ADC': 'ADC', 'Support': 'SUP' };
                const posCode = posMap[t.player_position] || t.player_position?.substring(0, 2).toUpperCase() || 'P';
                const posColor = posCode === 'GT' || posCode === 'GK' ? '#ff6b6b' : '#28a745';
                
                return `
                    <div class="table-row">
                        <span class="pos" style="background:${posColor}; color:white; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:bold;">${posCode}</span>
                        <span>${t.player_name || '-'}</span>
                        <span>${t.to_team_name || '-'}</span>
                        <span class="bid" style="color:#28a745; font-weight:bold;">💰 ${parseFloat(t.bid_amount || 0).toFixed(2)}</span>
                    </div>
                `;
            }).join('');
            
            transfersTable.innerHTML = `
                <div class="table-header"><span>Pos</span><span>Dari</span><span>Ke</span><span>Nilai Bid</span></div>
                ${transfersHtml}
            `;
        }

        // Load bids
        const { data: bids, error: bidsError } = await supabase
            .from('transfers')
            .select('*')
            .eq('status', 'pending')
            .eq('transfer_type', 'bid')
            .order('created_at', { ascending: false })
            .limit(5);

        const bidsTable = document.getElementById('latestBidsTable');
        if (!bids || bids.length === 0) {
            bidsTable.innerHTML = `
                <div class="table-header"><span>Pos</span><span>Oleh Tim</span><span>Nilai Bid</span><span>Waktu Lalu</span></div>
                <div class="table-row" style="justify-content:center; color:#999; padding: 15px;">Belum ada bid</div>
            `;
        } else {
            const bidsHtml = bids.map(b => {
                const posMap = { 'Top': 'BT', 'Jungle': 'JG', 'Mid': 'MID', 'ADC': 'ADC', 'Support': 'SUP' };
                const posCode = posMap[b.player_position] || b.player_position?.substring(0, 2).toUpperCase() || 'P';
                const posColor = posCode === 'BT' || posCode === 'GK' ? '#3498db' : '#9b59b6';
                
                const minutesAgo = Math.floor((new Date() - new Date(b.created_at)) / (1000 * 60));
                const timeText = minutesAgo < 60 ? `${minutesAgo} Menit` : `${Math.floor(minutesAgo / 60)} Jam`;
                
                return `
                    <div class="table-row">
                        <span class="pos" style="background:${posColor}; color:white; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:bold;">${posCode}</span>
                        <span>${b.to_team_name || b.from_team_name || '-'}</span>
                        <span class="bid" style="color:#28a745; font-weight:bold;">💰 ${parseFloat(b.bid_amount || 0).toFixed(2)}</span>
                        <span style="color:#999; font-size:12px;">${timeText}</span>
                    </div>
                `;
            }).join('');
            
            bidsTable.innerHTML = `
                <div class="table-header"><span>Pos</span><span>Oleh Tim</span><span>Nilai Bid</span><span>Waktu Lalu</span></div>
                ${bidsHtml}
            `;
        }
    } catch (err) {
        console.error('Error loading transfers:', err);
    }
}

// Panggil loadTransferData saat halaman load
document.addEventListener('DOMContentLoaded', () => {
    loadTransferData();
});
});
