// Init Supabase
if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(
        'https://xvnmpbmyxphrddjjldbt.supabase.co',
        'sb_publishable_qB9jHOOjiiJDrEQR5XndKA_ji_w-jsv'
    );
}
var supabase = window.supabaseClient;

function handleLogout() {
    supabase.auth.signOut().then(() => { window.location.href = 'index.html'; });
}

function switchDashboardTab(tabName, btnElement) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const target = document.getElementById('tab-' + tabName);
    if (target) target.style.display = 'block';
    if (btnElement) btnElement.classList.add('active');
}

async function loadTransferData() {
    try {
        const { data: transfers } = await supabase.from('transfers').select('*').eq('status', 'completed').eq('transfer_type', 'transfer').order('created_at', { ascending: false }).limit(5);
        const tTable = document.getElementById('latestTransfersTable');
        if (!transfers || transfers.length === 0) {
            tTable.innerHTML = '<div class="table-header"><span>Pos</span><span>Dari</span><span>Ke</span><span>Nilai Bid</span></div><div class="table-row" style="justify-content:center;color:#999;padding:15px;">Belum ada transfer</div>';
        } else {
            tTable.innerHTML = '<div class="table-header"><span>Pos</span><span>Dari</span><span>Ke</span><span>Nilai Bid</span></div>' + transfers.map(t => {
                const posCode = t.player_position?.substring(0, 2).toUpperCase() || 'P';
                return '<div class="table-row"><span class="pos" style="background:#28a745;color:white;padding:2px 8px;border-radius:4px;font-size:12px;">' + posCode + '</span><span>' + (t.player_name || '-') + '</span><span>' + (t.to_team_name || '-') + '</span><span class="bid" style="color:#28a745;">💰 ' + parseFloat(t.bid_amount || 0).toFixed(2) + '</span></div>';
            }).join('');
        }

        const { data: bids } = await supabase.from('transfers').select('*').eq('status', 'pending').eq('transfer_type', 'bid').order('created_at', { ascending: false }).limit(5);
        const bTable = document.getElementById('latestBidsTable');
        if (!bids || bids.length === 0) {
            bTable.innerHTML = '<div class="table-header"><span>Pos</span><span>Oleh Tim</span><span>Nilai Bid</span><span>Waktu Lalu</span></div><div class="table-row" style="justify-content:center;color:#999;padding:15px;">Belum ada bid</div>';
        } else {
            bTable.innerHTML = '<div class="table-header"><span>Pos</span><span>Oleh Tim</span><span>Nilai Bid</span><span>Waktu Lalu</span></div>' + bids.map(b => {
                const mins = Math.floor((new Date() - new Date(b.created_at)) / (1000 * 60));
                const timeText = mins < 60 ? mins + ' Menit' : Math.floor(mins / 60) + ' Jam';
                const posCode = b.player_position?.substring(0, 2).toUpperCase() || 'P';
                return '<div class="table-row"><span class="pos" style="background:#3498db;color:white;padding:2px 8px;border-radius:4px;font-size:12px;">' + posCode + '</span><span>' + (b.to_team_name || '-') + '</span><span class="bid" style="color:#28a745;">💰 ' + parseFloat(b.bid_amount || 0).toFixed(2) + '</span><span style="color:#999;font-size:12px;">' + timeText + '</span></div>';
            }).join('');
        }
    } catch (err) { console.error('Error loading transfers:', err); }
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { window.location.href = 'index.html'; return; }
        const user = session.user;

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (profile) {
            const username = profile.username || user.email.split('@')[0];
            document.getElementById('userName').textContent = username;
            document.getElementById('navAvatar').src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username;
            document.getElementById('diamondBalance').textContent = (profile.diamonds || 0).toLocaleString('id-ID');
            document.getElementById('goldBalance').textContent = (profile.gold || 0).toLocaleString('id-ID');
            document.getElementById('currencyBalance').textContent = (profile.currency || 0).toLocaleString('id-ID');
        }

        const { data: team } = await supabase.from('teams').select('*').eq('user_id', user.id).single();
        if (team) {
            document.getElementById('clubName').textContent = team.team_name || 'My Club';
            document.getElementById('clubRank').textContent = (team.wins || 0) + 'W-' + (team.draws || 0) + 'D-' + (team.losses || 0) + 'L';
            document.getElementById('popularityText').textContent = 'Popularitas Klub: ' + (team.popularity || 0) + '%';
            document.getElementById('popularityBar').style.width = (team.popularity || 0) + '%';
            document.getElementById('moralText').textContent = 'Moral Tim: ' + (team.moral || 0) + '%';
            document.getElementById('moralBar').style.width = (team.moral || 0) + '%';

            const { data: allMatches } = await supabase.from('matches').select('*, home_team:home_team_id(team_name), away_team:away_team_id(team_name)').or('home_team_id.eq.' + team.id + ',away_team_id.eq.' + team.id).order('match_date', { ascending: false });

            if (allMatches) {
                const finishedMatches = allMatches.filter(m => m.status === 'finished');
                const scheduledMatches = allMatches.filter(m => m.status === 'scheduled').reverse();

                if (finishedMatches.length > 0) {
                    const last = finishedMatches[0];
                    document.getElementById('lastMatchHome').textContent = last.home_team?.team_name || '-';
                    document.getElementById('lastMatchHomeScore').textContent = last.home_score ?? '-';
                    document.getElementById('lastMatchAwayScore').textContent = last.away_score ?? '-';
                    document.getElementById('lastMatchAway').textContent = last.away_team?.team_name || '-';
                    document.getElementById('lastMatchInfo').textContent = (last.competition || 'Friendly') + ' - ' + new Date(last.match_date).toLocaleDateString('id-ID');
                }

                if (scheduledMatches.length > 0) {
                    const next = scheduledMatches[0];
                    const isHome = next.home_team_id === team.id;
                    document.getElementById('nextMatchHome').textContent = next.home_team?.team_name || '-';
                    document.getElementById('nextMatchAway').textContent = next.away_team?.team_name || '-';
                    document.getElementById('nextMatchInfo').textContent = (next.competition || 'Friendly') + ' - ' + new Date(next.match_date).toLocaleDateString('id-ID');
                    document.getElementById('infoNextMatch').textContent = (isHome ? next.away_team?.team_name : next.home_team?.team_name) + ' (' + (isHome ? 'K' : 'T') + ')';
                }

                const upcomingTable = document.getElementById('upcomingMatchesTable');
                const topUpcoming = scheduledMatches.slice(0, 4);
                const upcomingHtml = topUpcoming.map(m => {
                    const date = new Date(m.match_date);
                    const diffHours = Math.ceil((date - new Date()) / (1000 * 60 * 60));
                    const timeText = diffHours > 0 ? 'dalam ' + diffHours + ' Jam' : date.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' });
                    return '<div class="table-row"><span>🏠 ' + (m.home_team?.team_name || 'TBD') + '</span><span>✈️ ' + (m.away_team?.team_name || 'TBD') + '</span><span style="color:#00d4ff;">' + timeText + '</span></div>';
                }).join('');
                upcomingTable.innerHTML = '<div class="table-header"><span>Kandang</span><span>Tandang</span><span>Waktu</span></div>' + (upcomingHtml || '<div class="table-row" style="justify-content:center;color:#999;padding:20px;">Belum ada pertandingan yang dijadwalkan.</div>');

                const calendarTable = document.getElementById('calendarMatchesTable');
                const calendarMatches = [...allMatches].sort((a,b) => new Date(a.match_date) - new Date(b.match_date));
                const calendarHtml = calendarMatches.map(m => {
                    const timeText = new Date(m.match_date).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' });
                    const badge = m.status === 'finished' ? '<span style="background:#28a745;color:white;padding:2px 8px;border-radius:4px;font-size:12px;">Selesai</span>' : '<span style="background:#ffc107;color:black;padding:2px 8px;border-radius:4px;font-size:12px;">Akan Datang</span>';
                    return '<div class="table-row"><span>🏠 ' + (m.home_team?.team_name || 'TBD') + '</span><span>✈️ ' + (m.away_team?.team_name || 'TBD') + '</span><span>' + timeText + '</span><span>' + badge + '</span></div>';
                }).join('');
                calendarTable.innerHTML = '<div class="table-header"><span>Kandang</span><span>Tandang</span><span>Waktu</span><span>Status</span></div>' + (calendarHtml || '<div class="table-row" style="justify-content:center;color:#999;padding:20px;">Belum ada jadwal pertandingan.</div>');
            }
        }

        const forumList = document.getElementById('forumList');
        forumList.innerHTML = [
            { topic: " Selamat datang di EsportBos Manager!", time: "Baru saja" },
            { topic: "Tips mendapatkan Currency dengan cepat", time: "1 Jam lalu" },
            { topic: "Strategi taktik 4-3-3 untuk pemula", time: "3 Jam lalu" }
        ].map(post => '<div class="forum-item"><span class="forum-topic">' + post.topic + '</span><span class="forum-time">' + post.time + '</span></div>').join('');

        loadTransferData();
    } catch (error) {
        console.error('Dashboard error:', error);
    }
});
