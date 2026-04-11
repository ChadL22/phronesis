  <!-- Newsletter Subscription Script -->
  <script>
  (function() {
    // TODO: Replace with your actual Worker URL after deployment
    const WORKER_URL = 'https://phronesis-newsletter.YOUR_SUBDOMAIN.workers.dev/subscribe';
    
    document.querySelectorAll('.newsletter-form').forEach(form => {
      const input = form.querySelector('input[type="email"]');
      const button = form.querySelector('button');
      if (!input || !button) return;
      
      button.addEventListener('click', () => handleSubscribe(form, input, button));
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleSubscribe(form, input, button); }
      });
    });
    
    async function handleSubscribe(form, input, button) {
      const email = input.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMessage(form, 'Please enter a valid email address', 'error');
        return;
      }
      
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Subscribing...';
      
      try {
        const response = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await response.json();
        if (response.ok && data.success) {
          showMessage(form, data.message || 'Successfully subscribed!', 'success');
          input.value = '';
        } else {
          showMessage(form, data.error || 'Subscription failed', 'error');
        }
      } catch (error) {
        console.error('Newsletter error:', error);
        showMessage(form, 'Network error. Please try again.', 'error');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
    
    function showMessage(form, message, type) {
      const existing = form.querySelector('.newsletter-message');
      if (existing) existing.remove();
      const msg = document.createElement('div');
      msg.className = 'newsletter-message newsletter-message--' + type;
      msg.textContent = message;
      Object.assign(msg.style, {
        marginTop: '0.75rem', padding: '0.65rem 1rem', borderRadius: '4px',
        fontSize: '0.8rem', fontFamily: 'var(--sans)',
        backgroundColor: type === 'success' ? '#d4edda' : '#f8d7da',
        color: type === 'success' ? '#155724' : '#721c24',
        border: type === 'success' ? '1px solid #c3e6cb' : '1px solid #f5c6cb'
      });
      form.appendChild(msg);
      setTimeout(() => msg.remove(), 5000);
    }
  })();
  </script>
