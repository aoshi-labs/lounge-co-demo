/**
 * SterlonPresentationRender — paint/render helpers extracted from sterlon-presentation-lifecycle.js.
 * Exposed as global.SterlonPresentationRender. Load after sterlon-presentation-lifecycle.js.
 */
(function (global) {
  'use strict';

  function _CR() { return global.SterlonCardRenderers || {}; }
  function _PP() { return global.SterlonProsePipeline || {}; }
  function _SPL() { return global.SterlonPresentationLifecycle || {}; }

  function paintSlotProseBubble(bubble, text, card) {
    const PP = _PP();
    const CR = _CR();
    const SPL = _SPL();
    const h = SPL.getHost ? SPL.getHost() : {};
    if (!bubble || !text) return;
    bubble.innerHTML = '';
    if (h.formatConciergeText) {
      bubble.innerHTML = h.formatConciergeText(text, card);
      bubble.querySelectorAll('.sterlon-pace-line').forEach(function (p) {
        p.classList.add('is-settled', 'sterlon-reco-slot-prose');
      });
      return;
    }
    const lines = SPL.splitProseIntoStreamLines
      ? SPL.splitProseIntoStreamLines(text)
      : [{ role: 'lead', text: text }];
    lines.forEach(function (lineSpec) {
      const p = document.createElement('p');
      p.className =
        'sterlon-pace-line is-settled sterlon-reco-slot-prose' +
        (lineSpec.role === 'lead' ? ' is-lead' : ' is-mood');
      const html = PP.applyInlineBold(PP.escapeHtml(PP.repairMojibake(lineSpec.text)));
      p.innerHTML = CR && CR.emphasizeProductNamesFromPlain
        ? CR.emphasizeProductNamesFromPlain(lineSpec.text, card, text)
        : (CR && CR.emphasizeProductNames
          ? CR.emphasizeProductNames(html, card, lineSpec.text, text)
          : html);
      bubble.appendChild(p);
    });
  }

  function bindFlightSlotProse(wrap, slotProse, cards) {
    const PP = _PP();
    if (!wrap || !slotProse || !PP) return;
    const hasAny = slotProse.best || slotProse.refined || slotProse.wildcard;
    if (!hasAny) return;

    const bubble = wrap.querySelector('.sterlon-reco-prose') || wrap.querySelector('.ai-bubble');
    const slotEls = wrap.querySelectorAll('.sterlon-reco-flight-slot');
    if (!bubble || !slotEls.length) return;

    const keys = ['best', 'refined', 'wildcard'];
    const hint = document.createElement('p');
    hint.className = 'sterlon-reco-flight-prose-hint';
    hint.textContent = 'Click a column to read that pick.';
    if (!wrap.querySelector('.sterlon-reco-flight-prose-hint')) {
      bubble.parentNode.insertBefore(hint, bubble.nextSibling);
    }

    function showSlot(key, index) {
      const text = slotProse[key];
      if (!text) return;
      slotEls.forEach(function (el, i) {
        el.classList.toggle('is-prose-active', i === index);
        el.setAttribute('aria-pressed', i === index ? 'true' : 'false');
      });
      const card = cards[index] || cards[0];
      paintSlotProseBubble(bubble, text, card);
    }

    slotEls.forEach(function (slotEl, idx) {
      if (!slotProse[keys[idx]]) return;
      slotEl.classList.add('sterlon-reco-flight-slot--focusable');
      slotEl.setAttribute('role', 'button');
      slotEl.setAttribute('tabindex', '0');
      slotEl.setAttribute('aria-label', 'Show description for ' + keys[idx]);
      slotEl.addEventListener('click', function () {
        showSlot(keys[idx], idx);
      });
      slotEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showSlot(keys[idx], idx);
        }
      });
    });

    showSlot('best', 0);
  }

  function renderRecommendationCardStack(wrap, cards, slotProse) {
    if (!wrap || !cards || !cards.length) return;
    const CR = _CR();
    if (!CR || !CR.renderUnifiedFlightCard) return;

    const container = document.createElement('div');
    container.className = 'sterlon-reco-card-stack sterlon-reco-card-stack--flight';
    container.appendChild(CR.renderUnifiedFlightCard(cards));
    wrap.appendChild(container);
    if (slotProse) bindFlightSlotProse(wrap, slotProse, cards);

    const quickBar = document.createElement('div');
    quickBar.className = 'sterlon-reco-quick-actions';
    [
      { icon: 'chevron-down',     label: 'Lighter',     action: 'lighter'     },
      { icon: 'arrow-left-right', label: 'Contrast',    action: 'contrast'    },
      { icon: 'chevron-up',       label: 'Bolder',      action: 'bolder'      },
      { icon: 'bookmark-plus',    label: 'Save flight', action: 'save-flight' }
    ].forEach(function (spec) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sterlon-quick-action-btn' + (spec.action === 'save-flight' ? ' sterlon-quick-action-btn--save' : '');
      btn.setAttribute('data-action', spec.action);
      btn.innerHTML = '<i data-lucide="' + spec.icon + '" class="ic-13"></i><span>' + spec.label + '</span>';
      quickBar.appendChild(btn);
    });
    wrap.appendChild(quickBar);

    if (global.Lounge && global.Lounge.renderIcons) global.Lounge.renderIcons();
  }

  function paintSettledProseBubble(bubble, proseText, highlightCard) {
    const PP = _PP();
    const CR = _CR();
    const SPL = _SPL();
    const h = SPL.getHost ? SPL.getHost() : {};
    if (!bubble || !proseText) return;
    bubble.innerHTML = '';
    if (h.formatConciergeText) {
      bubble.innerHTML = h.formatConciergeText(proseText, highlightCard);
      bubble.querySelectorAll('.sterlon-pace-line').forEach(function (p) {
        p.classList.add('is-settled', 'sterlon-stream-line');
      });
      return;
    }
    const p = document.createElement('p');
    p.className = 'sterlon-pace-line is-lead is-settled sterlon-stream-line';
    p.innerHTML = CR.emphasizeProductNames
      ? CR.emphasizeProductNames(
        PP.applyInlineBold(PP.escapeHtml(PP.repairMojibake(proseText))),
        highlightCard,
        proseText
      )
      : PP.applyInlineBold(PP.escapeHtml(PP.repairMojibake(proseText)));
    bubble.appendChild(p);
  }

  global.SterlonPresentationRender = {
    paintSlotProseBubble: paintSlotProseBubble,
    bindFlightSlotProse: bindFlightSlotProse,
    renderRecommendationCardStack: renderRecommendationCardStack,
    paintSettledProseBubble: paintSettledProseBubble
  };
})(typeof window !== 'undefined' ? window : global);
