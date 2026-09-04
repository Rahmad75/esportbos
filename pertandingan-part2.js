// ===== ESPORTBOS - LIVE MATCH SIMULATION (PART 2) =====

function showMapResult(won) {
    const modal = document.getElementById('mapResultModal');
    const body = document.getElementById('mapResultBody');
    
    body.innerHTML = `
        <div class="map-result-display">
            <h2 class="${won ? 'victory' : 'defeat'}">
                ${won ? ' MAP WIN!' : '❌ MAP LOSS'}
            </h2>
            <div class="map-score">
                <span>RRQ Hoshi</span>
                <span class="score">${myKills} - ${enemyKills}</span>
                <span>Inter FC</span>
            </div>
            <div class="map-stats">
                <p>💰 Gold: ${(myGold/1000).toFixed(1)}k vs ${(enemyGold/1000).toFixed(1)}k</p>
                <p> Towers: ${myTowers} vs ${enemyTowers}</p>
                <p> Dragons: ${myDragons} vs ${enemyDragons}</p>
            </div>
            <div class="map-score-update">
                <p>Score: <strong>${myMapWins} - ${enemyMapWins}</strong></p>
            </div>
            <button class="btn-futuristic" onclick="nextMap()">
                ${myMapWins === 2 || enemyMapWins === 2 ? 'Lihat Hasil Akhir' : 'Lanjut Map Berikutnya'}
            </button>
        </div>
    `;
    
    modal.style.display = 'block';
}

function nextMap() {
    document.getElementById('mapResultModal').style.display = 'none';
    
    if (myMapWins === 2 || enemyMapWins === 2) {
        endMatch();
    } else {
        currentMap++;
        startMap();
    }
}

function endMatch() {
    const matchWon = myMapWins > enemyMapWins;
    
    updateStandings(matchWon);
    
    saveMatchHistory({
        lawan: "Inter FC",
        myWins: myMapWins,
        lawanWins: enemyMapWins,
        menang: matchWon,
        tanggal: new Date().toLocaleDateString('id-ID'),
        maps: mapResults
    });
    
    showFinalResult(matchWon);
}

function showFinalResult(won) {
    const modal = document.getElementById('matchModal');
    const body = document.getElementById('matchResultBody');
    
    const resultColor = won ? '#28a745' : '#dc3545';
    const resultText = won ? ' VICTORY!' : ' DEFEAT';
    const reward = won ? '+150 💰 | +5 Popularitas' : '+30 💰 | -2 Popularitas';
    
    body.innerHTML = `
        <div class="match-result-display">
            <div class="result-header" style="background: ${resultColor};">
                <h1>${resultText}</h1>
                <p>vs Inter FC</p>
            </div>
            
            <div class="result-score">
                <div class="score-team my-team">
                    <div class="team-logo-big">🏆</div>
                    <h3>RRQ Hoshi</h3>
                    <div class="score-number">${myMapWins}</div>
                </div>
                <div class="score-vs">-</div>
                <div class="score-team enemy-team">
                    <div class="team-logo-big">⚽</div>
                    <h3>Inter FC</h3>
                    <div class="score-number">${enemyMapWins}</div>
                </div>
            </div>
            
            <div class="maps-result">
                <h3>📊 Detail Maps</h3>
                ${mapResults.map(m => `
                    <div class="map-result ${m.won ? 'win' : 'lose'}">
                        <span>Map ${m.map}</span>
                        <span>${m.won ? '✅ WIN' : '❌ LOSE'}</span>
                        <span>K/D: ${m.kills}</span>
                        <span>⏱️ ${m.duration}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="match-reward wood-panel">
                <h3>🎁 Reward</h3>
                <p>${reward}</p>
            </div>
            
            <button class="btn-futuristic" onclick="closeMatchModal()">Lanjut</button>
        </div>
    `;
    
    modal.style.display = 'block';
    
    document.getElementById('liveMatchUI').style.display = 'none';
    document.getElementById('btnMainMatch').style.display = 'block';
    document.getElementById('tacticSetup').style.display = 'block';
}

function closeMatchModal() {
    document.getElementById('matchModal').style.display = 'none';
    renderMatchHistory();
}

// ===== HELPER FUNCTIONS =====

function renderSchedule() {
    const list = document.getElementById('scheduleList');
    if (!list) return;
    
    list.innerHTML = schedule.map(m => `
        <div class="schedule-item ${m.home ? 'home' : 'away'}">
            <div class="schedule-day">Hari ${m.hari}</div>
            <div class="schedule-opponent">
                ${m.home ? '🏠' : '✈️'} vs ${m.lawan}
            </div>
            <div class="schedule-time">${m.waktu}</div>
        </div>
    `).join('');
}

function renderStandings() {
    const tbody = document.getElementById('standingsBody');
    if (!tbody) return;
    
    tbody.innerHTML = standings.map(s => `
        <tr class="${s.nama === 'RRQ Hoshi' ? 'my-team' : ''}">
            <td>${s.rank}</td>
            <td><strong>${s.nama}</strong></td>
            <td>${s.main}</td>
            <td>${s.menang}</td>
            <td>${s.kalah}</td>
            <td><strong>${s.poin}</strong></td>
        </tr>
    `).join('');
}

function updateStandings(menang) {
    const myTeam = standings.find(s => s.nama === 'RRQ Hoshi');
    if (myTeam) {
        myTeam.main++;
        if (menang) {
            myTeam.menang++;
            myTeam.poin += 3;
        } else {
            myTeam.kalah++;
        }
    }
    renderStandings();
}

function saveMatchHistory(match) {
    const history = JSON.parse(localStorage.getItem('esportbos_match_history') || '[]');
    history.unshift(match);
    
    if (history.length > 10) {
        history.length = 10;
    }
    
    localStorage.setItem('esportbos_match_history', JSON.stringify(history));
}

function renderMatchHistory() {
    const container = document.getElementById('matchHistory');
    if (!container) return;
    
    const history = JSON.parse(localStorage.getItem('esportbos_match_history') || '[]');
    
    if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">Belum ada pertandingan.</p>';
        return;
    }
    
    container.innerHTML = history.map(m => `
        <div class="history-item ${m.menang ? 'win' : 'lose'}">
            <div class="history-result">${m.menang ? '✅ WIN' : '❌ LOSE'}</div>
            <div class="history-opponent">vs ${m.lawan}</div>
            <div class="history-score">${m.myWins} - ${m.lawanWins}</div>
            <div class="history-date">${m.tanggal}</div>
        </div>
    `).join('');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    event.target.classList.add('active');
}

// Init
document.addEventListener('DOMContentLoaded', function() {
    if (typeof EsportBosAuth !== 'undefined') {
        EsportBosAuth.requireAuth();
        const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
        if (user) {
            const userNameSpan = document.getElementById('userName');
            if (userNameSpan) userNameSpan.textContent = user.username;
        }
    }
    
    const power = hitungTeamPower();
    document.getElementById('myPower').textContent = power;
    
    renderSchedule();
    renderStandings();
    renderMatchHistory();
});
