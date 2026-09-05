// ===== ESPORTBOS - HALAMAN LATIHAN =====

// Training programs
const trainingPrograms = {
    mechanics: {
        name: "Mechanics Drill",
        icon: "",
        target: "mechanics",
        energyCost: 15,
        successRate: 0.75,
        minGain: 1,
        maxGain: 3
    },
    gamesense: {
        name: "Game Sense Training",
        icon: "🧠",
        target: "gameSense",
        energyCost: 15,
        successRate: 0.75,
        minGain: 1,
        maxGain: 3
    },
    teamwork: {
        name: "Team Coordination",
        icon: "🤝",
        target: "teamwork",
        energyCost: 15,
        successRate: 0.75,
        minGain: 1,
        maxGain: 3
    },
    stamina: {
        name: "Stamina & Recovery",
        icon: "⚡",
        target: "stamina",
        energyCost: -20, // Negative = restore energy
        successRate: 1.0,
        minGain: 5,
        maxGain: 10
    },
    balanced: {
        name: "Balanced Training",
        icon: "⚖️",
        target: "all",
        energyCost: 20,
        successRate: 0.70,
        minGain: 1,
        maxGain: 1
    },
    intensive: {
        name: "Intensive Bootcamp",
        icon: "",
        target: "all",
        energyCost: 40,
        successRate: 0.60,
        minGain: 2,
        maxGain: 4
    }
};

// Load players
function getPlayers() {
    return JSON.parse(localStorage.getItem('esportbos_players') || '[]');
}

// Save players
function savePlayers(players) {
    localStorage.setItem('esportbos_players', JSON.stringify(players));
}

// Get avatar URL
function getAvatarUrl(seed, index) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash = hash & hash;
    }
    const photoNum = Math.abs(hash) % 100;
    return `https://randomuser.me/api/portraits/men/${photoNum}.jpg`;
}

