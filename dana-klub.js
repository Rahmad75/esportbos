// ===== ESPORTBOS - DANA KLUB MANAGER =====

// Global variables
let allTransactions = [];
let currentFilter = 'all';

// Load and display all financial data
function loadFinancialData() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) return;
    
    const email = user.email;
    
    // Load balances
    const diamonds = parseInt(localStorage.getItem(`esportbos_diamonds_${email}`) || '0');
    const gold = parseInt(localStorage.getItem(`esportbos_gold_${email}`) || '0');
    const currency = parseInt(localStorage.getItem(`esportbos_currency_${email}`) || '0');
    
    // Update display
    document.getElementById('totalDiamond').textContent = diamonds.toLocaleString('id-ID');
    document.getElementById('totalGold').textContent = gold.toLocaleString('id-ID');
    document.getElementById('totalCurrency').textContent = currency.toLocaleString('id-ID');
    
    document.getElementById('diamondBalance').textContent = diamonds.toLocaleString('id-ID');
    document.getElementById('goldBalance').textContent = gold.toLocaleString('id-ID');
    document.getElementById('currencyBalance').textContent = currency.toLocaleString('id-ID');
    
    document.getElementById('navGoldDisplay').textContent = gold.toLocaleString('id-ID');
    
    // Load transactions
    loadTransactions(email);
    
    // Calculate weekly summary
    calculateWeeklySummary(email);
    
    // Calculate income sources
    calculateIncomeSources(email);
    
    // Calculate expenses
    calculateExpenses(email);
    
    // Calculate projection
    calculateProjection(email);
}

// Load transactions from localStorage
function loadTransactions(email) {
    const transactions = JSON.parse(localStorage.getItem(`esportbos_transactions_${email}`) || '[]');
    allTransactions = transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    renderTransactions();
}

// Render transactions based on filter
function renderTransactions() {
    const container = document.getElementById('transactionList');
    
    let filtered = allTransactions;
    if (currentFilter !== 'all') {
        filtered = allTransactions.filter(t => t.category === currentFilter);
    }
    
    if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">Belum ada transaksi.</p>';
        return;
    }
    
    container.innerHTML = filtered.slice(0, 50).map(t => {
        const date = new Date(t.timestamp).toLocaleString('id-ID');
        const isIncome = t.type === 'income' || t.amount > 0;
        const amountClass = isIncome ? 'income' : 'expense';
        const amountSign = isIncome ? '+' : '-';
        const icon = getTransactionIcon(t.category);
        
        return `
            <div class="transaction-item">
                <div class="transaction-icon">${icon}</div>
                <div class="transaction-details">
                    <div class="transaction-title">${t.description}</div>
                    <div class="transaction-date">${date}</div>
                </div>
                <div class="transaction-amount ${amountClass}">
                    ${amountSign}${Math.abs(t.amount).toLocaleString('id-ID')} ${t.currency}
                </div>
            </div>
        `;
    }).join('');
}

// Get icon based on category
function getTransactionIcon(category) {
    const icons = {
        'income': '💰',
        'expense': '💸',
        'exchange': '💱',
        'match': '',
        'sponsor': '🤝',
        'ticket': '🎟️',
        'wage': '👥',
        'maintenance': '🏟️',
        'topup': '💎'
    };
    return icons[category] || '💵';
}

// Filter transactions
function filterTransactions(filter) {
    currentFilter = filter;
    
    // Update buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    renderTransactions();
}

// Calculate weekly summary
function calculateWeeklySummary(email) {
    const transactions = JSON.parse(localStorage.getItem(`esportbos_transactions_${email}`) || '[]');
    
    // Get transactions from this week (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const weeklyTransactions = transactions.filter(t => {
        const tDate = new Date(t.timestamp);
        return tDate >= weekAgo;
    });
    
    let income = 0;
    let expense = 0;
    const incomeBreakdown = {};
    const expenseBreakdown = {};
    
    weeklyTransactions.forEach(t => {
        if (t.type === 'income' || t.amount > 0) {
            income += Math.abs(t.amount);
            incomeBreakdown[t.category] = (incomeBreakdown[t.category] || 0) + Math.abs(t.amount);
        } else {
            expense += Math.abs(t.amount);
            expenseBreakdown[t.category] = (expenseBreakdown[t.category] || 0) + Math.abs(t.amount);
        }
    });
    
    // Display
    document.getElementById('weeklyIncome').textContent = `${income.toLocaleString('id-ID')} Currency`;
    document.getElementById('weeklyExpense').textContent = `${expense.toLocaleString('id-ID')} Currency`;
    
    const netBalance = income - expense;
    document.getElementById('netBalance').textContent = `${netBalance.toLocaleString('id-ID')} Currency`;
    
    // Income breakdown
    const incomeList = Object.entries(incomeBreakdown).map(([category, amount]) => {
        const labels = {
            'match': 'Pertandingan',
            'sponsor': 'Sponsor',
            'ticket': 'Tiket',
            'prediction': 'Prediksi',
            'exchange': 'Exchange'
        };
        return `<li>${labels[category] || category}: ${amount.toLocaleString('id-ID')}</li>`;
    }).join('');
    document.getElementById('incomeBreakdown').innerHTML = incomeList || '<li>-</li>';
    
    // Expense breakdown
    const expenseList = Object.entries(expenseBreakdown).map(([category, amount]) => {
        const labels = {
            'wage': 'Gaji',
            'maintenance': 'Maintenance',
            'academy': 'Akademi',
            'exchange': 'Exchange Fee'
        };
        return `<li>${labels[category] || category}: ${amount.toLocaleString('id-ID')}</li>`;
    }).join('');
    document.getElementById('expenseBreakdown').innerHTML = expenseList || '<li>-</li>';
    
    // Net status
    const statusEl = document.getElementById('netStatus');
    if (netBalance > 0) {
        statusEl.innerHTML = '<span style="color:#28a745">✅ Profit</span>';
    } else if (netBalance < 0) {
        statusEl.innerHTML = '<span style="color:#dc3545">️ Defisit</span>';
    } else {
        statusEl.innerHTML = '<span style="color:#ffc107">️ Impas</span>';
    }
}

