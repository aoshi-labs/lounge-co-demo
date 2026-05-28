/* sterlon-scroll-anchor.js — conversational scroll pinning for Sterlon chat
   Extracted from sterlon-chat.js scroll anchoring. Self-contained; no session/prose. */
(function () {
  'use strict';

  var DEFAULT_OPTIONS = {
    getScrollContainerId: 'sterlon-chat-scroll',
    chatId: 'chat',
    chatColSelector: '.sterlon-chat-col'
  };

  var options = Object.assign({}, DEFAULT_OPTIONS);

  function resolveToElement(spec, fallback, mode) {
    var v = spec != null ? spec : fallback;
    if (typeof v === 'function') {
      var r = v();
      if (r && r.nodeType === 1) return r;
      if (typeof r === 'string') {
        return mode === 'id' ? document.getElementById(r) : document.querySelector(r);
      }
      return null;
    }
    if (typeof v === 'string') {
      return mode === 'id' ? document.getElementById(v) : document.querySelector(v);
    }
    return null;
  }

  function getChatScrollContainer() {
    return resolveToElement(options.getScrollContainerId, DEFAULT_OPTIONS.getScrollContainerId, 'id');
  }

  function getChatElement() {
    return resolveToElement(options.chatId, DEFAULT_OPTIONS.chatId, 'id');
  }

  function getChatColElement() {
    return resolveToElement(options.chatColSelector, DEFAULT_OPTIONS.chatColSelector, 'query');
  }

  var scrollAnchorState = {
    pinned: true,
    rafId: null,
    settleTimer: null,
    longSettleTimer: null,
    resizeDebounceTimer: null,
    resizeObserver: null,
    mutationObserver: null,
    scrollListenerBound: false,
    lastScrollTop: 0,
    programmaticScroll: false,
    programmaticClearTimer: null
  };

  var SCROLL_PIN_THRESHOLD_PX = 80;
  var SCROLL_SETTLE_MS = 80;
  var SCROLL_LONG_SETTLE_MS = 360;

  function getDistanceFromBottom() {
    var el = getChatScrollContainer();
    if (el) {
      return el.scrollHeight - el.clientHeight - el.scrollTop;
    }
    var doc = document.documentElement;
    var scrollTop = window.scrollY || doc.scrollTop || 0;
    return doc.scrollHeight - window.innerHeight - scrollTop;
  }

  function isNearConversationalBottom(thresholdPx) {
    return getDistanceFromBottom() <= (thresholdPx != null ? thresholdPx : SCROLL_PIN_THRESHOLD_PX);
  }

  function syncScrollPinFromViewport() {
    if (scrollAnchorState.programmaticScroll) return;
    var scrollEl = getChatScrollContainer();
    var st = scrollEl ? scrollEl.scrollTop : window.scrollY || 0;
    var delta = st - scrollAnchorState.lastScrollTop;
    scrollAnchorState.lastScrollTop = st;
    if (delta < -3) {
      scrollAnchorState.pinned = false;
      return;
    }
    if (isNearConversationalBottom()) scrollAnchorState.pinned = true;
  }

  function markProgrammaticScroll() {
    scrollAnchorState.programmaticScroll = true;
    if (scrollAnchorState.programmaticClearTimer) {
      clearTimeout(scrollAnchorState.programmaticClearTimer);
    }
    scrollAnchorState.programmaticClearTimer = setTimeout(function () {
      scrollAnchorState.programmaticScroll = false;
      var scrollEl = getChatScrollContainer();
      scrollAnchorState.lastScrollTop = scrollEl ? scrollEl.scrollTop : window.scrollY || 0;
    }, 120);
  }

  function applyConversationalScrollTop(top, smooth) {
    var scrollEl = getChatScrollContainer();
    if (scrollEl) {
      if (Math.abs(scrollEl.scrollTop - top) < 3) return;
      markProgrammaticScroll();
      scrollEl.scrollTo({ top: top, behavior: smooth === true ? 'smooth' : 'auto' });
      return;
    }
    if (Math.abs(window.scrollY - top) < 3) return;
    markProgrammaticScroll();
    window.scrollTo({ top: top, behavior: smooth === true ? 'smooth' : 'auto' });
  }

  function scrollToConversationalBottom(opts) {
    var o = opts || {};
    if (!o.force && !scrollAnchorState.pinned) return;

    if (scrollAnchorState.rafId) cancelAnimationFrame(scrollAnchorState.rafId);
    scrollAnchorState.rafId = requestAnimationFrame(function () {
      scrollAnchorState.rafId = requestAnimationFrame(function () {
        scrollAnchorState.rafId = null;
        var scrollEl = getChatScrollContainer();
        if (scrollEl) {
          var top = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
          applyConversationalScrollTop(top, o.smooth === true);
          return;
        }
        var anchor = getChatElement();
        if (!anchor) return;
        var rect = anchor.getBoundingClientRect();
        var targetTop = window.scrollY + rect.bottom - window.innerHeight + 24;
        var maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        applyConversationalScrollTop(Math.max(0, Math.min(targetTop, maxTop)), o.smooth === true);
      });
    });
  }

  function clearScrollSettleTimers() {
    if (scrollAnchorState.settleTimer) {
      clearTimeout(scrollAnchorState.settleTimer);
      scrollAnchorState.settleTimer = null;
    }
    if (scrollAnchorState.longSettleTimer) {
      clearTimeout(scrollAnchorState.longSettleTimer);
      scrollAnchorState.longSettleTimer = null;
    }
  }

  function scheduleScrollSettle(smooth) {
    clearScrollSettleTimers();
    scrollAnchorState.settleTimer = setTimeout(function () {
      scrollAnchorState.settleTimer = null;
      scrollToConversationalBottom({ force: true, smooth: false });
    }, SCROLL_SETTLE_MS);
    scrollAnchorState.longSettleTimer = setTimeout(function () {
      scrollAnchorState.longSettleTimer = null;
      if (scrollAnchorState.pinned) {
        scrollToConversationalBottom({ force: true, smooth: false });
      }
    }, SCROLL_LONG_SETTLE_MS);
  }

  function scrollChat(opts) {
    var o = opts || {};
    if (o.force) scrollAnchorState.pinned = true;
    if (!scrollAnchorState.pinned && !o.force) return;

    scrollToConversationalBottom({
      force: true,
      smooth: o.smooth === true
    });
    scheduleScrollSettle(o.smooth === true);
  }

  function bindScrollAnchoring() {
    var scrollEl = getChatScrollContainer();
    var chat = getChatElement();
    var chatCol = getChatColElement();
    if (!chat) return;

    if (!scrollAnchorState.scrollListenerBound) {
      scrollAnchorState.scrollListenerBound = true;
      scrollAnchorState.lastScrollTop = scrollEl ? scrollEl.scrollTop : window.scrollY || 0;
      var scrollTarget = scrollEl || window;
      scrollTarget.addEventListener('scroll', syncScrollPinFromViewport, { passive: true });
      var wheelTarget = scrollEl || window;
      wheelTarget.addEventListener(
        'wheel',
        function (e) {
          if (e.deltaY < -4) scrollAnchorState.pinned = false;
        },
        { passive: true }
      );
      var touchStartY = null;
      var touchTarget = scrollEl || window;
      touchTarget.addEventListener(
        'touchstart',
        function (e) {
          if (e.touches && e.touches.length) touchStartY = e.touches[0].clientY;
        },
        { passive: true }
      );
      touchTarget.addEventListener(
        'touchmove',
        function (e) {
          if (touchStartY == null || !e.touches || !e.touches.length) return;
          if (e.touches[0].clientY - touchStartY > 14) scrollAnchorState.pinned = false;
        },
        { passive: true }
      );
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function () {
          if (scrollAnchorState.pinned) {
            scrollToConversationalBottom({ force: true, smooth: false });
            scheduleScrollSettle(false);
          }
        });
      }
    }

    if (!chat._sterlonScrollLoadBound) {
      chat._sterlonScrollLoadBound = true;
      chat.addEventListener(
        'load',
        function (e) {
          if (e.target && e.target.tagName === 'IMG' && scrollAnchorState.pinned) {
            scrollChat({ smooth: false });
          }
        },
        true
      );
    }

    if (typeof MutationObserver !== 'undefined') {
      if (scrollAnchorState.mutationObserver) scrollAnchorState.mutationObserver.disconnect();
      scrollAnchorState.mutationObserver = new MutationObserver(function (mutations) {
        if (!scrollAnchorState.pinned) return;
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
            scrollChat({ smooth: false });
            return;
          }
        }
      });
      scrollAnchorState.mutationObserver.observe(chat, { childList: true });
    }

    if (typeof ResizeObserver === 'undefined') return;
    if (scrollAnchorState.resizeObserver) scrollAnchorState.resizeObserver.disconnect();

    scrollAnchorState.resizeObserver = new ResizeObserver(function () {
      if (!scrollAnchorState.pinned) return;
      if (scrollAnchorState.resizeDebounceTimer) clearTimeout(scrollAnchorState.resizeDebounceTimer);
      scrollAnchorState.resizeDebounceTimer = setTimeout(function () {
        scrollAnchorState.resizeDebounceTimer = null;
        scrollToConversationalBottom({ force: true, smooth: false });
      }, 32);
    });
    scrollAnchorState.resizeObserver.observe(chat);
    if (scrollEl) scrollAnchorState.resizeObserver.observe(scrollEl);
    else if (chatCol && chatCol !== chat) scrollAnchorState.resizeObserver.observe(chatCol);
  }

  function init(opts) {
    options = Object.assign({}, DEFAULT_OPTIONS, opts || {});
    bindScrollAnchoring();
  }

  function getState() {
    return {
      pinned: scrollAnchorState.pinned,
      lastScrollTop: scrollAnchorState.lastScrollTop,
      programmaticScroll: scrollAnchorState.programmaticScroll,
      scrollListenerBound: scrollAnchorState.scrollListenerBound
    };
  }

  function setPinned(value) {
    scrollAnchorState.pinned = !!value;
  }

  window.SterlonScrollAnchor = {
    init: init,
    scrollChat: scrollChat,
    getState: getState,
    setPinned: setPinned
  };
})();
