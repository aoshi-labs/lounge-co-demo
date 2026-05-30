/* =========================================================
   LOUNGE — Shared utilities + demo behaviors
   ========================================================= */
(function () {
  'use strict';

  /* ───── Theme + sidebar-collapsed: restore from localStorage before paint ───── */
  try {
    const savedTheme = localStorage.getItem('lounge-theme');
    if (savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    if (
      window.innerWidth > 900 &&
      localStorage.getItem('lounge-sidebar-collapsed') === '1'
    ) {
      // Apply class on <html> immediately (body may not exist yet); we'll
      // mirror to <body> in init so the existing CSS selectors match.
      document.documentElement.classList.add('sidebar-collapsed');
    }
  } catch (e) { /* private browsing — ignore */ }

  /* ───── Init on DOM ready ─────
     If the DOM is already parsed (deferred script, cached load), defer to a
     microtask so the rest of this IIFE — including the `const LOUNGE` below —
     finishes initializing before init() touches it. Otherwise applyLoungeConfig
     hits the temporal dead zone and throws. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    Promise.resolve().then(init);
  }

  function init() {
    setupMobileMenu();
    mountTopBarBrand();
    setupSidebarCollapse();
    setupAutoActive();
    setupNavActiveClicks();
    setupTabIcon();
    setupUserRowLink();
    setupTopBarLogo();
    setupLucideIcons();
    applyLoungeConfig();
    setupKeyboardShortcuts();
    setupPostInteractions();
    setupStaggerAnimations();
    setupLiveCounters();
    setupWelcomeToast();
    setupScrollButton();
    // Enable the body's background-color/color transition AFTER first paint
    // so the initial render doesn't animate from the browser's default white
    // to --bg-base (that was the "icons flash white" symptom — the page fades
    // white→dark over .25s while icons are already painted on top). The
    // double rAF ensures we're past the first paint before the transition
    // property attaches; subsequent theme toggles still animate smoothly.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.documentElement.classList.add('theme-transitions');
    }));
  }

  /* ───── Top-bar brand mark ─────
     Hoist .sidebar-logo into the top bar on desktop (Facebook-style).
     Falls back to the legacy page-identity badge only when no sidebar brand exists. */
  function mountTopBarBrand() {
    const sidebar = document.querySelector('.sidebar');
    const topBar = document.querySelector('.top-bar');
    const logo = document.querySelector('.sidebar-logo');
    if (!sidebar || !topBar || !logo) return;

    const isDesktop = window.innerWidth >= 1024;
    const inTopBar = topBar.contains(logo);

    if (!inTopBar) {
      if (isDesktop) {
        topBar.insertBefore(logo, topBar.firstChild);
      } else {
        const menuBtn = topBar.querySelector('#menu-btn');
        if (menuBtn) menuBtn.insertAdjacentElement('afterend', logo);
        else topBar.insertBefore(logo, topBar.firstChild);
      }
    } else if (isDesktop && topBar.firstChild !== logo) {
      topBar.insertBefore(logo, topBar.firstChild);
    } else if (!isDesktop) {
      const menuBtn = topBar.querySelector('#menu-btn');
      if (menuBtn && logo.previousElementSibling !== menuBtn) {
        menuBtn.insertAdjacentElement('afterend', logo);
      }
    }

    logo.classList.add('sidebar-logo--topbar');
  }

  if (!window._loungeTopBarBrandResize) {
    window._loungeTopBarBrandResize = true;
    window.addEventListener('resize', mountTopBarBrand);
  }

  /* ───── Legacy page-identity badge (icon + page label) ─────
     Skipped when a sidebar brand is present — mountTopBarBrand owns the chrome. */
  function setupTopBarLogo() {
    const topBar = document.querySelector('.top-bar');
    if (!topBar) return;
    if (document.querySelector('.sidebar-logo')) return;
    if (topBar.querySelector('.top-bar-logo, .sterlon-topbar-avatar')) return;

    const sidebar = document.querySelector('.sidebar');
    const page = (location.pathname.split('/').pop() || '').toLowerCase();
    const isConcierge     = page.indexOf('concierge') !== -1;
    const isFeed              = page === 'feed.html';
    const isMyNetwork         = page === 'my-network.html';
    const isMyVisits          = page === 'my-visits.html' || page === 'my-visits';
    const isDiscoverVenues    = page === 'discover-venues.html';
    const isRequests          = page === 'requests.html';
    const isMemberBilling     = page === 'member-billing.html';
    const isWorkspacePicker   = page === 'workspace-picker.html';
    const isProfile       = page === 'profile.html';
    const isSettings      = page === 'settings.html';
    const isNotifications = page === 'notifications.html';
    const isCreatePost    = page === 'create-post.html';
    const isLeaderboard   = page === 'leaderboard.html';
    const isExplore       = page === 'explore.html';
    const isLists         = page === 'lists.html';
    const isCatalog       = page === 'catalog.html';
    const isCart          = page === 'cart.html';
    const isOrders        = page === 'orders.html';
    const isEvents        = page === 'events.html';
    const isEventDetail   = page === 'event-detail.html';
    const isCheckin       = page === 'checkin.html';
    const isRooms         = page === 'rooms.html';
    const isRoomDetail    = page === 'room-detail.html';
    const isSuperDash      = page === 'superadmin-dashboard.html';
    const isSuperVenues   = page === 'superadmin-venues.html';
    const isAdminDash      = page === 'admin-dashboard.html';
    const isAdminAnalytics = page === 'admin-analytics.html';
    const isAdminMembers   = page === 'admin-members.html';
    const isAdminCatalog   = page === 'admin-catalog.html';
    const isAdminListEdit  = page === 'admin-list-edit.html';
    const isAdminEvents    = page === 'admin-events.html';
    const isAdminOrders    = page === 'admin-orders.html';
    const isAdminSettings  = page === 'admin-settings.html';

    let href = 'feed.html';
    let icon = 'newspaper';
    let title = 'Feed';
    let label = '';   // empty = circle only (no adjacent text)
    if (isConcierge) {
      href = 'sterlon.html';
      icon = 'history';
      title = 'Chat history';
    } else if (isFeed) {
      icon = 'newspaper';
      label = 'Feed';
      title = 'Feed';
    } else if (isMyNetwork) {
      icon = 'users';
      label = 'My Network';
      title = 'My Network';
    } else if (isMyVisits) {
      icon = 'book-marked';
      label = 'My Visits';
      title = 'My Visits';
    } else if (isDiscoverVenues) {
      icon = 'map';
      label = 'Discover venues';
      title = 'Discover venues';
    } else if (isRequests) {
      icon = 'mail';
      label = 'Requests';
      title = 'Requests';
    } else if (isMemberBilling) {
      icon = 'credit-card';
      label = 'Subscription';
      title = 'Subscription';
    } else if (isWorkspacePicker) {
      icon = 'grid-2x2';
      label = 'My Venues';
      title = 'My Venues';
    } else if (isProfile) {
      icon = 'user';
      label = 'Profile';
      title = 'Profile';
    } else if (isSettings) {
      icon = 'user';
      label = 'Profile';
      title = 'Profile';
    } else if (isNotifications) {
      icon = 'bell';
      label = 'Notifications';
      title = 'Notifications';
    } else if (isCreatePost) {
      icon = 'plus';
      label = 'New Post';
      title = 'New Post';
    } else if (isLeaderboard) {
      icon = 'bar-chart-3';
      label = 'Leaderboard';
      title = 'Leaderboard';
    } else if (isExplore) {
      icon = 'search';
      label = 'Explore';
      title = 'Explore';
    } else if (isLists) {
      icon = 'gem';
      label = 'Venue curation';
      title = 'Venue curation';
    } else if (isCatalog) {
      icon = 'book-open';
      label = 'Catalog';
      title = 'Catalog';
    } else if (isCart) {
      // cart.html is deprecated for L0 day 1; Phase 2 repurpose for L1 commerce.
      // Vocabulary updated from "My Tab" to "My Visit" per TV2 (Activity + Visit + Order) lock.
      icon = 'notebook-pen';
      label = 'My Visit';
      title = 'My Visit';
    } else if (isOrders) {
      icon = 'receipt-text';
      label = 'My Activity';
      title = 'My Activity';
    } else if (isEvents) {
      icon = 'calendar';
      label = 'Events';
      title = 'Events';
    } else if (isEventDetail) {
      icon = 'calendar';
      label = 'Event detail';
      title = 'Event detail';
    } else if (isCheckin) {
      icon = 'map-pin';
      label = 'Check in';
      title = 'Check in';
    } else if (isRooms) {
      icon = 'door-open';
      label = 'Rooms';
      title = 'Rooms';
    } else if (isRoomDetail) {
      icon = 'door-open';
      label = 'Room details';
      title = 'Room details';
    } else if (isSuperDash) {
      href = 'superadmin-dashboard.html';
      icon = 'layout-grid';
      label = 'Platform Overview';
      title = 'Platform Overview';
    } else if (isSuperVenues) {
      href = 'superadmin-venues.html';
      icon = 'building';
      label = 'Venues';
      title = 'Venues';
    } else if (isAdminDash) {
      href = 'admin-dashboard.html';
      icon = 'layout-grid';
      label = 'Dashboard';
      title = 'Dashboard';
    } else if (isAdminAnalytics) {
      href = 'admin-analytics.html';
      icon = 'bar-chart-3';
      label = 'Analytics';
      title = 'Analytics';
    } else if (isAdminMembers) {
      href = 'admin-members.html';
      icon = 'users';
      label = 'Members';
      title = 'Members';
    } else if (isAdminCatalog) {
      href = 'admin-catalog.html';
      icon = 'book-open';
      label = 'Catalog';
      title = 'Catalog';
    } else if (isAdminListEdit) {
      href = 'admin-catalog.html';
      icon = 'list';
      label = 'Edit list';
      title = 'Edit list';
    } else if (isAdminEvents) {
      href = 'admin-events.html';
      icon = 'calendar';
      label = 'Events';
      title = 'Events';
    } else if (isAdminOrders) {
      href = 'admin-orders.html';
      icon = 'receipt-text';
      label = 'Requests';
      title = 'Requests';
    } else if (isAdminSettings) {
      href = 'admin-settings.html';
      icon = 'settings';
      label = 'Lounge Settings';
      title = 'Lounge Settings';
    } else if (sidebar) {
      if (sidebar.classList.contains('super'))      href = 'superadmin-dashboard.html';
      else if (sidebar.classList.contains('admin')) href = 'admin-dashboard.html';
    }

    const link = document.createElement('a');
    link.className = 'top-bar-logo';
    link.href = href;
    link.title = title;
    link.setAttribute('aria-label', title);
    const circle = document.createElement('span');
    circle.className = 'top-bar-logo-circle';
    circle.innerHTML = '<i data-lucide="' + icon + '" class="ic-17"></i>';
    link.appendChild(circle);
    if (label) {
      const lbl = document.createElement('span');
      lbl.className = 'top-bar-logo-label';
      lbl.textContent = label;
      link.appendChild(lbl);
    }

    const menuBtn = topBar.querySelector('#menu-btn');
    if (menuBtn) {
      menuBtn.insertAdjacentElement('afterend', link);
    } else {
      topBar.insertBefore(link, topBar.firstChild);
    }
  }

  /* ───── Floating scroll-to-top/bottom button ─────
     Mirrors the sterlon pattern across every page. Auto-injects one
     button into <body>; hides itself when the page doesn't overflow the
     viewport; flips chevron direction once the user has scrolled past 80px. */
  function setupScrollButton() {
    if (document.getElementById('scroll-btn')) return;
    /* Sterlon pins the in-column transcript (#sterlon-chat-scroll) via
       sterlon-scroll-anchor.js; the global FAB overlaps the composer send
       button on mobile and is redundant there. */
    if (document.querySelector('.sterlon-chat-col')) return;

    const btn = document.createElement('button');
    btn.id = 'scroll-btn';
    btn.type = 'button';
    btn.className = 'lounge-scroll-btn';
    btn.setAttribute('aria-label', 'Scroll');
    btn.title = 'Scroll to bottom';
    btn.innerHTML =
      '<i data-lucide="chevron-down" class="ic-18 scroll-icon-down"></i>' +
      '<i data-lucide="chevron-up" class="ic-18 scroll-icon-up"></i>';
    btn.addEventListener('click', window.toggleScroll);
    document.body.appendChild(btn);

    const isScrollable = () =>
      document.documentElement.scrollHeight > window.innerHeight + 40;

    function update() {
      if (!isScrollable()) {
        btn.classList.add('lounge-scroll-btn--hidden');
        return;
      }
      btn.classList.remove('lounge-scroll-btn--hidden');
      const scrolled = window.scrollY > 80;
      btn.classList.toggle('scrolled', scrolled);
      btn.title = scrolled ? 'Scroll to top' : 'Scroll to bottom';
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
    // Re-check after fonts/Lucide swap-in change document height
    setTimeout(update, 700);
    if (window.Lounge && window.Lounge.renderIcons) window.Lounge.renderIcons();
  }

  window.toggleScroll = function () {
    const btn = document.getElementById('scroll-btn');
    if (btn && btn.classList.contains('scrolled')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
  };

  /* ───── Sidebar user-row → profile page (routes by sidebar variant) ───── */
  function setupUserRowLink() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    // Super-admin has no profile page yet — skip.
    if (sidebar.classList.contains('super')) return;
    const target = sidebar.classList.contains('admin') ? 'admin-profile.html' : 'profile.html';

    const row = sidebar.querySelector('.sidebar-user > *');
    if (!row || row.dataset.userLinkWired === '1') return;
    if (row.tagName === 'A' || row.closest('a')) return;

    row.dataset.userLinkWired = '1';
    row.style.cursor = 'pointer';
    row.setAttribute('role', 'link');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', 'Open your profile');
    row.title = 'Open your profile';

    row.addEventListener('click', e => {
      if (e.target.closest('a, button, input, select, textarea')) return;
      location.href = target;
    });
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        location.href = target;
      }
    });
  }

  /* ───── Custom icon set — vertical-specific glyphs Lucide doesn't ship ─────
     Inline SVG content keyed by name. Authored to match Lucide's spec
     (24×24, fill=none, stroke=currentColor, stroke-width=2, round caps/joins)
     so they sit visually alongside Lucide icons without restyling. Source
     files live in assets/icons/*.svg — kept in sync by hand. */
  const CUSTOM_ICONS = {
    'cigar': '<path d="M3 10h15a2 2 0 0 1 0 4H3a1 1 0 0 1 0-4Z"/><path d="M18 11l3 1-3 1"/><path d="M7 10v4"/>',
    'whiskey-glass': '<path d="M5 4h14l-1 16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z"/><path d="M7 13h10"/><circle cx="10" cy="16.5" r="1"/><circle cx="13.5" cy="17" r="1"/>',
    'tobacco-leaf': '<path d="M12 2c-5 3-8 8-8 13 0 4 3 7 7 7 5 0 9-5 9-12 0-3-3-7-8-8Z"/><path d="M11 4 8 21"/><path d="M10 9 6 11"/><path d="M10 13 6 14"/><path d="M10 17 7 18"/>',
    'wood-log': '<rect x="2" y="6" width="20" height="12" rx="2"/><ellipse cx="18" cy="12" rx="2" ry="6"/><circle cx="18" cy="12" r="3"/><circle cx="18" cy="12" r="1"/>',
    'champagne-flutes': '<path d="M8 3 6 12c0 2 1 4 3 4v5"/><path d="M16 3l2 9c0 2-1 4-3 4v5"/><path d="M5 21h6"/><path d="M13 21h6"/><path d="M9 16 15 16"/>',
    'pipe': '<path d="M2 16h10a3 3 0 0 0 3-3V8h4a2 2 0 0 1 2 2v3a4 4 0 0 1-4 4h-2"/><path d="M15 5v3"/><path d="M18 5v3"/>',
    'decanter': '<path d="M9 2h6v3H9z"/><path d="M10 5v4"/><path d="M14 5v4"/><path d="M10 9c-4 1-6 4-6 8 0 3 3 5 8 5s8-2 8-5c0-4-2-7-6-8"/><path d="M7 16h10"/>'
  };

  function renderCustomIcons() {
    const nodes = document.querySelectorAll('i[data-icon]');
    nodes.forEach(node => {
      const name = node.getAttribute('data-icon');
      const body = CUSTOM_ICONS[name];
      if (!body) return;
      const cls = node.getAttribute('class') || '';
      const aria = node.hasAttribute('aria-label')
        ? ' role="img" aria-label="' + node.getAttribute('aria-label') + '"'
        : ' aria-hidden="true"';
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
                  (cls ? ' class="' + cls + '"' : '') + aria + '>' + body + '</svg>';
      const tpl = document.createElement('template');
      tpl.innerHTML = svg;
      node.replaceWith(tpl.content.firstChild);
    });
  }

  /* ───── Lucide icon library — lazy-load + render ───── */
  function setupLucideIcons() {
    function renderAll() {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (e) {}
      }
      renderCustomIcons();
      setupAutoActive();
    }
    if (window.lucide) { renderAll(); return; }

    const s = document.createElement('script');
    // Pinned — never use @latest. Silent breaking changes from upstream are
    // a production-stability bug we don't want to inherit. Bump deliberately
    // via a version-shift PR; see CLAUDE.md Icons section.
    s.src = 'https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js';
    s.async = true;
    s.onload = renderAll;
    document.head.appendChild(s);

    // Custom icons don't depend on the lucide CDN — render immediately so
    // they paint without waiting on the network. renderAll() will run again
    // (no-op for already-replaced custom icons) when lucide finishes loading.
    renderCustomIcons();

    // Expose a helper for code that injects icons after init (e.g., cart icon)
    window.Lounge = window.Lounge || {};
    window.Lounge.renderIcons = renderAll;
  }

  /* ───── Mobile menu trigger ───── */
  function setupMobileMenu() {
    const btn = document.getElementById('menu-btn');
    if (btn && window.innerWidth <= 900) btn.style.display = 'flex';
    // a11y: initialize aria-expanded + aria-controls on the hamburger so it
    // announces its state to screen readers. toggleSidebar() flips it.
    if (btn) {
      if (!btn.hasAttribute('aria-expanded')) btn.setAttribute('aria-expanded', 'false');
      if (!btn.hasAttribute('aria-controls')) btn.setAttribute('aria-controls', 'sidebar');
    }
    window.addEventListener('resize', () => {
      if (!btn) return;
      btn.style.display = window.innerWidth <= 900 ? 'flex' : 'none';
    });
  }

  window.toggleSidebar = function () {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('overlay');
    if (!s) return;
    const open = s.classList.toggle('open');
    if (o) o.style.display = open ? 'block' : 'none';
    // a11y: keep aria-expanded on the hamburger in sync with drawer state
    const btn = document.getElementById('menu-btn');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  /* ───── Sidebar collapse (desktop) ↔ drawer (mobile) ─────
     Triggered by the logo-mark in the sidebar OR the hamburger button. */
  window.toggleSidebarCollapsed = function () {
    if (window.innerWidth <= 900) {
      // Mobile: open/close the drawer
      return toggleSidebar();
    }
    // Desktop: shrink to icons / expand
    const collapsed = document.documentElement.classList.toggle('sidebar-collapsed');
    try {
      localStorage.setItem('lounge-sidebar-collapsed', collapsed ? '1' : '0');
    } catch (e) {}
  };

  function setupSidebarCollapse() {
    // Ensure the pre-paint state respects viewport (mobile shouldn't be collapsed)
    if (window.innerWidth <= 900) {
      document.documentElement.classList.remove('sidebar-collapsed');
    }

    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Build tooltips for each nav item from its visible text label
    sidebar.querySelectorAll('.nav-item').forEach(item => {
      if (item.hasAttribute('data-tooltip')) return;
      const label = Array.from(item.childNodes)
        .filter(n => n.nodeType === 3 /* TEXT_NODE */)
        .map(n => n.textContent.trim())
        .filter(Boolean)
        .join(' ');
      if (label) item.setAttribute('data-tooltip', label);
    });

    // Wire the entire sidebar-logo as the collapse toggle — single click, no delay.
    const logo = document.querySelector('.sidebar-logo');
    if (logo && !logo.dataset.collapseWired) {
      logo.dataset.collapseWired = '1';
      logo.setAttribute('role', 'button');
      logo.setAttribute('tabindex', '0');
      logo.setAttribute('aria-label', 'Toggle sidebar');
      logo.title = 'Toggle sidebar';
      logo.style.cursor = 'pointer';
      logo.style.userSelect = 'none';

      logo.addEventListener('click', function (e) {
        e.preventDefault();
        toggleSidebarCollapsed();
      });
      logo.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleSidebarCollapsed();
        }
      });
    }

    // Keep collapsed state consistent across viewport-resize boundaries
    window.addEventListener('resize', () => {
      if (window.innerWidth <= 900) {
        document.documentElement.classList.remove('sidebar-collapsed');
      } else {
        try {
          if (localStorage.getItem('lounge-sidebar-collapsed') === '1') {
            document.documentElement.classList.add('sidebar-collapsed');
          }
        } catch (e) {}
      }
    });
  }

  /* ───── Auto-highlight active sidebar/bottom-nav item ───── */
  function setupAutoActive() {
    const navSlug = (name) => (name || '').replace(/\.html$/i, '').toLowerCase();

    const pageFile = (location.pathname.split('/').pop() || 'sterlon.html')
      .split('?')[0]
      .split('#')[0]
      .toLowerCase();

    const normalizeHref = (href) => {
      if (!href || href.startsWith('#')) return '';
      try {
        return new URL(href, location.href).pathname.split('/').pop()
          .split('?')[0].split('#')[0].toLowerCase();
      } catch (e) {
        return href.split('?')[0].split('#')[0].toLowerCase();
      }
    };

    /* Child/detail pages highlight their parent nav item. */
    const NAV_ALIASES = {
      '': 'sterlon',
      'index.html': 'sterlon',
      'post-detail.html': 'feed',
      'create-post.html': 'feed',
      'room-detail.html': 'rooms',
      'product-detail.html': 'catalog',
      'event-detail.html': 'events',
      'cart.html': 'my-visits',
    };

    const target = navSlug(NAV_ALIASES[pageFile] || pageFile);

    const markActive = (links, activeClass) => {
      links.forEach((a) => {
        a.classList.remove(activeClass);
        a.removeAttribute('aria-current');
        if (navSlug(normalizeHref(a.getAttribute('href'))) === target) {
          a.classList.add(activeClass);
          a.setAttribute('aria-current', 'page');
        }
      });
    };

    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      markActive(sidebar.querySelectorAll('.nav-item'), 'active');
    }

    const bnav = document.querySelector('.bottom-nav');
    if (bnav) {
      markActive(bnav.querySelectorAll('.bottom-nav-item'), 'active');
    }
  }

  function setupNavActiveClicks() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || sidebar.dataset.navActiveClicks === '1') return;
    sidebar.dataset.navActiveClicks = '1';
    sidebar.addEventListener('click', (e) => {
      const link = e.target.closest('.nav-item');
      if (!link || !sidebar.contains(link)) return;
      sidebar.querySelectorAll('.nav-item').forEach((a) => {
        a.classList.remove('active');
        a.removeAttribute('aria-current');
      });
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    });
  }

  /* ───── Like button (works on .post-action with span counter) ───── */
  window.toggleLike = function (btn) {
    const span = btn.querySelector('span');
    const svg  = btn.querySelector('svg');
    const liked = btn.classList.toggle('liked');
    if (liked) {
      const burg = getComputedStyle(document.documentElement).getPropertyValue('--burg').trim();
      if (svg)  svg.setAttribute('fill', burg);
      if (span) span.textContent = +span.textContent + 1;
      pulse(btn);
    } else {
      if (svg)  svg.setAttribute('fill', 'none');
      if (span) span.textContent = +span.textContent - 1;
    }
  };

  function pulse(el) {
    el.style.transition = 'transform .15s';
    el.style.transform = 'scale(1.15)';
    setTimeout(() => (el.style.transform = 'scale(1)'), 150);
  }

  /* ───── Generic single-select filter tab ───── */
  window.setFilter = function (btn) {
    const parent = btn.parentElement;
    if (!parent) return;

    if (btn.classList.contains('tag') && parent.classList.contains('feed-filter-row')) {
      parent.querySelectorAll('.tag[data-filter]').forEach(b => b.classList.add('feed-filter-inactive'));
      btn.classList.remove('feed-filter-inactive');
      return;
    }

    if (btn.classList.contains('dv-chip')) {
      parent.querySelectorAll('.dv-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      return;
    }

    parent.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };

  /* ───── Post interactions: click → post-detail, double-click → like ─────
     Cards opt in to navigation by setting data-href. Single-click waits
     briefly so a follow-up dblclick can cancel it and trigger the like. */
  function setupPostInteractions() {
    document.querySelectorAll('.post-card').forEach(card => {
      let clickTimer = null;

      const href = card.dataset.href;
      if (href) {
        card.addEventListener('click', e => {
          if (e.target.closest('button, a, input, textarea')) return;
          clearTimeout(clickTimer);
          clickTimer = setTimeout(() => { location.href = href; }, 220);
        });
      }

      card.addEventListener('dblclick', e => {
        if (e.target.closest('button, a, input, textarea')) return;
        clearTimeout(clickTimer);
        const likeBtn = card.querySelector('.post-action');
        if (likeBtn && !likeBtn.classList.contains('liked')) toggleLike(likeBtn);
        floatHeart(e.clientX, e.clientY);
      });
    });
  }

  function floatHeart(x, y) {
    const heart = document.createElement('div');
    heart.textContent = '♥';
    heart.style.cssText =
      'position:fixed;left:' + x + 'px;top:' + y + 'px;color:var(--burg);' +
      'font-size:34px;pointer-events:none;z-index:1000;' +
      'animation:float-up 1s ease-out forwards;text-shadow:0 0 12px rgba(var(--burg-rgb),.5);';
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 1000);
  }

  /* ───── Toast notifications ─────
     Every toast — regardless of caller — produces the same DOM and the same
     on-screen lifetime. The signature accepts `opts.duration` and `opts.icon`
     for backward compatibility with existing call sites, but both are now
     ignored: layout is fixed (close + body + timer, no icon column) and
     timing is locked to TOAST_DURATION. Only `opts.variant` ('success' /
     'burg') is honored, and that's a color-only change — structure stays
     identical. */
  const TOAST_DURATION = 3000;   // ms; matches .toast-timer animation-duration in lounge.css
  let toastContainer = null;
  window.toast = function (message, opts) {
    opts = opts || {};
    const variant = opts.variant || '';
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      // a11y: announce toasts to screen readers. `polite` (not `assertive`)
      // because toasts are informational, not interruption-worthy; the
      // `burg` variant is a warning but still not a system alert.
      toastContainer.setAttribute('role', 'status');
      toastContainer.setAttribute('aria-live', 'polite');
      toastContainer.setAttribute('aria-atomic', 'false');
      document.body.appendChild(toastContainer);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (variant ? ' toast-' + variant : '');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.textContent = '×';

    const body = document.createElement('div');
    body.className = 'toast-body';
    body.textContent = message;

    const timer = document.createElement('div');
    timer.className = 'toast-timer';

    t.appendChild(closeBtn);
    t.appendChild(body);
    t.appendChild(timer);
    toastContainer.appendChild(t);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(autoTimer);
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    };
    closeBtn.addEventListener('click', dismiss);

    requestAnimationFrame(() => t.classList.add('show'));
    const autoTimer = setTimeout(dismiss, TOAST_DURATION);
  };

  /* ───── Keyboard shortcuts ───── */
  let gPending = false;
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      // /  →  focus search
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const search = document.querySelector('.search-input, input[type="search"]');
        if (search) { e.preventDefault(); search.focus(); }
        return;
      }
      // [  →  toggle sidebar collapse / drawer
      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleSidebarCollapsed();
        return;
      }
      // ? → shortcut help
      if (e.key === '?' && e.shiftKey) {
        showShortcuts();
        return;
      }
      // g + letter → navigate
      if (e.key === 'g' && !gPending && !e.metaKey && !e.ctrlKey) {
        gPending = true;
        setTimeout(() => (gPending = false), 800);
        return;
      }
      if (gPending) {
        // Navigation map. Platform-context surfaces (h, d, n, a, r, v, p, s)
        // and venue-context surfaces share the same shortcut palette where the meaning
        // is preserved (g c = catalog is still catalog inside venue workspace, etc.).
        const map = {
          // Platform-context
          h: 'feed.html', f: 'feed.html',                  // home Activity feed
          d: 'discover-venues.html',                       // NEW — venue discovery
          n: 'my-network.html',                            // NEW — follow graph + suggested follows
          a: 'sterlon.html',                               // Sterlon
          r: 'requests.html',                              // NEW — DM Requests inbox (silent)
          v: '/my-visits',                                 // lifetime Visit history
          p: 'profile.html',                               // member profile
          s: 'settings.html',                              // settings
          // Backward-compat (legacy mockup pages — still present until visionboard refactor lands)
          e: 'explore.html', c: 'catalog.html', l: 'leaderboard.html'
        };
        const target = map[e.key.toLowerCase()];
        if (target) { e.preventDefault(); gPending = false; location.href = target; }
      }
    });
  }

  function showShortcuts() {
    toast(
      '/ search  ·  [ collapse sidebar  ·  g h home  ·  g d discover  ·  g n network  ·  g a Sterlon  ·  g r requests  ·  g v visits  ·  g p profile  ·  g s settings',
      { duration: 6500 }
    );
  }

  /* ───── PLATFORM constants (venue-only / cross-venue split) ─────
     Lounge & Co. consumer-brand constants. Always present on every page.
     Used by platform-context surfaces (home Activity feed, My Network,
     Discover Venues, Sterlon, Requests inbox, member-billing, workspace
     picker, member onboarding, settings, notifications, profile, login,
     landing, age-verify). */
  const PLATFORM = window.PLATFORM || {
    name:    'Lounge & Co.',
    tagline: 'Carry the night with you.',
    logoUrl: null,
    fonts:   { display: 'Cormorant Garamond', body: 'Lora', ui: 'Inter' }
  };
  window.PLATFORM = PLATFORM;

  /* ───── VENUE config ─────
     Per-venue identity loaded inside a venue workspace — name, logo,
     tagline, stats. Lounge & Co. is the visual brand on every surface;
     venues never override colors or design tokens. The legacy `LOUNGE`
     config / `window.LOUNGE` is preserved as an alias for existing
     mockup pages that set `window.LOUNGE = {...}` at the top of their
     <script> blocks — those pages are venue-context demos, so the
     legacy LOUNGE config is conceptually the VENUE config.
     Legacy `data-lounge-*` attribute bindings continue to work; the
     canonical `data-venue-*` attributes are also supported. */
  const VENUE = window.VENUE || window.LOUNGE || {
    name:      'Casa de Montecristo',
    shortName: 'Casa de Montecristo',
    initials:  'CDM',
    tagline:   'A house of fine cigars since 1981.',
    logoUrl:   null,
    tier:      'estate',
    visibility:'public',
    stats:     { members: 247, reviews: '1,200+', events: 48, founded: 'Est. 1981', streak: 3 },
    /* Sterlon home-screen quick-action chips. Per-venue: reorder,
       show/hide, rename to match the lounge's mix. Each entry: { action, label }
       where `action` keys into the handler in sterlon.html. */
    /* Sterlon home: utilities live in the composer tools menu, not the chip row. */
    quickActions: [],
    /* Sterlon context strip — 3–4 glanceable cards above the chat
       transcript. Each entry: { variant, icon, label, text, href? }.
       variant: 'live' (pulse dot), 'gold' (gold icon), 'burg' (burgundy
       emphasis), 'muted' (default). */
    contextStrip: [
      { variant: 'live',  label: 'Open',           text: 'Until 1am · last call 12:30' },
      { variant: 'gold',  icon: 'flame',           label: "Tonight's Pick", text: 'Padron 1964 Anniversary', href: 'product-detail.html' },
      /* B6 — Featured list / Tonight's Flight in the context strip */
      { variant: 'gold',  icon: 'list',            label: "Maya's Friday Flight", text: '4 picks · 7 of 25 spots left', href: 'lists.html' },
      { variant: 'burg',  icon: 'map-pin',         label: 'Check in',       text: 'Earn 25 points tonight', href: 'checkin.html' },
      /* B5 — Streak / run signal inline in Sterlon home view */
      { variant: 'gold',  icon: 'flame',           label: 'Your run',       text: '3 weeks in a row · visit by Sun to keep it', href: 'profile.html' },
      { variant: 'muted', icon: 'users',           label: 'In the room',    text: '12 members · Marcus rated Padron 1926 ★4.9' }
    ]
  };
  window.VENUE = VENUE;
  // Backward-compat alias for legacy mockup pages + existing code paths.
  // All `LOUNGE.x` references continue to resolve through this alias to the
  // current venue context. New code should reference VENUE directly.
  const LOUNGE = VENUE;
  window.LOUNGE = LOUNGE;

  function applyLoungeConfig() {
    // Legacy data-lounge-* + data-stat-* attributes are preserved as
    // backward-compat aliases for the canonical data-venue-* / data-platform-* attrs.
    // Both bind to the same underlying VENUE config (or PLATFORM constants where applicable).
    // Note: VENUE does not carry color overrides — Lounge & Co. design tokens are constant
    // across every surface. Venue identity is name + logo + tagline + stats only.
    const bindings = {
      // Legacy (preserved) — data-lounge-name handled below (sidebar chrome vs venue fields)
      'data-lounge-short':    VENUE.shortName,
      'data-lounge-initials': VENUE.initials,
      'data-lounge-tagline':  VENUE.tagline,
      'data-stat-members':    VENUE.stats && VENUE.stats.members,
      'data-stat-reviews':    VENUE.stats && VENUE.stats.reviews,
      'data-stat-events':     VENUE.stats && VENUE.stats.events,
      'data-stat-founded':    VENUE.stats && VENUE.stats.founded,
      'data-stat-streak':     VENUE.stats && VENUE.stats.streak,
      // Canonical (NEW)
      'data-venue-name':      VENUE.name,
      'data-venue-short':     VENUE.shortName,
      'data-venue-initials':  VENUE.initials,
      'data-venue-tagline':   VENUE.tagline,
      'data-venue-stat-members':  VENUE.stats && VENUE.stats.members,
      'data-venue-stat-reviews':  VENUE.stats && VENUE.stats.reviews,
      'data-venue-stat-events':   VENUE.stats && VENUE.stats.events,
      'data-venue-stat-founded':  VENUE.stats && VENUE.stats.founded,
      'data-venue-stat-streak':   VENUE.stats && VENUE.stats.streak,
      'data-platform-name':    PLATFORM.name,
      'data-platform-tagline': PLATFORM.tagline
    };
    for (const attr in bindings) {
      const v = bindings[attr];
      if (v == null) continue;
      document.querySelectorAll('[' + attr + ']').forEach(el => el.textContent = v);
    }
    // App chrome (sidebar / top bar) is always Lounge & Co.; venue name binds elsewhere.
    document.querySelectorAll('.sidebar-brand-name[data-lounge-name]').forEach(el => {
      el.textContent = PLATFORM.name;
    });
    document.querySelectorAll('[data-lounge-name]:not(.sidebar-brand-name)').forEach(el => {
      el.textContent = VENUE.name;
    });
    applyVenueSEO();
    renderQuickActions();
    renderContextStrip();
  }

  /* ───── Per-venue SEO templating ─────
     Populates meta tags from LOUNGE config so the same shared <head> block
     re-skins under each venue. Three layers, in order of preference:

       1. LOUNGE.seo.{description,ogTitle,ogDescription,ogImage,twitterImage}
          — explicit per-venue overrides (set in the page's <script>)
       2. LOUNGE.tagline + LOUNGE.name — derived defaults
       3. The hardcoded values already in the markup — final fallback

     The page itself sets noindex/index via static <meta name="robots">; we
     don't override it here (gate pages stay noindex regardless of venue).
     og:url + canonical are also intentionally untouched — those want to be
     server-side per the request hostname, not client-side. */
  function applyVenueSEO() {
    const seo = LOUNGE.seo || {};
    const fallbackName = LOUNGE.name || 'Lounge & Co.';
    const fallbackDesc = seo.description ||
      (LOUNGE.tagline ? (fallbackName + ' — ' + LOUNGE.tagline) : null);

    const set = (selector, attr, value) => {
      if (value == null) return;
      const el = document.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    };

    set('meta[name="description"]',        'content', fallbackDesc);
    set('meta[property="og:site_name"]',   'content', fallbackName);
    set('meta[property="og:title"]',       'content', seo.ogTitle      || fallbackName);
    set('meta[property="og:description"]', 'content', seo.ogDescription || fallbackDesc);
    set('meta[property="og:image"]',       'content', seo.ogImage);
    set('meta[name="twitter:title"]',      'content', seo.ogTitle      || fallbackName);
    set('meta[name="twitter:description"]','content', seo.ogDescription || fallbackDesc);
    set('meta[name="twitter:image"]',      'content', seo.twitterImage || seo.ogImage);

    // JSON-LD BarOrPub block (set on landing.html). Rebuild if present so
    // structured data also re-skins per venue.
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        const data = JSON.parse(ld.textContent);
        if (data && data['@type'] === 'BarOrPub') {
          data.name = fallbackName;
          if (fallbackDesc) data.description = fallbackDesc;
          if (seo.ogImage) data.image = seo.ogImage;
          ld.textContent = JSON.stringify(data);
        }
      } catch (e) { /* malformed JSON-LD — leave it alone */ }
    }
  }

  /* Render Sterlon context strip from LOUNGE.contextStrip. Each entry
     becomes a card with optional href (tappable), variant-driven styling, and
     a Lucide icon (or live-dot for the 'live' variant). */
  function renderContextStrip() {
    if (!LOUNGE.contextStrip || !LOUNGE.contextStrip.length) return;
    document.querySelectorAll('[data-context-strip]').forEach(host => {
      host.innerHTML = '';
      LOUNGE.contextStrip.forEach(entry => {
        const tag = entry.href ? 'a' : 'div';
        const el = document.createElement(tag);
        el.className = 'sterlon-context-card';
        if (entry.href) { el.href = entry.href; el.classList.add('sterlon-context-clickable'); }
        if (entry.variant === 'burg') el.classList.add('sterlon-context-card-burg');

        // Leading visual: live dot or Lucide icon
        if (entry.variant === 'live') {
          const dot = document.createElement('span');
          dot.className = 'sterlon-context-dot sterlon-context-dot-live';
          el.appendChild(dot);
        } else if (entry.icon) {
          const i = document.createElement('i');
          i.setAttribute('data-lucide', entry.icon);
          i.className = 'ic-15 ' + (
            entry.variant === 'gold'  ? 'sterlon-context-icon-gold'  :
            entry.variant === 'muted' ? 'sterlon-context-icon-muted' : ''
          );
          el.appendChild(i);
        }

        const body = document.createElement('div');
        body.className = 'sterlon-context-body';
        const lab = document.createElement('div');
        lab.className = 'sterlon-context-label';
        lab.textContent = entry.label || '';
        const txt = document.createElement('div');
        txt.className = 'sterlon-context-text';
        txt.textContent = entry.text || '';
        body.appendChild(lab);
        body.appendChild(txt);
        el.appendChild(body);
        host.appendChild(el);
      });
    });
    if (window.Lounge && window.Lounge.renderIcons) window.Lounge.renderIcons();
  }

  /* Render Sterlon quick-action chip row from LOUNGE.quickActions.
     Re-runs Lucide so the trailing "More" chip's chevron renders. */
  function renderQuickActions() {
    document.querySelectorAll('[data-quick-actions]').forEach(host => {
      if (!LOUNGE.quickActions || !LOUNGE.quickActions.length) {
        host.innerHTML = '';
        return;
      }
      host.innerHTML = '';
      LOUNGE.quickActions.forEach(qa => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sterlon-quick-chip';
        b.textContent = qa.label;
        b.setAttribute('onclick', "quickAction(this,'" + qa.action + "')");
        host.appendChild(b);
      });
      // Trailing "More" affordance — overflow chip for additional actions.
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'sterlon-quick-chip sterlon-quick-chip-more';
      more.innerHTML = 'More <i data-lucide="chevron-right" class="ic-12"></i>';
      more.setAttribute('onclick', "quickAction(this,'more')");
      host.appendChild(more);
    });
    if (window.Lounge && window.Lounge.renderIcons) window.Lounge.renderIcons();
  }

  /* ───── Stagger entrance animations ─────
     CSS owns the animation (see .stagger-anim in lounge.css) including the
     prefers-reduced-motion opt-out. JS only fans out the per-card index
     via the --i custom property so each card's animation-delay computes
     from `calc(var(--i) * 30ms)`. Browsers that respect prefers-reduced-
     motion skip the animation entirely — including users whose page-load
     JS is slow, since the card paints at opacity 1 in that path. */
  function setupStaggerAnimations() {
    document.querySelectorAll('.widget, .post-card, .order-card, .event-card').forEach((el, i) => {
      el.classList.add('stagger-anim');
      el.style.setProperty('--i', String(i));
    });
    // Pulse only the small empty-dot form, not the count-pill form (which should read as a static number)
    document.querySelectorAll('.notif-dot:empty').forEach(d => {
      d.style.animation = 'pulse-dot 2.5s ease-in-out infinite';
    });
  }

  /* ───── Visit: global access from every member page ─────
     Renamed from Lounge.tab (legacy Lounge.cart alias still available).
     Per TV2 vocabulary lock ([BUSINESS_MODEL.md §0.4](../../../internal/BUSINESS_MODEL.md)),
     the in-venue session is now a "Visit" (member-initiated, member-owned), not a "Tab"
     (which carried staff-initiated venue-side connotations in the legacy schema).
     Localstorage key migrated `lounge-cart-count` → `lounge-visit-count` while
     reading from both keys for backward compat with existing mockup state. */
  const VISIT_KEY = 'lounge-visit-count';
  const LEGACY_TAB_KEY = 'lounge-cart-count';

  function getVisitCount() {
    try {
      const v = localStorage.getItem(VISIT_KEY) || localStorage.getItem(LEGACY_TAB_KEY) || '3';
      return parseInt(v, 10) || 0;
    } catch (e) { return 3; }
  }
  function setVisitCount(n) {
    const v = Math.max(0, n | 0);
    try {
      localStorage.setItem(VISIT_KEY, String(v));
      // Mirror to legacy key so older mockup pages reading lounge-cart-count still see updates
      localStorage.setItem(LEGACY_TAB_KEY, String(v));
    } catch (e) {}
    updateVisitBadge();
    return v;
  }
  function bumpVisit(delta) { return setVisitCount(getVisitCount() + (delta || 1)); }

  function updateVisitBadge() {
    const count = getVisitCount();
    // Selector list covers (a) legacy cart hooks, (b) legacy tab hooks (interim),
    // (c) canonical visit hooks. Pages can migrate to data-visit-count /
    // .visit-badge / #visit-count on their own cadence.
    document.querySelectorAll(
      '[data-cart-count], .cart-badge, #cart-count, ' +
      '[data-tab-count], .tab-badge, #tab-count, ' +
      '[data-visit-count], .visit-badge, #visit-count'
    ).forEach(el => {
      // a11y: announce count changes to screen readers. Set once per element
      // (idempotent across re-renders), polite to avoid interrupting.
      if (!el.hasAttribute('aria-live')) {
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-label', 'Items on your visit');
      }
      el.textContent = count > 0 ? count : '';
    });
  }

  function setupTabIcon() {
    // Visit indicator lives in the sidebar (HTML-authored on each page).
    // This function only keeps the visit-count badge in sync with localStorage —
    // it does not inject a top-bar visit link.
    updateVisitBadge();
  }

  // Sync badge across tabs/pages (listen to both new + legacy keys for backward compat)
  window.addEventListener('storage', e => {
    if (e.key === VISIT_KEY || e.key === LEGACY_TAB_KEY) updateVisitBadge();
  });

  // Legacy Lounge.tab function aliases (preserved for backward compat with existing mockup pages)
  const getTabCount = getVisitCount;
  const setTabCount = setVisitCount;
  const bumpTab = bumpVisit;
  const updateTabBadge = updateVisitBadge;

  /* ───── Live counters (demo) ───── */
  function setupLiveCounters() {
    const els = document.querySelectorAll('[data-live-members]');
    if (!els.length) return;
    let count = parseInt(els[0].textContent, 10) || 6;
    setInterval(() => {
      const delta = Math.random() > 0.5 ? 1 : -1;
      count = Math.max(2, Math.min(14, count + delta));
      els.forEach(el => (el.textContent = count));
    }, 9000);
  }

  /* ───── Welcome toast on feed/landing first visit ───── */
  function setupWelcomeToast() {
    try {
      if (sessionStorage.getItem('lounge-welcomed')) return;
      if (!/(feed|landing)\.html$/i.test(location.pathname)) return;
      setTimeout(() => {
        toast('✦ Welcome — press ? for keyboard shortcuts', { duration: 4500 });
        sessionStorage.setItem('lounge-welcomed', '1');
      }, 1200);
    } catch (e) {}
  }

  /* ───── Generic helpers exposed on window ───── */
  const _renderIcons = (window.Lounge && window.Lounge.renderIcons) || null;
  /* ───── HTML-escape helper ─────
     For any code path that builds markup via innerHTML or template literals
     from data that could become untrusted (search results, user-authored
     names, backend-fetched metadata). Escapes the 5 HTML-special chars so
     the value cannot break out of its text-node context. */
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* ───── Modal a11y helper ─────
     Focus save/restore + Tab focus-trap + Escape-to-close for in-page
     modals. Pages call Lounge.modal.open(modalEl) when showing a modal
     and Lounge.modal.close(modalEl) when hiding. We capture whatever had
     focus at open() time and restore it on close(). While open: Tab cycles
     inside the modal, Shift+Tab cycles backwards, Escape closes. */
  const FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const _modalState = new WeakMap();

  function openModal(modalEl, triggerEl) {
    if (!modalEl) return;
    const trigger = triggerEl || document.activeElement;
    const trapHandler = function (e) {
      if (e.key !== 'Tab') return;
      const items = modalEl.querySelectorAll(FOCUSABLE_SEL);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const escHandler = function (e) { if (e.key === 'Escape') closeModal(modalEl); };
    _modalState.set(modalEl, { trigger, trapHandler, escHandler });
    modalEl.addEventListener('keydown', trapHandler);
    document.addEventListener('keydown', escHandler);
    const focusables = modalEl.querySelectorAll(FOCUSABLE_SEL);
    if (focusables.length) {
      focusables[0].focus();
    } else {
      if (!modalEl.hasAttribute('tabindex')) modalEl.setAttribute('tabindex', '-1');
      modalEl.focus();
    }
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    const state = _modalState.get(modalEl);
    if (!state) return;
    modalEl.removeEventListener('keydown', state.trapHandler);
    document.removeEventListener('keydown', state.escHandler);
    _modalState.delete(modalEl);
    if (state.trigger && typeof state.trigger.focus === 'function') {
      state.trigger.focus();
    }
  }

  window.Lounge = {
    toast,
    toggleSidebar,
    toggleSidebarCollapsed,
    toggleLike,
    setFilter,
    escapeHtml,
    modal: { open: openModal, close: closeModal },
    // Canonical: Lounge.visit (Lounge.tab legacy alias remains available)
    visit: { get: getVisitCount, set: setVisitCount, bump: bumpVisit, refresh: updateVisitBadge },
    // Legacy alias preserved for backward compat with existing mockup pages
    tab:   { get: getVisitCount, set: setVisitCount, bump: bumpVisit, refresh: updateVisitBadge },
    // Config split: platform constants + current venue context
    platform: PLATFORM,
    venue:    VENUE,
    // Legacy alias (LOUNGE = VENUE)
    config:   VENUE
  };
  if (_renderIcons) window.Lounge.renderIcons = _renderIcons;
})();
