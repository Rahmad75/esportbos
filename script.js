// ===== ESPORTBOS - COMPLETE SCRIPT =====

// 1. Inisialisasi Supabase Client (pakai nama beda biar gak bentrok)
const SUPABASE_URL = 'https://wfmwwbvckeeptkswtohi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmbXd3YnZja2VlcHRrc3d0b2hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MDYxMjMsImV4cCI6MjEwMzk4MjEyM30.1DpjbWHXAOYQ-VtLYBGzcWOnCIrOimDZo_NKKcVHkNk';

// PAKAI NAMA "sb" BIAR GAK BENTROK DENGAN LIBRARY
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🎮 EsportBos Loaded!');

    // 2. TES KONEKSI SUPABASE
    try {
        console.log('🔄 Mencoba koneksi ke Supabase...');
        const { data, error } = await sb.from('test_connection').select('*');
        
        if (error) {
            console.log('⚠️ Ada error query:', error.message);
        } else {
            console.log('✅ Koneksi Supabase BERHASIL! Data:', data);
        }
    } catch (err) {
        console.error(' Gagal koneksi ke Supabase:', err);
    }

    // ===== LANDING PAGE FUNCTIONS =====
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }
        });
    });

    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            alert('Fitur login/register akan segera hadir! 🔜');
        });
    });

    // ===== DASHBOARD FUNCTIONS =====
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') {
                e.preventDefault();
            }
            menuItems.forEach(m => m.classList.remove('active'));
            this.classList.add('active');
        });
    });

    const buttons = document.querySelectorAll('.btn-futuristic, .btn-pendanaan, .btn-ayo');
    buttons.forEach(btn => {
        btn.addEventListener('click', function() {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => { this.style.transform = ''; }, 150);
            this.style.boxShadow = '0 0 30px rgba(0, 212, 255, 0.8)';
            setTimeout(() => { this.style.boxShadow = ''; }, 300);
        });
    });
});
