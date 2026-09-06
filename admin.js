// ===== ESPORTBOS - ADMIN DASHBOARD LOGIC =====

document.addEventListener('DOMContentLoaded', function() {
    // 1. WAJIB ADMIN
    if (typeof EsportBosAuth !== 'undefined') {
        EsportBosAuth.requireAdmin();
        const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
        if (user) {
            document.getElementById('userName').textContent = `👑 ${user.username}`;
        }
    }

    loadAdminData();
});

function loadAdminData() {
    // Simulasi Global Stats (Di Supabase nanti ini jadi query COUNT)
    const users = JSON.parse(localStorage.getItem('esportbos_users') || '[]');
    const currentFunds = parseInt(localStorage.getItem('esportbos_team_funds') || '10000');
    const matchHistory = JSON.parse(localStorage.getItem('esportbos_match_history') || '[]');
    
    // Update Overview Cards
    document.getElementById('totalUsers').textContent = users.length;
    document.getElementById('totalGold').textContent = currentFunds.toLocaleString();
    document.getElementById('totalMatches').textContent = matchHistory.length;
    document.getElementById('totalTeams').textContent = users.length > 0 ? users.length : 1;

    // Render User Table
    renderUserTable(users, currentFunds);

    // Render System Logs (Simulasi)
    renderSystemLogs(matchHistory);
}

function renderUserTable(users, currentFunds) {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;

    // Kita tampilkan user yang ada di localStorage ini
    // Di Supabase nanti, ini akan fetch semua user dari database
    let html = '';
    users.forEach(u => {
        const teamName = u.role === 'admin' ? 'RRQ Hoshi (Owner)' : 'Tim User';
        html += `
            <tr>
                <td><strong>${u.username}</strong></td>
                <td>${u.email}</td>
                <td><span class="role-badge ${u.role}">${u.role.toUpperCase()}</span></td>
                <td>${teamName}</td>
                <td>${u.role === 'admin' ? currentFunds.toLocaleString() : 'N/A'} G</td>
                <td>
                    ${u.role !== 'admin' ? `<button class="btn-small-danger" onclick="alert('Fitur ban user akan aktif di versi Supabase')">Banned</button>` : '-'}
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function renderSystemLogs(history) {
    const container = document.getElementById('systemLogs');
    if (!container) return;

    if (history.length === 0) {
        container.innerHTML = '<p style="color:#999;">Belum ada aktivitas match.</p>';
        return;
    }

    container.innerHTML = history.slice(0, 5).map(h => `
        <div class="log-item">
            <span class="log-time">${h.date}</span>
            <span class="log-action">${h.menang ? '✅ WIN' : '❌ LOSE'} vs ${h.lawan} (${h.myWins}-${h.lawanWins})</span>
        </div>
    `).join('');
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    event.target.classList.add('active');
}

// --- ADMIN ACTIONS ---

function addPlayerToMarket() {
    const name = document.getElementById('newPlayerName').value;
    const pos = document.getElementById('newPlayerPos').value;
    const price = parseInt(document.getElementById('newPlayerPrice').value);

    if (!name || !price) {
        alert('❌ Mohon isi semua data!');
        return;
    }

    let market = JSON.parse(localStorage.getItem('esportbos_market') || '[]');
    market.push({
        id: Date.now(),
        nama: name,
        posisi: pos,
        role: "Carry",
        stats: { mechanics: 80, gameSense: 80, teamwork: 80, stamina: 80 },
        harga: price,
        avatar: name,
        avatarIndex: Math.floor(Math.random() * 100)
    });

    localStorage.setItem('esportbos_market', JSON.stringify(market));
    alert(`✅ Pemain ${name} berhasil ditambahkan ke Market!`);
    
    // Reset form
    document.getElementById('newPlayerName').value = '';
    document.getElementById('newPlayerPrice').value = '';
}

function resetMarket() {
    if (!confirm('⚠️ Yakin ingin mereset semua isi market ke default?')) return;
    localStorage.removeItem('esportbos_market');
    alert('✅ Market berhasil direset!');
}

function clearData(key) {
    if (!confirm(`⚠️ Yakin ingin menghapus data ${key}?`)) return;
    localStorage.removeItem(key);
    alert(`✅ Data ${key} berhasil dihapus!`);
    loadAdminData();
}

function resetEconomy() {
    if (!confirm('⚠️ Yakin ingin mereset dana klub ke 10.000 Gold?')) return;
    localStorage.setItem('esportbos_team_funds', '10000');
    alert('✅ Ekonomi berhasil direset!');
    loadAdminData();
}

function nukeServer() {
    const confirmText = prompt('⚠️ PERINGATAN KERAS! Ketik "HAPUS SEMUA" untuk melanjutkan Factory Reset.');
    if (confirmText === 'HAPUS SEMUA') {
        localStorage.clear();
        alert('💣 SERVER DI-NUKE! Semua data telah dihapus. Anda akan di-logout.');
        window.location.href = 'index.html';
    } else {
        alert('❌ Tindakan dibatalkan.');
    }
}
