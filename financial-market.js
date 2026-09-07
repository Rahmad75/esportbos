// ===== ESPORTBOS - FINANCIAL MARKET =====

// Base rates (akan fluktuatif nanti)
let exchangeRates = {
    diamondToGold: 25,      // 1 Diamond = 25 Gold
    goldToCurrency: 50,     // 1 Gold = 50 Currency
    diamondToCurrency: 1250 // 1 Diamond = 1250 Currency
};

// Exchange fee 5%
const EXCHANGE_FEE = 0.05;

// Load user balances
function loadBalances() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) return;
    
    const diamonds = parseInt(localStorage.getItem(`esportbos_diamonds_${user.email}`) || '0');
    const gold = parseInt(localStorage.getItem('esportbos_team_funds') || '0');
    const currency = parseInt(localStorage.getItem(`esportbos_currency_${user.email}`) || '0');
    
    document.getElementById('diamondBalance').textContent = diamonds.toLocaleString();
    document.getElementById('goldBalance').textContent = gold.toLocaleString();
    document.getElementById('currencyBalance').textContent = currency.toLocaleString();
    document.getElementById('withdrawBalance').textContent = diamonds.toLocaleString();
}

// Switch exchange type
function switchExchange(type) {
    document.querySelectorAll('.exchange-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    const box = document.getElementById('exchangeBox');
    let fromLabel, toLabel, rate, fromBalance, toBalance;
    
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    
    if (type === 'diamond-gold') {
        fromLabel = 'Diamond';
        toLabel = 'Gold';
        rate = exchangeRates.diamondToGold;
        fromBalance = parseInt(localStorage.getItem(`esportbos_diamonds_${user.email}`) || '0');
    } else if (type === 'gold-currency') {
        fromLabel = 'Gold';
        toLabel = 'Currency';
        rate = exchangeRates.goldToCurrency;
        fromBalance = parseInt(localStorage.getItem('esportbos_team_funds') || '0');
    } else {
        fromLabel = 'Diamond';
        toLabel = 'Currency';
        rate = exchangeRates.diamondToCurrency;
        fromBalance = parseInt(localStorage.getItem(`esportbos_diamonds_${user.email}`) || '0');
    }
    
    box.innerHTML = `
        <div class="exchange-form">
            <div class="exchange-input-group">
                <label>Dari (${fromLabel})</label>
                <input type="number" id="exchangeAmount" min="1" max="${fromBalance}" placeholder="Jumlah ${fromLabel}">
                <span class="balance-hint">Saldo: ${fromBalance.toLocaleString()} ${fromLabel}</span>
            </div>
            <div class="exchange-arrow">→</div>
            <div class="exchange-input-group">
                <label>Ke (${toLabel})</label>
                <input type="text" id="exchangeResult" readonly placeholder="Hasil">
                <span class="rate-info">Kurs: 1 ${fromLabel} = ${rate} ${toLabel}</span>
                <span class="fee-info">Biaya: 5% (${(rate * 0.05).toFixed(2)} ${toLabel})</span>
            </div>
            <button class="btn-futuristic btn-large" onclick="executeExchange('${type}', ${rate})">💱 Tukar Sekarang</button>
        </div>
    `;
    
    // Auto-calculate
    document.getElementById('exchangeAmount').addEventListener('input', function() {
        const amount = parseInt(this.value) || 0;
        const result = Math.floor(amount * rate * (1 - EXCHANGE_FEE));
        document.getElementById('exchangeResult').value = result.toLocaleString() + ' ' + toLabel;
    });
}

// Execute exchange
function executeExchange(type, rate) {
    const amount = parseInt(document.getElementById('exchangeAmount').value);
    if (!amount || amount <= 0) {
        alert('❌ Masukkan jumlah yang valid!');
        return;
    }
    
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    const result = Math.floor(amount * rate * (1 - EXCHANGE_FEE));
    
    let fromBalance, toBalanceKey;
    
    if (type === 'diamond-gold') {
        fromBalance = parseInt(localStorage.getItem(`esportbos_diamonds_${user.email}`) || '0');
        if (amount > fromBalance) {
            alert('❌ Saldo Diamond tidak cukup!');
            return;
        }
        localStorage.setItem(`esportbos_diamonds_${user.email}`, (fromBalance - amount).toString());
        const gold = parseInt(localStorage.getItem('esportbos_team_funds') || '0');
        localStorage.setItem('esportbos_team_funds', (gold + result).toString());
    } else if (type === 'gold-currency') {
        fromBalance = parseInt(localStorage.getItem('esportbos_team_funds') || '0');
        if (amount > fromBalance) {
            alert('❌ Saldo Gold tidak cukup!');
            return;
        }
        localStorage.setItem('esportbos_team_funds', (fromBalance - amount).toString());
        const currency = parseInt(localStorage.getItem(`esportbos_currency_${user.email}`) || '0');
        localStorage.setItem(`esportbos_currency_${user.email}`, (currency + result).toString());
    } else {
        fromBalance = parseInt(localStorage.getItem(`esportbos_diamonds_${user.email}`) || '0');
        if (amount > fromBalance) {
            alert(' Saldo Diamond tidak cukup!');
            return;
        }
        localStorage.setItem(`esportbos_diamonds_${user.email}`, (fromBalance - amount).toString());
        const currency = parseInt(localStorage.getItem(`esportbos_currency_${user.email}`) || '0');
        localStorage.setItem(`esportbos_currency_${user.email}`, (currency + result).toString());
    }
    
    // Log transaction
    logTransaction(type, amount, result);
    
    alert(`✅ Exchange berhasil! Kamu dapat ${result.toLocaleString()}`);
    loadBalances();
    closeExchangeModal();
}

// Log transaction
function logTransaction(type, amount, result) {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    let transactions = JSON.parse(localStorage.getItem(`esportbos_transactions_${user.email}`) || '[]');
    
    transactions.unshift({
        type: type,
        amount: amount,
        result: result,
        timestamp: new Date().toISOString()
    });
    
    // Keep last 50 transactions
    if (transactions.length > 50) transactions = transactions.slice(0, 50);
    localStorage.setItem(`esportbos_transactions_${user.email}`, JSON.stringify(transactions));
    
    renderTransactions();
}

// Render transactions
function renderTransactions() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    const transactions = JSON.parse(localStorage.getItem(`esportbos_transactions_${user.email}`) || '[]');
    const container = document.getElementById('transactionList');
    
    if (transactions.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">Belum ada transaksi.</p>';
        return;
    }
    
    container.innerHTML = transactions.slice(0, 20).map(t => {
        const typeLabels = {
            'diamond-gold': '💎 → ',
            'gold-currency': ' → 🎟️',
            'diamond-currency': '💎 → 🎟️'
        };
        const time = new Date(t.timestamp).toLocaleString('id-ID');
        return `
            <div class="transaction-item">
                <span class="transaction-type">${typeLabels[t.type]}</span>
                <span class="transaction-amount">${t.amount.toLocaleString()} → ${t.result.toLocaleString()}</span>
                <span class="transaction-time">${time}</span>
            </div>
        `;
    }).join('');
}

