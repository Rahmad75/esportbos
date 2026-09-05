// ===== ESPORTBOS - HALAMAN TAKTIK =====

// Default tactics
const defaultTactics = {
    formation: {
        top: null,
        jungle: null,
        mid: null,
        adc: null,
        support: null
    },
    style: {
        tempo: 50,
        aggression: 50,
        roaming: 50,
        objectives: ['dragon']
    },
    instructions: {},
    synergy: 0
};

// Presets
const presets = {
    aggressive: {
        name: "Aggressive Early Game",
        style: { tempo: 20, aggression: 85, roaming: 70, objectives: ['dragon', 'fight'] }
    },
    balanced: {
        name: "Balanced Control",
        style: { tempo: 50, aggression: 50, roaming: 50, objectives: ['dragon', 'tower'] }
    },
    defensive: {
        name: "Defensive Late Game",
        style: { tempo: 80, aggression: 25, roaming: 30, objectives: ['tower', 'vision'] }
    },
    hypercarry: {
        name: "Hyper Carry",
        style: { tempo: 75, aggression: 40, roaming: 40, objectives: ['dragon', 'vision'] }
    },
    teamfight: {
        name: "Team Fight Oriented",
        style: { tempo: 50, aggression: 80, roaming: 60, objectives: ['fight', 'dragon'] }
    }
};

let currentTactics = null;
let selectedPosition = null;

// Load tactics
function loadTactics() {
    const saved = localStorage.getItem('esportbos_tactics');
    if (saved) {
        currentTactics = JSON.parse(saved);
    } else {
        currentTactics = JSON.parse(JSON.stringify(defaultTactics));
    }
}

// Save tactics
function saveTactics() {
    localStorage.setItem('esportbos_tactics', JSON.stringify(currentTactics));
    alert('✅ Taktik berhasil disimpan!');
    calculateSynergy();
}

// Load players
function getPlayers() {
    return JSON.parse(localStorage.getItem('esportbos_players') || '[]');
}

