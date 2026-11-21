import { signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  auth,
  db,
  getCurrentUserOnce,
  getOrCreateProfile,
  getOrCreateTeam
} from './firebase-config.js';

let currentUserId = null;
let currentTeamId = null;
let currentFormation = { top: null, jungle: null, mid: null, adc: null, support: null };
let myPlayers = [];

async function handleLogout() {
  await signOut(auth);
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async function() {
  const user = await getCurrentUserOnce();
  if (!user) { window.location.href = 'index.html'; return; }
  currentUserId = user.uid;

  const profile = await getOrCreateProfile(user);
  const team = await getOrCreateTeam(user, profile?.club_name);

  if (profile) {
    const username = profile.username || user.email.split('@')[0];
    document.getElementById('userName').textContent = username;
    document.getElementById('navAvatar').src = profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
    document.getElementById('diamondBalance').textContent = (profile.diamonds || 0).toLocaleString('id-ID');
    document.getElementById('goldBalance').textContent = (profile.gold || 0).toLocaleString('id-ID');
    document.getElementById('currencyBalance').textContent = (profile.currency || 0).toLocaleString('id-ID');
  }

  if (team) {
    currentTeamId = team.id;
    document.getElementById('clubName').textContent = team.team_name;
    document.getElementById('infoTeamName').textContent = team.team_name;
    document.getElementById('clubRank').textContent = `${team.wins}W-${team.draws}D-${team.losses}L`;
    document.getElementById('popularityText').textContent = `Popularitas: ${team.popularity}%`;
    document.getElementById('popularityBar').style.width = `${team.popularity}%`;
    document.getElementById('moralText').textContent = `Moral: ${team.moral}%`;
    document.getElementById('moralBar').style.width = `${team.moral}%`;

    const q = query(collection(db, 'players'), where('owner_id', '==', currentUserId));
    const snap = await getDocs(q);
    myPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.team_id === team.id);
    await loadTacticsFromFirebase(team.id);
  }
});

function switchTacticTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tab}`).style.display = 'block';
  if (window.event && window.event.target) window.event.target.classList.add('active');
}

function updateSlider(type) {
  const val = document.getElementById(`${type}Slider`).value;
  const text = val < 40 ? 'Low' : val > 60 ? 'High' : 'Balanced';
  document.getElementById(`${type}Value`).textContent = `${text} (${val})`;
  calculateSynergy();
}

function openPositionPicker(pos) {
  const modal = document.getElementById('playerPickerModal');
  const list = document.getElementById('pickerList');
  document.getElementById('pickerTitle').textContent = `Pilih ${pos.toUpperCase()}`;

  if (myPlayers.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:#aaa;">Belum ada pemain</p>';
  } else {
    list.innerHTML = myPlayers.map(p => `
      <div onclick="assignPlayer('${pos}','${p.name}',${p.overall_rating})"
           style="padding:10px;border-bottom:1px solid #333;cursor:pointer;">
        <strong>${p.name}</strong> (${p.position}) -
        <span style="color:#ffd700;">${p.overall_rating}</span>
      </div>
    `).join('');
  }
  modal.style.display = 'flex';
  modal.style.position = 'fixed';
  modal.style.top = '0'; modal.style.left = '0';
  modal.style.width = '100%'; modal.style.height = '100%';
  modal.style.background = 'rgba(0,0,0,0.8)';
  modal.style.zIndex = '9999';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
}

function closePlayerPicker() {
  document.getElementById('playerPickerModal').style.display = 'none';
}

function assignPlayer(pos, name, rating) {
  currentFormation[pos] = { name, rating };
  document.getElementById(`slot-${pos}`).innerHTML =
    `<span style="font-size:10px;color:#fff;">${name}</span><br><span style="color:#ffd700;">${rating}</span>`;
  document.getElementById(`slot-${pos}`).style.background = '#00d4ff';
  closePlayerPicker();
  calculateSynergy();
}

function resetFormation() {
  ['top', 'jungle', 'mid', 'adc', 'support'].forEach(pos => {
    currentFormation[pos] = null;
    document.getElementById(`slot-${pos}`).innerHTML = '<span class="slot-icon">❓</span>';
    document.getElementById(`slot-${pos}`).style.background = 'transparent';
  });
  calculateSynergy();
}

function calculateSynergy() {
  const filled = Object.values(currentFormation).filter(v => v !== null).length;
  const synergy = Math.min(100, (filled / 5) * 100);
  document.getElementById('synergyFill').style.width = `${synergy}%`;
  document.getElementById('synergyValue').textContent = `${synergy}%`;
}

function loadPreset(type) {
  if (type === 'aggressive') {
    document.getElementById('tempoSlider').value = 20;
    document.getElementById('aggressionSlider').value = 80;
  } else if (type === 'balanced') {
    document.getElementById('tempoSlider').value = 50;
    document.getElementById('aggressionSlider').value = 50;
  } else if (type === 'defensive') {
    document.getElementById('tempoSlider').value = 80;
    document.getElementById('aggressionSlider').value = 20;
  }
  updateSlider('tempo');
  updateSlider('aggression');
  alert('Preset dimuat! Klik Simpan.');
}

async function loadTacticsFromFirebase(teamId) {
  if (!teamId) return;
  try {
    const snap = await getDoc(doc(db, 'team_tactics', teamId));
    if (snap.exists()) {
      const data = snap.data();
      if (data.formation) {
        currentFormation = data.formation;
        for (const [pos, player] of Object.entries(currentFormation)) {
          if (player) {
            document.getElementById(`slot-${pos}`).innerHTML =
              `<span style="font-size:10px;color:#fff;">${player.name}</span><br><span style="color:#ffd700;">${player.rating}</span>`;
            document.getElementById(`slot-${pos}`).style.background = '#00d4ff';
          }
        }
      }
      if (data.tempo !== undefined) { document.getElementById('tempoSlider').value = data.tempo; updateSlider('tempo'); }
      if (data.aggression !== undefined) { document.getElementById('aggressionSlider').value = data.aggression; updateSlider('aggression'); }
      calculateSynergy();
    }
  } catch (err) {
    console.error('Error loading tactics:', err);
  }
}

async function saveTacticsToFirebase() {
  if (!currentTeamId) return alert('Tim tidak ditemukan');

  const tacticsData = {
    team_id: currentTeamId,
    user_id: currentUserId,
    formation: currentFormation,
    tempo: parseInt(document.getElementById('tempoSlider').value),
    aggression: parseInt(document.getElementById('aggressionSlider').value),
    updated_at: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'team_tactics', currentTeamId), tacticsData, { merge: true });
    alert('✅ Taktik tersimpan!');
  } catch (error) {
    alert('❌ Gagal: ' + error.message);
  }
}

window.handleLogout = handleLogout;
window.switchTacticTab = switchTacticTab;
window.updateSlider = updateSlider;
window.openPositionPicker = openPositionPicker;
window.closePlayerPicker = closePlayerPicker;
window.assignPlayer = assignPlayer;
window.resetFormation = resetFormation;
window.loadPreset = loadPreset;
window.saveTacticsToFirebase = saveTacticsToFirebase;
window.saveTacticsToSupabase = saveTacticsToFirebase;