// Request withdraw
function requestWithdraw() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    const diamonds = parseInt(localStorage.getItem(`esportbos_diamonds_${user.email}`) || '0');
    const minGross = 2941; // 2500 / 0.85
    
    if (diamonds < minGross) {
        alert(`❌ Saldo tidak cukup! Minimum withdraw: ${minGross.toLocaleString()} Diamonds (gross)`);
        return;
    }
    
    const netAmount = 2500;
    const fee = Math.floor(diamonds * 0.15);
    const rupiahValue = netAmount * 200; // Rp 200 per diamond
    
    if (!confirm(`Konfirmasi Withdraw:\n\nGross: ${diamonds.toLocaleString()} Diamonds\nFee (15%): ${fee.toLocaleString()} Diamonds\nNet: ${netAmount.toLocaleString()} Diamonds\nNilai: Rp ${rupiahValue.toLocaleString()}\n\nProses WD akan memakan waktu 3-7 hari kerja.`)) {
        return;
    }
    
    // Simpan request WD
    let wdRequests = JSON.parse(localStorage.getItem('esportbos_withdrawals') || '[]');
    wdRequests.push({
        user: user.email,
        username: user.username,
        gross: diamonds,
        net: netAmount,
        fee: fee,
        rupiah: rupiahValue,
        status: 'pending',
        timestamp: new Date().toISOString()
    });
    localStorage.setItem('esportbos_withdrawals', JSON.stringify(wdRequests));
    
    // Kurangi saldo
    localStorage.setItem(`esportbos_diamonds_${user.email}`, '0');
    
    alert(`✅ Request withdraw berhasil! Diamond akan diproses dalam 3-7 hari kerja. Nilai: Rp ${rupiahValue.toLocaleString()}`);
    loadBalances();
}

// Draw chart (simple canvas)
function drawChart() {
    const canvas = document.getElementById('marketChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }
    
    // Draw Diamond/Gold line (base 25, fluctuate 23-27)
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
        const x = (i / 23) * canvas.width;
        const rate = 25 + Math.sin(i * 0.5) * 2 + Math.random() * 1;
        const y = canvas.height - ((rate - 20) / 10) * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw Gold/Currency line (base 50, fluctuate 45-55)
    ctx.strokeStyle = '#fbbf24';
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
        const x = (i / 23) * canvas.width;
        const rate = 50 + Math.cos(i * 0.3) * 5 + Math.random() * 2;
        const y = canvas.height - ((rate - 40) / 20) * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function closeExchangeModal() {
    document.getElementById('exchangeModal').style.display = 'none';
}

// Init
document.addEventListener('DOMContentLoaded', function() {
    if (typeof EsportBosAuth !== 'undefined') {
        EsportBosAuth.requireAuth();
        const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
        if (user) {
            document.getElementById('userName').textContent = user.username;
            const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.avatarSeed || user.username}`;
            document.getElementById('navAvatar').src = avatarUrl;
        }
    }
    
    loadBalances();
    switchExchange('diamond-gold');
    renderTransactions();
    drawChart();
});