// Render formation roster
function renderFormationRoster() {
    const container = document.getElementById('formationRoster');
    if (!container) return;
    
    const players = getPlayers();
    const formation = currentTactics.formation;
    
    let html = '<div class="roster-list">';
    const positions = ['top', 'jungle', 'mid', 'adc', 'support'];
    
    positions.forEach(pos => {
        const playerId = formation[pos];
        const player = players.find(p => p.id === playerId);
        
        html += `
            <div class="roster-item">
                <span class="roster-pos">${pos.toUpperCase()}</span>
                <span class="roster-player">${player ? player.nama : '❓ Belum dipilih'}</span>
                ${player ? `<button class="btn-small" onclick="openPositionPicker('${pos}')">Ganti</button>` : ''}
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// Update slot display
function updateSlotDisplay(pos, playerId) {
    const slot = document.getElementById(`slot-${pos}`);
    if (!slot) return;
    
    const players = getPlayers();
    const player = players.find(p => p.id === playerId);
    
    if (player) {
        slot.innerHTML = `
            <img src="${getAvatarUrl(player.avatar, player.avatarIndex)}" class="slot-avatar">
            <span class="slot-name">${player.nama}</span>
        `;
        slot.classList.add('filled');
    } else {
        slot.innerHTML = '<span class="slot-icon">❓</span>';
        slot.classList.remove('filled');
    }
}

function getAvatarUrl(seed, index) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash = hash & hash;
    }
    const photoNum = Math.abs(hash) % 100;
    return `https://randomuser.me/api/portraits/men/${photoNum}.jpg`;
}

// Open player picker
function openPositionPicker(pos) {
    selectedPosition = pos;
    const modal = document.getElementById('playerPickerModal');
    const title = document.getElementById('pickerTitle');
    const list = document.getElementById('pickerList');
    
    title.textContent = `Pilih Pemain untuk Posisi ${pos.toUpperCase()}`;
    
    const players = getPlayers();
    const formation = currentTactics.formation;
    
    // Cek pemain yang sudah di posisi lain
    const usedPlayers = Object.values(formation).filter(id => id !== null);
    
    let html = '<div class="picker-grid">';
    players.forEach(player => {
        const isUsed = usedPlayers.includes(player.id);
        const isCurrent = formation[pos] === player.id;
        
        html += `
            <div class="picker-card ${isUsed && !isCurrent ? 'disabled' : ''} ${isCurrent ? 'selected' : ''}" 
                 onclick="${isUsed && !isCurrent ? '' : `selectPlayer(${player.id})`}">
                <img src="${getAvatarUrl(player.avatar, player.avatarIndex)}" class="picker-avatar">
                <div class="picker-info">
                    <h4>${player.nama}</h4>
                    <p>${player.posisi} • ${player.role}</p>
                    <p>⭐ ${Math.round((player.stats.mechanics + player.stats.gameSense + player.stats.teamwork) / 3)}</p>
                </div>
                ${isCurrent ? '<div class="picker-badge">✓ Aktif</div>' : ''}
                ${isUsed && !isCurrent ? '<div class="picker-badge used">Sudah Dipakai</div>' : ''}
            </div>
        `;
    });
    html += '</div>';
    
    list.innerHTML = html;
    modal.style.display = 'block';
}

// Select player
function selectPlayer(playerId) {
    currentTactics.formation[selectedPosition] = playerId;
    updateSlotDisplay(selectedPosition, playerId);
    renderFormationRoster();
    closePlayerPicker();
    calculateSynergy();
}

function closePlayerPicker() {
    document.getElementById('playerPickerModal').style.display = 'none';
}

// Reset formation
function resetFormation() {
    if (!confirm('Yakin mau reset formasi?')) return;
    currentTactics.formation = { top: null, jungle: null, mid: null, adc: null, support: null };
    
    ['top', 'jungle', 'mid', 'adc', 'support'].forEach(pos => {
        updateSlotDisplay(pos, null);
    });
    renderFormationRoster();
    calculateSynergy();
}

// Slider updates
function updateSlider(type) {
    const slider = document.getElementById(`${type}Slider`);
    const value = document.getElementById(`${type}Value`);
    const val = parseInt(slider.value);
    
    let label = 'Balanced';
    if (val < 30) label = type === 'tempo' ? 'Early Game' : type === 'aggression' ? 'Defensive' : 'Stay Lane';
    else if (val > 70) label = type === 'tempo' ? 'Late Game' : type === 'aggression' ? 'Aggressive' : 'Full Roam';
    
    value.textContent = `${label} (${val})`;
    currentTactics.style[type] = val;
    calculateSynergy();
}

// Render player instructions
function renderPlayerInstructions() {
    const container = document.getElementById('playerInstructions');
    if (!container) return;
    
    const players = getPlayers();
    const formation = currentTactics.formation;
    
    let html = '';
    players.forEach(player => {
        const pos = Object.keys(formation).find(k => formation[k] === player.id);
        const instr = currentTactics.instructions[player.id] || {};
        
        html += `
            <div class="instruction-card">
                <div class="instruction-header">
                    <img src="${getAvatarUrl(player.avatar, player.avatarIndex)}" class="instruction-avatar">
                    <div>
                        <h4>${player.nama}</h4>
                        <p>${pos ? pos.toUpperCase() : 'Bench'} • ${player.posisi}</p>
                    </div>
                </div>
                <div class="instruction-options">
                    <label>
                        <span>🎯 Role Focus:</span>
                        <select onchange="updateInstruction(${player.id}, 'role', this.value)">
                            <option value="default" ${instr.role === 'default' ? 'selected' : ''}>Default</option>
                            <option value="carry" ${instr.role === 'carry' ? 'selected' : ''}>Carry (Damage Focus)</option>
                            <option value="tank" ${instr.role === 'tank' ? 'selected' : ''}>Tank (Protect Team)</option>
                            <option value="support" ${instr.role === 'support' ? 'selected' : ''}>Support (Utility)</option>
                            <option value="flex" ${instr.role === 'flex' ? 'selected' : ''}>Flex (Adapt)</option>
                        </select>
                    </label>
                    <label>
                        <span>🌍 Roaming:</span>
                        <select onchange="updateInstruction(${player.id}, 'roaming', this.value)">
                            <option value="default" ${instr.roaming === 'default' ? 'selected' : ''}>Default</option>
                            <option value="aggressive" ${instr.roaming === 'aggressive' ? 'selected' : ''}>Aggressive Roam</option>
                            <option value="moderate" ${instr.roaming === 'moderate' ? 'selected' : ''}>Moderate</option>
                            <option value="stay" ${instr.roaming === 'stay' ? 'selected' : ''}>Stay Lane</option>
                        </select>
                    </label>
                    <label>
                        <span>⭐ Captain:</span>
                        <input type="checkbox" ${instr.captain ? 'checked' : ''} onchange="updateInstruction(${player.id}, 'captain', this.checked)">
                    </label>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function updateInstruction(playerId, key, value) {
    if (!currentTactics.instructions[playerId]) {
        currentTactics.instructions[playerId] = {};
    }
    currentTactics.instructions[playerId][key] = value;
    calculateSynergy();
}

// Load preset
function loadPreset(presetName) {
    const preset = presets[presetName];
    if (!preset) return;
    
    if (!confirm(`Terapkan preset "${preset.name}"? Taktik saat ini akan diganti.`)) return;
    
    currentTactics.style = JSON.parse(JSON.stringify(preset.style));
    
    // Update sliders
    document.getElementById('tempoSlider').value = preset.style.tempo;
    document.getElementById('aggressionSlider').value = preset.style.aggression;
    document.getElementById('roamingSlider').value = preset.style.roaming;
    
    updateSlider('tempo');
    updateSlider('aggression');
    updateSlider('roaming');
    
    // Update checkboxes
    document.getElementById('objDragon').checked = preset.style.objectives.includes('dragon');
    document.getElementById('objTower').checked = preset.style.objectives.includes('tower');
    document.getElementById('objFight').checked = preset.style.objectives.includes('fight');
    document.getElementById('objVision').checked = preset.style.objectives.includes('vision');
    
    alert(`✅ Preset "${preset.name}" berhasil diterapkan!`);
    calculateSynergy();
}

function saveCustomPreset() {
    const name = prompt('Nama preset kustom:');
    if (!name) return;
    
    presets['custom_' + Date.now()] = {
        name: name,
        style: JSON.parse(JSON.stringify(currentTactics.style))
    };
    
    alert(`✅ Preset "${name}" berhasil disimpan!`);
}

// Calculate synergy
function calculateSynergy() {
    const players = getPlayers();
    const formation = currentTactics.formation;
    const style = currentTactics.style;
    
    let score = 0;
    let breakdown = [];
    
    // 1. Formation completeness (25%)
    const filled = Object.values(formation).filter(id => id !== null).length;
    const formationScore = (filled / 5) * 25;
    breakdown.push({ label: 'Formasi Lengkap', score: formationScore, max: 25 });
    score += formationScore;
    
    // 2. Role matching (25%)
    let roleScore = 0;
    const roleMap = {
        top: ['Tank', 'Fighter'],
        jungle: ['Support', 'Fighter'],
        mid: ['Carry', 'Mage'],
        adc: ['Carry', 'Marksman'],
        support: ['Support', 'Tank']
    };
    
    Object.keys(formation).forEach(pos => {
        const playerId = formation[pos];
        if (playerId) {
            const player = players.find(p => p.id === playerId);
            if (player && roleMap[pos].includes(player.role)) {
                roleScore += 5;
            }
        }
    });
    breakdown.push({ label: 'Kecocokan Role', score: roleScore, max: 25 });
    score += roleScore;
    
    // 3. Style-aggression match (25%)
    let styleScore = 0;
    const avgMechanics = players.length > 0 ? players.reduce((sum, p) => sum + p.stats.mechanics, 0) / players.length : 50;
    const avgGameSense = players.length > 0 ? players.reduce((sum, p) => sum + p.stats.gameSense, 0) / players.length : 50;
    
    if (style.aggression > 70 && avgMechanics > 80) styleScore += 12;
    else if (style.aggression < 30 && avgGameSense > 80) styleScore += 12;
    else styleScore += 6;
    
    if (style.tempo > 70 && avgGameSense > 75) styleScore += 13;
    else if (style.tempo < 30 && avgMechanics > 75) styleScore += 13;
    else styleScore += 6;
    
    breakdown.push({ label: 'Kecocokan Gaya', score: styleScore, max: 25 });
    score += styleScore;
    
    // 4. Captain assigned (25%)
    const hasCaptain = Object.values(currentTactics.instructions).some(i => i.captain);
    const captainScore = hasCaptain ? 25 : 0;
    breakdown.push({ label: 'Kapten Ditunjuk', score: captainScore, max: 25 });
    score += captainScore;
    
    // Update UI
    const fill = document.getElementById('synergyFill');
    const value = document.getElementById('synergyValue');
    const breakdownEl = document.getElementById('synergyBreakdown');
    
    if (fill) {
        fill.style.width = `${score}%`;
        fill.className = 'synergy-fill ' + (score < 40 ? 'low' : score < 70 ? 'medium' : 'high');
    }
    if (value) value.textContent = `${Math.round(score)}%`;
    
    if (breakdownEl) {
        breakdownEl.innerHTML = breakdown.map(b => `
            <div class="breakdown-item">
                <span>${b.label}</span>
                <div class="breakdown-bar">
                    <div class="breakdown-fill" style="width: ${(b.score/b.max)*100}%"></div>
                </div>
                <span>${Math.round(b.score)}/${b.max}</span>
            </div>
        `).join('');
    }
    
    currentTactics.synergy = score;
}

// Tab switching
function switchTacticTab(tabName) {
    document.querySelectorAll('#taktik-body .tab-content, .tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    const tab = document.getElementById(`tab-${tabName}`);
    if (tab) tab.style.display = 'block';
    
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
    
    loadTactics();
    
    // Update slot displays
    Object.keys(currentTactics.formation).forEach(pos => {
        updateSlotDisplay(pos, currentTactics.formation[pos]);
    });
    
    renderFormationRoster();
    renderPlayerInstructions();
    
    // Update sliders
    document.getElementById('tempoSlider').value = currentTactics.style.tempo;
    document.getElementById('aggressionSlider').value = currentTactics.style.aggression;
    document.getElementById('roamingSlider').value = currentTactics.style.roaming;
    updateSlider('tempo');
    updateSlider('aggression');
    updateSlider('roaming');
    
    // Update checkboxes
    const objs = currentTactics.style.objectives || [];
    document.getElementById('objDragon').checked = objs.includes('dragon');
    document.getElementById('objTower').checked = objs.includes('tower');
    document.getElementById('objFight').checked = objs.includes('fight');
    document.getElementById('objVision').checked = objs.includes('vision');
    
    calculateSynergy();
    
    // Close modal on outside click
    window.onclick = function(event) {
        const modal = document.getElementById('playerPickerModal');
        if (event.target === modal) {
            closePlayerPicker();
        }
    };
});
