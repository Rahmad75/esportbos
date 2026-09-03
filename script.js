/* ===== ESPORTBOS - SCRIPT.JS ===== */
/* Sistem Blok: JavaScript untuk Landing Page */

// ===== 1. SMOOTH SCROLL UNTUK NAVIGASI =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ===== 2. ANIMASI SAAT SCROLL (FADE IN) =====
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Terapkan ke semua section
document.querySelectorAll('section').forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(30px)';
    section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(section);
});

// ===== 3. FORM HANDLING (SIAP UNTUK LOGIN/REGISTER) =====
const loginForm = document.querySelector('.login-panel form');
if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const email = this.querySelector('input[type="email"]').value;
        const password = this.querySelector('input[type="password"]').value;
        
        // Nanti di sini kita sambung ke Supabase
        console.log('Login attempt:', email);
        alert('Fitur login akan segera hadir! Sistem sedang dalam pengembangan.');
    });
}

const registerBtn = document.querySelector('.btn-register');
if (registerBtn) {
    registerBtn.addEventListener('click', function() {
        alert('Fitur registrasi akan segera hadir! Sistem sedang dalam pengembangan.');
    });
}

// ===== 4. NAVBAR EFFECT SAAT SCROLL =====
const navbar = document.querySelector('.navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 100) {
        navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
    } else {
        navbar.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1), 0 -2px 4px rgba(255,255,255,0.8)';
    }
    
    lastScroll = currentScroll;
});

// ===== 5. CONSOLE WELCOME MESSAGE =====
console.log('%c🎮 EsportBos - Jadilah Bos Esports Terkenal Dunia!', 'color: #00d4ff; font-size: 20px; font-weight: bold;');
console.log('%cSistem sedang dalam pengembangan. Stay tuned!', 'color: #ff6b6b; font-size: 14px;');
