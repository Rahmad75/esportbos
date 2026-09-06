// ===== ESPORTBOS - LIGA PREDIKSI =====

// Database pertandingan untuk diprediksi
const predictionMatches = [
    {
        id: 1,
        homeTeam: { name: "Orange Lions", elo: 1352, logo: "🦁" },
        awayTeam: { name: "Sporting V. Mazzola", elo: 2346, logo: "⚽" },
        time: "13:00",
        status: "upcoming",
        actualScore: null
    },
    {
        id: 2,
        homeTeam: { name: "Charritos FC", elo: 2267, logo: "" },
        awayTeam: { name: "Racing de Santander", elo: 2992, logo: "🏎️" },
        time: "20:00",
        status: "upcoming",
        actualScore: null
    },
    {
        id: 3,
        homeTeam: { name: "Liverpool F.C.", elo: 3594, logo: "🔴" },
        awayTeam: { name: "Milan AC", elo: 2853, logo: "🔴⚫" },
        time: "13:00",
        status: "upcoming",
        actualScore: null
    },
    {
        id: 4,
        homeTeam: { name: "Münster", elo: 1753, logo: "⚪" },
        awayTeam: { name: "Bomboclat FC", elo: 1721, logo: "💣" },
        time: "18:50",
        status: "upcoming",
        actualScore: null
    },
    {
        id: 5,
        homeTeam: { name: "Gumio", elo: 1181, logo: "🌟" },
        awayTeam: { name: "FC Minion", elo: 1366, logo: "🟡" },
        time: "19:30",
        status: "upcoming",
        actualScore: null
    }
];

// Leaderboard dummy
const leaderboardData = [
    { rank: 1, delta: "—", manager: "joselvarezc", country: "🇨🇴", predictions: 26, correct: 22, score: 70 },
    { rank: 2, delta: "↑", manager: "batpec", country: "🇧🇬", predictions: 26, correct: 21, score: 65 },
    { rank: 3, delta: "↑", manager: "Neo_Maestro", country: "🇩", predictions: 26, correct: 21, score: 65 },
    { rank: 4, delta: "↑", manager: "Mare_Rick", country: "🇮🇩", predictions: 26, correct: 21, score: 65 },
    { rank: 5, delta: "↑", manager: "jaimep96", country: "🇪🇸", predictions: 26, correct: 20, score: 63 },
    { rank: 6, delta: "↑", manager: "syarifhidayatullah", country: "🇮🇩", predictions: 26, correct: 20, score: 62 },
    { rank: 7, delta: "↑", manager: "Bahadur", country: "🇨🇦", predictions: 26, correct: 20, score: 62 },
    { rank: 8, delta: "↑", manager: "roddicksg", country: "🇸", predictions: 26, correct: 20, score: 62 },
    { rank: 9, delta: "↑", manager: "boulaabi2007", country: "🇹🇳", predictions: 26, correct: 20, score: 62 },
    { rank: 10, delta: "↑", manager: "fighter", country: "🇮🇳", predictions: 26, correct: 20, score: 62 }
];

// Load data
function loadPredictionData() {
    const saved = localStorage.getItem('esportbos_predictions');
    if (saved) return JSON.parse(saved);
    return {
        predictions: {}, // matchId: { homeScore, awayScore, timestamp }
        score: 0,
        correct: 0,
        total: 0
    };
}

function savePredictionData(data) {
    localStorage.setItem('esportbos_predictions', JSON.stringify(data));
}

function getAvatarUrl(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash = hash & hash;
    }
    const photoNum = Math.abs(hash) % 100;
    return `https://randomuser.me/api/portraits/men/${photoNum}.jpg`;
}

