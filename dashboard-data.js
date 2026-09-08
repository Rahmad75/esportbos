// ===== ESPORTBOS DASHBOARD DATA MANAGER =====

// Fungsi untuk load data user dari localStorage
function loadUserData() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) return;
    
    const email = user.email;
    
    // Load profil klub
    const clubName = localStorage.getItem(`esportbos_club_name_${email}`) || 'My Club';
    const clubRank = localStorage.getItem(`esportbos_club_rank_${email}`) || '16th in C.4';
    const popularity = parseInt(localStorage.getItem(`esportbos_popularity_${email}`) || '76');
    const moral = parseInt(localStorage.getItem(`esportbos_moral_${email}`) || '78');
    
    // Update UI
    document.querySelector('.team-name').textContent = clubName;
    document.querySelector('.team-rank').textContent = clubRank;
    document.querySelector('.team-popularity span').textContent = `Popularitas Klub: ${popularity}%`;
    document.querySelector('.pop-fill').style.width = `${popularity}%`;
    document.querySelector('.team-moral span').textContent = `Moral Tim: ${moral}%`;
    document.querySelector('.moral-fill').style.width = `${moral}%`;
}

// Fungsi untuk load pertandingan
function loadMatches() {
    const user = JSON.parse(localStorage.getItem('esportbos_current_user'));
    if (!user) return;
    
    const email = user.email;
    
    // Load match terakhir
    const lastMatch = JSON.parse(localStorage.getItem(`esportbos_last_match_${email}`) || 'null');
    if (lastMatch) {
        document.querySelector('.match-last .team-home').textContent = lastMatch.home;
        document.querySelector('.match-last .score-home').textContent = lastMatch.homeScore;
        document.querySelector('.match-last .score-away').textContent = lastMatch.awayScore;
        document.querySelector('.match-last .team-away').textContent = lastMatch.away;
        document.querySelector('.match-last .match-info').textContent = `${lastMatch.league} - ${lastMatch.time}`;
    }
    
    // Load match selanjutnya
    const nextMatch = JSON.parse(localStorage.getItem(`esportbos_next_match_${email}`) || 'null');
    if (nextMatch) {
        document.querySelector('.match-next .team-home').textContent = nextMatch.home;
        document.querySelector('.match-next .team-away').textContent = nextMatch.away;
        document.querySelector('.match-next .match-info').textContent = `${nextMatch.league} - dalam ${nextMatch.time}`;
    }
}

// Fungsi untuk load forum posts
function loadForumPosts() {
    const posts = JSON.parse(localStorage.getItem('esportbos_forum_posts') || '[]');
    
    if (posts.length === 0) {
        // Default posts kalau belum ada
        const defaultPosts = [
            { title: "Selamat datang di EsportBos!", author: "Admin", time: "Baru saja" },
            { title: "Tips untuk manager pemula", author: "ProManager", time: "1 jam lalu" },
            { title: "Cara mendapatkan Gold dengan cepat", author: "GoldHunter", time: "2 jam lalu" }
        ];
        localStorage.setItem('esportbos_forum_posts', JSON.stringify(defaultPosts));
    }
    
    const forumContainer = document.querySelector('.forum-posts');
    if (forumContainer) {
        const postsToShow = JSON.parse(localStorage.getItem('esportbos_forum_posts'));
        forumContainer.innerHTML = postsToShow.slice(0, 5).map(post => `
            <div class="forum-post">
                <span class="post-title">${post.title}</span>
                <span class="post-author">${post.author}</span>
                <span class="post-time">${post.time}</span>
            </div>
        `).join('');
    }
}

// Panggil semua fungsi saat halaman load
document.addEventListener('DOMContentLoaded', function() {
    loadUserData();
    loadMatches();
    loadForumPosts();
});