// Calculate income sources
function calculateIncomeSources(email) {
    const transactions = JSON.parse(localStorage.getItem(`esportbos_transactions_${email}`) || '[]');
    
    const sources = {
        'match': 0,
        'sponsor': 0,
        'ticket': 0,
        'prediction': 0,
        'topup': 0
    };
    
    transactions.forEach(t => {
        if (t.type === 'income' && sources[t.category] !== undefined) {
            sources[t.category] += Math.abs(t.amount);
        }
    });
    
    document.getElementById('matchIncome').textContent = `Total: ${sources.match.toLocaleString('id-ID')} Currency`;
    document.getElementById('sponsorIncome').textContent = `Total: ${sources.sponsor.toLocaleString('id-ID')} Currency`;
    document.getElementById('ticketIncome').textContent = `Total: ${sources.ticket.toLocaleString('id-ID')} Currency`;
    document.getElementById('predictionIncome').textContent = `Total: ${sources.prediction.toLocaleString('id-ID')} Currency`;
    document.getElementById('topupIncome').textContent = `Total: ${sources.topup.toLocaleString('id-ID')} Diamond`;
}

// Calculate expenses
function calculateExpenses(email) {
    // Ini simulasi - nanti ambil dari data pemain & staff
    const playerCount = 5; // Contoh
    const staffCount = 2; // Contoh
    const stadiumLevel = 1; // Contoh
    
    const playerWages = playerCount * 15; // 15 Currency per pemain
    const staffWages = staffCount * 10; // 10 Currency per staff
    const stadiumMaint = stadiumLevel * 25; // 25 Currency per level
    const academyCost = 20; // Fixed cost
    
    const total = playerWages + staffWages + stadiumMaint + academyCost;
    
    document.getElementById('playerWages').textContent = `${playerWages.toLocaleString('id-ID')} Currency/minggu`;
    document.getElementById('playerWagesDetail').textContent = `${playerCount} pemain`;
    
    document.getElementById('staffWages').textContent = `${staffWages.toLocaleString('id-ID')} Currency/minggu`;
    document.getElementById('staffWagesDetail').textContent = `${staffCount} staff`;
    
    document.getElementById('stadiumMaintenance').textContent = `${stadiumMaint.toLocaleString('id-ID')} Currency/minggu`;
    document.getElementById('stadiumLevel').textContent = stadiumLevel;
    
    document.getElementById('academyCost').textContent = `${academyCost.toLocaleString('id-ID')} Currency/minggu`;
    
    document.getElementById('totalWeeklyExpense').textContent = `${total.toLocaleString('id-ID')} Currency`;
}

// Calculate financial projection
function calculateProjection(email) {
    // Simple projection based on last 4 weeks
    const transactions = JSON.parse(localStorage.getItem(`esportbos_transactions_${email}`) || '[]');
    
    // Get last 4 weeks of data
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 28);
    
    const monthlyTransactions = transactions.filter(t => {
        const tDate = new Date(t.timestamp);
        return tDate >= monthAgo;
    });
    
    let totalIncome = 0;
    let totalExpense = 0;
    
    monthlyTransactions.forEach(t => {
        if (t.type === 'income' || t.amount > 0) {
            totalIncome += Math.abs(t.amount);
        } else {
            totalExpense += Math.abs(t.amount);
        }
    });
    
    // Weekly average
    const weeklyIncome = Math.round(totalIncome / 4);
    const weeklyExpense = Math.round(totalExpense / 4);
    const netProjection = weeklyIncome - weeklyExpense;
    
    document.getElementById('projectedIncome').textContent = `${weeklyIncome.toLocaleString('id-ID')} Currency`;
    document.getElementById('projectedExpense').textContent = `${weeklyExpense.toLocaleString('id-ID')} Currency`;
    document.getElementById('projectedNet').textContent = `${netProjection.toLocaleString('id-ID')} Currency`;
}

// Add transaction helper
function addTransaction(email, category, type, amount, currency, description) {
    const transactions = JSON.parse(localStorage.getItem(`esportbos_transactions_${email}`) || '[]');
    
    transactions.push({
        category,
        type,
        amount,
        currency,
        description,
        timestamp: new Date().toISOString()
    });
    
    // Keep last 100 transactions
    if (transactions.length > 100) {
        transactions.splice(0, transactions.length - 100);
    }
    
    localStorage.setItem(`esportbos_transactions_${email}`, JSON.stringify(transactions));
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
    
    loadFinancialData();
    
    // Auto-refresh every 30 seconds
    setInterval(loadFinancialData, 30000);
});
