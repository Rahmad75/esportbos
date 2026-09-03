// ===== ESPORTBOS - COMPLETE SCRIPT =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('🎮 EsportBos Loaded!');

    // ===== LANDING PAGE FUNCTIONS =====
    
    // Smooth scroll untuk anchor links
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#') {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });

    // Form handling - prevent default submit
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            alert('Fitur login/register akan segera hadir! 🔜');
        });
    });

    // Button register click
    const registerBtn = document.querySelector('.btn-register');
    if (registerBtn) {
        registerBtn.addEventListener('click', function() {
            alert('Fitur registrasi akan segera hadir! ');
        });
    }

    // ===== DASHBOARD FUNCTIONS =====
    
    // Tab switching (hanya kalau ada tab)
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            tabBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Menu active state (hanya kalau ada sidebar menu)
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function(e) {
            // Jangan prevent default kalau ada href yang valid
            const href = this.getAttribute('href');
            if (!href || href === '#') {
                e.preventDefault();
            }
            menuItems.forEach(m => m.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Button click effects (semua tombol)
    const buttons = document.querySelectorAll('.btn-futuristic, .btn-pendanaan, .btn-ayo');
    buttons.forEach(btn => {
        btn.addEventListener('click', function() {
            // Efek scale
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);

            // Efek glow tambahan
            this.style.boxShadow = '0 0 30px rgba(0, 212, 255, 0.8)';
            setTimeout(() => {
                this.style.boxShadow = '';
            }, 300);
        });
    });

    // Hover effect untuk table rows (optional enhancement)
    const tableRows = document.querySelectorAll('.table-row');
    tableRows.forEach(row => {
        row.addEventListener('mouseenter', function() {
            this.style.background = '#f0f8ff';
            this.style.cursor = 'pointer';
        });
        row.addEventListener('mouseleave', function() {
            this.style.background = '';
        });
    });

    // Auto-update waktu (untuk match countdown)
    function updateCountdowns() {
        const countdownElements = document.querySelectorAll('[data-countdown]');
        countdownElements.forEach(el => {
            // Nanti kita tambahin logic countdown real-time
            console.log('Countdown updated');
        });
    }
    
    // Update countdown setiap detik
    setInterval(updateCountdowns, 1000);

    // Notifikasi (dummy function untuk nanti)
    function showNotification(message, type = 'info') {
        // Nanti kita bikin notification system
        console.log(`Notification: ${message} (${type})`);
    }

    // Expose functions ke window untuk dipake di HTML kalau perlu
    window.EsportBos = {
        showNotification: showNotification,
        updateCountdowns: updateCountdowns
    };
});
