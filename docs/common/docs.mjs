function expand(toggle, target) {
  toggle.setAttribute('aria-expanded', 'true');
  target.hidden = false;
}

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

// Expand the subtree for the current page: either the subtree it belongs
// to (a sub-page), or its own subtree (a page with sub-pages).
const currentPath = window.location.pathname;
for (const link of document.querySelectorAll('.docsSidebar a[href]')) {
  const linkPath = new URL(link.getAttribute('href'), window.location.origin)
    .pathname;
  if (linkPath !== currentPath) {
    continue;
  }

  const subtree = link.closest('.docsSidebarSubtree');
  if (subtree) {
    const parentToggle = document.querySelector(
      `[aria-controls="${subtree.id}"]`,
    );
    if (parentToggle) {
      expand(parentToggle, subtree);
    }
  }

  const ownToggle = link
    .closest('.docsSidebarItem')
    ?.querySelector('.docsSidebarToggle');
  const ownTarget =
    ownToggle && document.getElementById(ownToggle.getAttribute('aria-controls'));
  if (ownToggle && ownTarget) {
    expand(ownToggle, ownTarget);
  }
}