// Render individual training grid
function renderIndividualTraining() {
    const grid = document.getElementById('individualTrainingGrid');
    if (!grid) return;
    
    const players = getPlayers();
    
    grid.innerHTML = players.map(player => {
        const energy = player.energy || 100;
        const energyColor = energy > 60 ? '#28a745' : energy > 30 ? '#ffc107' : '#dc3545';
        
        return `
            <div class="player-training-card">
                <div class="player-training-header">
                    <img src="${getAvatarUrl(player.avatar, player.avatarIndex)}" class="training-avatar">
                    <div class="player-training-info">
                        <h4>${player.nama}</h4>
                        <p>${player.posisi} • ${player.role}</p>
                        <div class="energy-bar-container">
                            <div class="energy-bar" style="width: ${energy}%; background: ${energyColor};"></div>
                        </div>
                        <span class="energy-text">Energy: ${energy}/100</span>
                    </div>
                </div>
                
                <div class="training-actions">
                    <button class="btn-training" onclick="trainPlayer(${player.id}, 'mechanics')" ${energy < 15 ? 'disabled' : ''}>
                        🎯 MEC
                    </button>
                    <button class="btn-training" onclick="trainPlayer(${player.id}, 'gameSense')" ${energy < 15 ? 'disabled' : ''}>
                        🧠 GS
                    </button>
                    <button class="btn-training" onclick="trainPlayer(${player.id}, 'teamwork')" ${energy < 15 ? 'disabled' : ''}>
                        🤝 TW
                    </button>
                    <button class="btn-training restore" onclick="trainPlayer(${player.id}, 'stamina')" ${energy >= 100 ? 'disabled' : ''}>
                        ⚡ STA
                    </button>
                </div>
                
                <div class="player-stats-mini">
                    <div class="stat-mini">
                        <span class="stat-label">MEC</span>
                        <span class="stat-value">${player.stats.mechanics}</span>
                    </div>
                    <div class="stat-mini">
                        <span class="stat-label">GS</span>
                        <span class="stat-value">${player.stats.gameSense}</span>
                    </div>
                    <div class="stat-mini">
                        <span class="stat-label">TW</span>
                        <span class="stat-value">${player.stats.teamwork}</span>
                    </div>
                    <div class="stat-mini">
                        <span class="stat-label">STA</span>
                        <span class="stat-value">${player.stats.stamina}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    document.getElementById('totalPlayers').textContent = players.length;
}

// Train individual player
function trainPlayer(playerId, stat) {
    const players = getPlayers();
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    
    const program = trainingPrograms[stat];
    
    // Check energy
    if (program.energyCost > 0 && (player.energy || 100) < program.energyCost) {
        alert(`⚠️ Energy tidak cukup! ${player.nama} butuh ${program.energyCost} energy.`);
        return;
    }
    
    // Simulate training
    const success = Math.random() < program.successRate;
    const gain = success ? Math.floor(Math.random() * (program.maxGain - program.minGain + 1)) + program.minGain : 0;
    
    // Apply results
    if (program.target === 'all') {
        if (success) {
            player.stats.mechanics = Math.min(100, player.stats.mechanics + gain);
            player.stats.gameSense = Math.min(100, player.stats.gameSense + gain);
            player.stats.teamwork = Math.min(100, player.stats.teamwork + gain);
        }
    } else if (program.target === 'stamina') {
        player.energy = Math.min(100, (player.energy || 100) + gain);
        player.stats.stamina = Math.min(100, player.stats.stamina + gain);
    } else {
        if (success) {
            player.stats[program.target] = Math.min(100, player.stats[program.target] + gain);
        }
    }
    
    // Reduce energy
    if (program.energyCost > 0) {
        player.energy = Math.max(0, (player.energy || 100) - program.energyCost);
    }
    
    savePlayers(players);
    
    // Show result
    showTrainingResult(player, program, success, gain);
    
    // Re-render
    renderIndividualTraining();
}

// Show training result
function showTrainingResult(player, program, success, gain) {
    const modal = document.getElementById('trainingModal');
    const body = document.getElementById('trainingResultBody');
    
    const resultColor = success ? '#28a745' : '#dc3545';
    const resultText = success ? '✅ BERHASIL!' : '❌ GAGAL!';
    const resultMessage = success 
        ? `${player.nama} berhasil meningkatkan ${program.target === 'all' ? 'semua stats' : program.target.toUpperCase()} sebesar +${gain}!`
        : `${player.nama} gagal dalam latihan. Coba lagi nanti!`;
    
    body.innerHTML = `
        <div class="training-result-display">
            <div class="result-header" style="background: ${resultColor};">
                <h1>${resultText}</h1>
                <p>${program.name}</p>
            </div>
            
            <div class="result-content">
                <img src="${getAvatarUrl(player.avatar, player.avatarIndex)}" class="result-avatar">
                <h2>${player.nama}</h2>
                <p class="result-message">${resultMessage}</p>
                
                <div class="result-stats">
                    <div class="stat-change">
                        <span>MEC</span>
                        <span>${player.stats.mechanics}</span>
                    </div>
                    <div class="stat-change">
                        <span>GS</span>
                        <span>${player.stats.gameSense}</span>
                    </div>
                    <div class="stat-change">
                        <span>TW</span>
                        <span>${player.stats.teamwork}</span>
                    </div>
                    <div class="stat-change">
                        <span>STA</span>
                        <span>${player.stats.stamina}</span>
                    </div>
                </div>
                
                <div class="energy-update">
                    <span>Energy Tersisa:</span>
                    <span class="energy-value">${player.energy || 100}/100</span>
                </div>
            </div>
            
            <button class="btn-futuristic" onclick="closeTrainingModal()">Lanjut</button>
        </div>
    `;
    
    modal.style.display = 'block';
}

function closeTrainingModal() {
    document.getElementById('trainingModal').style.display = 'none';
}

// Team training
function startTeamTraining(programName) {
    const program = trainingPrograms[programName];
    if (!program) return;
    
    const players = getPlayers();
    const results = [];
    
    players.forEach(player => {
        // Check energy
        if (program.energyCost > 0 && (player.energy || 100) < program.energyCost) {
            results.push({
                player: player.nama,
                success: false,
                message: 'Energy tidak cukup'
            });
            return;
        }
        
        // Simulate
        const success = Math.random() < program.successRate;
        const gain = success ? Math.floor(Math.random() * (program.maxGain - program.minGain + 1)) + program.minGain : 0;
        
        // Apply
        if (program.target === 'all') {
            if (success) {
                player.stats.mechanics = Math.min(100, player.stats.mechanics + gain);
                player.stats.gameSense = Math.min(100, player.stats.gameSense + gain);
                player.stats.teamwork = Math.min(100, player.stats.teamwork + gain);
            }
        } else if (program.target === 'stamina') {
            player.energy = Math.min(100, (player.energy || 100) + gain);
            player.stats.stamina = Math.min(100, player.stats.stamina + gain);
        } else {
            if (success) {
                player.stats[program.target] = Math.min(100, player.stats[program.target] + gain);
            }
        }
        
        // Reduce energy
        if (program.energyCost > 0) {
            player.energy = Math.max(0, (player.energy || 100) - program.energyCost);
        }
        
        results.push({
            player: player.nama,
            success: success,
            gain: gain,
            message: success ? `+${gain} ${program.target.toUpperCase()}` : 'Gagal'
        });
    });
    
    savePlayers(players);
    
    // Show team result
    showTeamTrainingResult(program, results);
}

function showTeamTrainingResult(program, results) {
    const modal = document.getElementById('trainingModal');
    const body = document.getElementById('trainingResultBody');
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    body.innerHTML = `
        <div class="training-result-display">
            <div class="result-header" style="background: ${successCount > totalCount/2 ? '#28a745' : '#ffc107'};">
                <h1>📊 HASIL LATIHAN TIM</h1>
                <p>${program.name}</p>
            </div>
            
            <div class="result-content">
                <div class="team-summary">
                    <div class="summary-stat">
                        <span class="summary-value">${successCount}/${totalCount}</span>
                        <span class="summary-label">Berhasil</span>
                    </div>
                    <div class="summary-stat">
                        <span class="summary-value">${Math.round((successCount/totalCount)*100)}%</span>
                        <span class="summary-label">Success Rate</span>
                    </div>
                </div>
                
                <div class="team-results-list">
                    ${results.map(r => `
                        <div class="team-result-item ${r.success ? 'success' : 'fail'}">
                            <span>${r.player}</span>
                            <span>${r.message}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <button class="btn-futuristic" onclick="closeTrainingModal()">Lanjut</button>
        </div>
    `;
    
    modal.style.display = 'block';
    renderIndividualTraining();
}

// Schedule functions
function saveSchedule() {
    const schedule = {
        mon: document.getElementById('schedule-mon').value,
        tue: document.getElementById('schedule-tue').value,
        wed: document.getElementById('schedule-wed').value,
        thu: document.getElementById('schedule-thu').value,
        fri: document.getElementById('schedule-fri').value,
        sat: document.getElementById('schedule-sat').value,
        sun: document.getElementById('schedule-sun').value
    };
    localStorage.setItem('esportbos_training_schedule', JSON.stringify(schedule));
}

function loadSchedule() {
    const saved = localStorage.getItem('esportbos_training_schedule');
    if (saved) {
        const schedule = JSON.parse(saved);
        document.getElementById('schedule-mon').value = schedule.mon || 'rest';
        document.getElementById('schedule-tue').value = schedule.tue || 'rest';
        document.getElementById('schedule-wed').value = schedule.wed || 'rest';
        document.getElementById('schedule-thu').value = schedule.thu || 'rest';
        document.getElementById('schedule-fri').value = schedule.fri || 'rest';
        document.getElementById('schedule-sat').value = schedule.sat || 'rest';
        document.getElementById('schedule-sun').value = schedule.sun || 'rest';
    }
}

function runWeeklyTraining() {
    const schedule = {
        mon: document.getElementById('schedule-mon').value,
        tue: document.getElementById('schedule-tue').value,
        wed: document.getElementById('schedule-wed').value,
        thu: document.getElementById('schedule-thu').value,
        fri: document.getElementById('schedule-fri').value,
        sat: document.getElementById('schedule-sat').value,
        sun: document.getElementById('schedule-sun').value
    };
    
    const trainingDays = Object.values(schedule).filter(s => s !== 'rest').length;
    
    if (trainingDays === 0) {
        alert('⚠️ Tidak ada jadwal latihan! Atur minimal 1 hari latihan.');
        return;
    }
    
    if (!confirm(`Jalankan jadwal latihan minggu ini (${trainingDays} hari latihan)?`)) return;
    
    // Simulate each day
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const results = [];
    
    days.forEach((day, index) => {
        const programName = schedule[day];
        if (programName === 'rest') return;
        
        const program = trainingPrograms[programName];
        const players = getPlayers();
        let daySuccess = 0;
        
        players.forEach(player => {
            if (program.energyCost > 0 && (player.energy || 100) < program.energyCost) {
                return;
            }
            
            const success = Math.random() < program.successRate;
            const gain = success ? Math.floor(Math.random() * (program.maxGain - program.minGain + 1)) + program.minGain : 0;
            
            if (program.target === 'all') {
                if (success) {
                    player.stats.mechanics = Math.min(100, player.stats.mechanics + gain);
                    player.stats.gameSense = Math.min(100, player.stats.gameSense + gain);
                    player.stats.teamwork = Math.min(100, player.stats.teamwork + gain);
                }
            } else if (program.target === 'stamina') {
                player.energy = Math.min(100, (player.energy || 100) + gain);
                player.stats.stamina = Math.min(100, player.stats.stamina + gain);
            } else {
                if (success) {
                    player.stats[program.target] = Math.min(100, player.stats[program.target] + gain);
                }
            }
            
            if (program.energyCost > 0) {
                player.energy = Math.max(0, (player.energy || 100) - program.energyCost);
            }
            
            if (success) daySuccess++;
        });
        
        savePlayers(players);
        
        results.push({
            day: dayNames[index],
            program: program.name,
            success: daySuccess,
            total: players.length
        });
    });
    
    // Show weekly result
    const modal = document.getElementById('trainingModal');
    const body = document.getElementById('trainingResultBody');
    
    body.innerHTML = `
        <div class="training-result-display">
            <div class="result-header" style="background: #00d4ff;">
                <h1> HASIL MINGGUAN</h1>
                <p>${trainingDays} Hari Latihan</p>
            </div>
            
            <div class="result-content">
                <div class="weekly-results">
                    ${results.map(r => `
                        <div class="weekly-day-result">
                            <span class="day-name">${r.day}</span>
                            <span class="day-program">${r.program}</span>
                            <span class="day-success">${r.success}/${r.total} Berhasil</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <button class="btn-futuristic" onclick="closeTrainingModal()">Lanjut</button>
        </div>
    `;
    
    modal.style.display = 'block';
    renderIndividualTraining();
}

// Tab switching
function switchTrainingTab(tabName) {
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
    
    renderIndividualTraining();
    loadSchedule();
    
    // Close modal on outside click
    window.onclick = function(event) {
        const modal = document.getElementById('trainingModal');
        if (event.target === modal) {
            closeTrainingModal();
        }
    };
});
