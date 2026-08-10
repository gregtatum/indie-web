for (const toggle of document.querySelectorAll('.docsSidebarToggle')) {
  const target = document.getElementById(toggle.getAttribute('aria-controls'));
  if (!target) {
    continue;
  }
  toggle.addEventListener('click', () => {
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isExpanded));
    target.hidden = isExpanded;
  });
}
