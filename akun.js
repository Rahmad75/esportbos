import {
  signOut,
  updatePassword
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  doc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import {
  auth,
  db,
  storage,
  getCurrentUserOnce,
  getOrCreateProfile,
  getOrCreateTeam,
  handleFirestoreError,
  OperationType
} from './firebase-config.js';

let currentUserId = null;
let currentTeamId = null;

function handleLogout() {
  signOut(auth).then(() => { window.location.href = 'index.html'; });
}

function switchAkunTab(tabName, btnElement) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const target = document.getElementById('tab-' + tabName);
  if (target) target.style.display = 'block';
  if (btnElement) btnElement.classList.add('active');
}

// Upload Foto ke Firebase Storage (terjadi hanya saat user memilih file / klik upload)
async function uploadAvatar(input) {
  const file = input.files[0];
  const statusEl = document.getElementById('uploadStatus');

  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    alert('Ukuran file terlalu besar! Maksimal 2MB.');
    input.value = '';
    return;
  }

  if (!file.type.startsWith('image/')) {
    alert('File harus berupa gambar!');
    input.value = '';
    return;
  }

  try {
    statusEl.textContent = '⏳ Mengupload foto...';
    statusEl.style.color = '#ffc107';

    const fileExt = file.name.split('.').pop() || 'png';
    const storageRef = ref(storage, `avatars/${currentUserId}/avatar_${Date.now()}.${fileExt}`);
    await uploadBytes(storageRef, file);
    const avatarUrl = await getDownloadURL(storageRef);

    await updateDoc(doc(db, 'profiles', currentUserId), {
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString()
    });

    document.getElementById('profileAvatar').src = avatarUrl;
    document.getElementById('navAvatar').src = avatarUrl;

    statusEl.textContent = '✅ Upload berhasil!';
    statusEl.style.color = '#28a745';
  } catch (err) {
    console.error('Error upload avatar:', err);
    statusEl.textContent = '❌ Gagal upload. Pastikan Firebase Storage aktif.';
    statusEl.style.color = '#ff6b6b';
    alert('Gagal upload foto: ' + err.message);
  }

  input.value = '';
}

async function removeAvatar() {
  if (!confirm('Yakin ingin menghapus foto profil?')) return;

  try {
    await updateDoc(doc(db, 'profiles', currentUserId), {
      avatar_url: null,
      updated_at: new Date().toISOString()
    });

    const username = document.getElementById('usernameInput').value || 'default';
    const defaultAvatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username;

    document.getElementById('profileAvatar').src = defaultAvatar;
    document.getElementById('navAvatar').src = defaultAvatar;

    alert('Foto profil dihapus.');
  } catch (err) {
    alert('Gagal menghapus foto.');
  }
}

async function updateProfile() {
  const username = document.getElementById('usernameInput').value.trim();
  const clubName = document.getElementById('clubNameInput').value.trim();
  const bio = document.getElementById('bioInput').value.trim();
  const country = document.getElementById('countryInput').value;
  const city = document.getElementById('cityInput').value.trim();

  if (!username || !clubName) {
    alert('Username dan Nama Klub wajib diisi!');
    return;
  }

  try {
    await updateDoc(doc(db, 'profiles', currentUserId), {
      username: username,
      club_name: clubName,
      bio: bio,
      country: country,
      city: city,
      updated_at: new Date().toISOString()
    });

    if (currentTeamId) {
      await updateDoc(doc(db, 'teams', currentTeamId), {
        team_name: clubName,
        updated_at: new Date().toISOString()
      });
    }

    document.getElementById('userName').textContent = username;
    document.getElementById('clubName').textContent = clubName;

    alert('✅ Profil berhasil diupdate! Silakan refresh halaman untuk memastikan sinkronisasi penuh.');
  } catch (err) {
    console.error('Error update profile:', err);
    handleFirestoreError(err, OperationType.UPDATE, `profiles/${currentUserId}`);
  }
}

async function changePassword() {
  const newPass = document.getElementById('newPassword').value;
  const confirmPass = document.getElementById('confirmPassword').value;

  if (newPass !== confirmPass) {
    alert('Password baru dan konfirmasi tidak cocok!');
    return;
  }

  if (newPass.length < 6) {
    alert('Password minimal 6 karakter!');
    return;
  }

  try {
    if (!auth.currentUser) throw new Error('User belum login.');
    await updatePassword(auth.currentUser, newPass);
    alert('✅ Password berhasil diubah!');
    document.getElementById('passwordForm').reset();
  } catch (err) {
    alert('Gagal ubah password: ' + err.message + ' (Jika diminta, silakan login ulang terlebih dahulu).');
  }
}

function enable2FA() {
  alert('🔐 Fitur 2FA dikelola melalui Firebase Authentication Console (Multi-Factor Authentication).');
}

async function logoutAllDevices() {
  if (!confirm('Yakin ingin logout dari sesi ini?')) return;
  await signOut(auth);
  window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    const user = await getCurrentUserOnce();
    if (!user) { window.location.href = 'index.html'; return; }
    currentUserId = user.uid;

    const profile = await getOrCreateProfile(user);
    if (profile) {
      const username = profile.username || user.email.split('@')[0];
      document.getElementById('userName').textContent = username;
      document.getElementById('usernameInput').value = username;
      document.getElementById('emailInput').value = user.email || '';
      document.getElementById('clubNameInput').value = profile.club_name || '';
      document.getElementById('bioInput').value = profile.bio || '';
      document.getElementById('countryInput').value = profile.country || 'ID';
      document.getElementById('cityInput').value = profile.city || '';

      const avatarUrl = profile.avatar_url || ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + username);
      document.getElementById('profileAvatar').src = avatarUrl;
      document.getElementById('navAvatar').src = avatarUrl;

      document.getElementById('diamondBalance').textContent = (profile.diamonds || 0).toLocaleString('id-ID');
      document.getElementById('goldBalance').textContent = (profile.gold || 0).toLocaleString('id-ID');
      document.getElementById('currencyBalance').textContent = (profile.currency || 0).toLocaleString('id-ID');
    }

    const team = await getOrCreateTeam(user, profile?.club_name);
    if (team) {
      currentTeamId = team.id;
      document.getElementById('clubName').textContent = team.team_name || 'My Club';
      if (!document.getElementById('clubNameInput').value) {
        document.getElementById('clubNameInput').value = team.team_name || '';
      }
      document.getElementById('clubRank').textContent = (team.wins || 0) + 'W-' + (team.draws || 0) + 'D-' + (team.losses || 0) + 'L';
      document.getElementById('popularityText').textContent = 'Popularitas Klub: ' + (team.popularity || 0) + '%';
      document.getElementById('popularityBar').style.width = (team.popularity || 0) + '%';
      document.getElementById('moralText').textContent = 'Moral Tim: ' + (team.moral || 0) + '%';
      document.getElementById('moralBar').style.width = (team.moral || 0) + '%';
    }
  } catch (error) {
    console.error('Akun error:', error);
  }
});

window.handleLogout = handleLogout;
window.switchAkunTab = switchAkunTab;
window.uploadAvatar = uploadAvatar;
window.removeAvatar = removeAvatar;
window.updateProfile = updateProfile;
window.changePassword = changePassword;
window.enable2FA = enable2FA;
window.logoutAllDevices = logoutAllDevices;
