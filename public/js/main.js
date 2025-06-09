// Main JavaScript file for client-side functionality
document.addEventListener('DOMContentLoaded', function() {
  // Check if user is logged in by looking for token in localStorage
  const token = localStorage.getItem('token');
  const navLinks = document.querySelector('.nav-links');

  if (token) {
    // User is logged in, update navigation
    if (navLinks) {
      navLinks.innerHTML = `
        <a href="/">Home</a>
        <a href="/dashboard">Dashboard</a>
        <a href="#" id="logout-link">Logout</a>
      `;

      // Add logout functionality
      document.getElementById('logout-link').addEventListener('click', function(e) {
        e.preventDefault();
        localStorage.removeItem('token');
        window.location.href = '/';
      });
    }
  }
});