// Render today's matches
function renderTodayMatches() {
    const container = document.getElementById('todayMatches');
    if (!container) return;
    
    const predData = loadPredictionData();
    
    container.innerHTML = predictionMatches.map(match => {
        const prediction = predData.predictions[match.id];
        const isPredicted = prediction !== undefined;
        
        return `
            <div class="match-prediction-card ${isPredicted ? 'predicted' : ''}">
                <div class="match-header">
                    <span class="match-time">⭐ Top ELO • ${match.time}</span>
                    ${isPredicted ? '<span class="predicted-badge">✅ Sudah Diprediksi</span>' : ''}
                </div>
                
                <div class="match-teams">
                    <div class="team home">
                        <div class="team-logo">${match.homeTeam.logo}</div>
                        <div class="team-info">
                            <h4>${match.homeTeam.name}</h4>
                            <span class="team-elo">ELO ${match.homeTeam.elo}</span>
                        </div>
                    </div>
                    
                    <div class="vs-section">
                        ${isPredicted 
                            ? `<div class="prediction-score">${prediction.homeScore} - ${prediction.awayScore}</div>`
                            : '<div class="vs-text">VS</div>'
                        }
                    </div>
                    
                    <div class="team away">
                        <div class="team-info">
                            <h4>${match.awayTeam.name}</h4>
                            <span class="team-elo">ELO ${match.awayTeam.elo}</span>
                        </div>
                        <div class="team-logo">${match.awayTeam.logo}</div>
                    </div>
                </div>
                
                <div class="match-actions">
                    ${isPredicted 
                        ? `<button class="btn-predicted" disabled>✅ Prediksi Tersimpan</button>`
                        : `<button class="btn-predict" onclick="openPredictionModal(${match.id})">🎯 Prediksi Skor</button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

// Render all matches
function renderAllMatches() {
    const container = document.getElementById('allMatches');
    if (!container) return;
    
    const predData = loadPredictionData();
    
    container.innerHTML = predictionMatches.map(match => {
        const prediction = predData.predictions[match.id];
        const isPredicted = prediction !== undefined;
        
        return `
            <div class="match-prediction-card small ${isPredicted ? 'predicted' : ''}">
                <div class="match-teams-compact">
                    <div class="team-compact">
                        <span class="team-logo-small">${match.homeTeam.logo}</span>
                        <span class="team-name-small">${match.homeTeam.name}</span>
                    </div>
                    <div class="vs-compact">
                        ${isPredicted 
                            ? `<span class="score-compact">${prediction.homeScore}-${prediction.awayScore}</span>`
                            : '<span class="vs-small">vs</span>'
                        }
                    </div>
                    <div class="team-compact">
                        <span class="team-name-small">${match.awayTeam.name}</span>
                        <span class="team-logo-small">${match.awayTeam.logo}</span>
                    </div>
                </div>
                <div class="match-time-compact">${match.time}</div>
                <button class="btn-predict-small" onclick="openPredictionModal(${match.id})" ${isPredicted ? 'disabled' : ''}>
                    ${isPredicted ? '✅' : '🎯'}
                </button>
            </div>
        `;
    }).join('');
}

// Render leaderboard
function renderLeaderboard() {
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) return;
    
    tbody.innerHTML = leaderboardData.map(entry => `
        <tr class="${entry.manager === 'Neo_Maestro' ? 'highlight' : ''}">
            <td><strong>#${entry.rank}</strong></td>
            <td class="delta">${entry.delta}</td>
            <td>
                <div class="manager-info">
                    <img src="${getAvatarUrl(entry.manager)}" class="manager-avatar">
                    <div>
                        <strong>${entry.manager}</strong>
                        <span class="country">${entry.country}</span>
                    </div>
                </div>
            </td>
            <td>${entry.predictions}</td>
            <td>${entry.correct}</td>
            <td><strong>${entry.score}</strong></td>
        </tr>
    `).join('');
}

// Open prediction modal
function openPredictionModal(matchId) {
    const match = predictionMatches.find(m => m.id === matchId);
    if (!match) return;
    
    const modal = document.getElementById('predictionModal');
    const body = document.getElementById('predictionModalBody');
    
    body.innerHTML = `
        <div class="prediction-form">
            <h3>🎯 Prediksi Skor</h3>
            <div class="prediction-match">
                <div class="team-prediction">
                    <div class="team-logo-large">${match.homeTeam.logo}</div>
                    <h4>${match.homeTeam.name}</h4>
                    <span class="team-elo">ELO ${match.homeTeam.elo}</span>
                </div>
                <div class="vs-large">VS</div>
                <div class="team-prediction">
                    <div class="team-logo-large">${match.awayTeam.logo}</div>
                    <h4>${match.awayTeam.name}</h4>
                    <span class="team-elo">ELO ${match.awayTeam.elo}</span>
                </div>
            </div>
            
            <div class="score-inputs">
                <div class="score-input-group">
                    <label>Skor ${match.homeTeam.name}</label>
                    <input type="number" id="homeScore" min="0" max="20" value="0">
                </div>
                <div class="score-separator">-</div>
                <div class="score-input-group">
                    <label>Skor ${match.awayTeam.name}</label>
                    <input type="number" id="awayScore" min="0" max="20" value="0">
                </div>
            </div>
            
            <div class="prediction-info">
                <p>💡 <strong>Sistem Poin:</strong></p>
                <ul>
                    <li>✅ Prediksi tepat: <strong>+3 poin</strong></li>
                    <li> Selisih gol benar: <strong>+1 poin</strong></li>
                    <li> Prediksi meleset: <strong>0 poin</strong></li>
                </ul>
            </div>
            
            <div class="prediction-actions">
                <button class="btn-cancel" onclick="closePredictionModal()">Batal</button>
                <button class="btn-predict" onclick="submitPrediction(${match.id})">✅ Kirim Prediksi</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Submit prediction
function submitPrediction(matchId) {
    const homeScore = parseInt(document.getElementById('homeScore').value);
    const awayScore = parseInt(document.getElementById('awayScore').value);
    
    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
        alert('❌ Masukkan skor yang valid!');
        return;
    }
    
    const predData = loadPredictionData();
    
    // Simpan prediksi
    predData.predictions[matchId] = {
        homeScore,
        awayScore,
        timestamp: new Date().toISOString()
    };
    
    predData.total++;
    savePredictionData(predData);
    
    closePredictionModal();
    renderTodayMatches();
    renderAllMatches();
    updateStats();
    
    alert(`✅ Prediksi berhasil disimpan! ${homeScore} - ${awayScore}`);
}

// Update stats display
function updateStats() {
    const predData = loadPredictionData();
    document.getElementById('myScore').textContent = predData.score;
    document.getElementById('myPredictions').textContent = predData.total;
    document.getElementById('myCorrect').textContent = `${predData.correct} (${predData.total > 0 ? Math.round((predData.correct / predData.total) * 100) : 0}%)`;
}

function closePredictionModal() {
    document.getElementById('predictionModal').style.display = 'none';
}

function switchPrediksiTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    event.target.classList.add('active');
    
    if (tabName === 'today') renderTodayMatches();
    if (tabName === 'all') renderAllMatches();
    if (tabName === 'leaderboard') renderLeaderboard();
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
    
    const funds = parseInt(localStorage.getItem('esportbos_team_funds') || '0');
    document.getElementById('teamFundsDisplay').textContent = funds.toLocaleString();
    
    updateStats();
    renderTodayMatches();
    renderAllMatches();
    renderLeaderboard();
    
    window.onclick = function(event) {
        const modal = document.getElementById('predictionModal');
        if (event.target === modal) {
            closePredictionModal();
        }
    };
});
