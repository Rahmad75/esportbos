// ===== ESPORTBOS MAIN SCRIPT =====
// File ini untuk fitur-fitur umum (bukan auth)

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ EsportBos script loaded');
    
    // Smooth scroll untuk navigasi
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
    
    // Animasi saat scroll
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.feature-box, .testimonial-box').forEach(el => {
        observer.observe(el);
    });
});
