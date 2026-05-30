/**
 * sterlon-grok-sommelier.js — Grok sommelier mode bypass.
 *
 * Feature flag: window.STERLON_GROK_SOMMELIER_ONLY = true | false
 *
 * When the flag is true, sterlon-chat.js routes all sommelier turns (pairings,
 * recommendations, compatibility questions) to Grok via the existing gateway
 * instead of the local recommendation runtime. No cards, flight UI, or
 * RecommendationTurn artifacts are created.
 *
 * To restore the governed runtime: set window.STERLON_GROK_SOMMELIER_ONLY = false.
 * No existing runtime files are removed or disabled by this module.
 *
 * Architecture: docs/internal/STERLON_RECOMMENDATION_EXTRACTION.md
 */
(function () {
  'use strict';

  /**
   * System prompt template sent to Grok in sommelier-only mode.
   * Contains {{USER_MESSAGE}} and {{RESPONSE_SHAPE_HINT}} — call
   * buildGrokSystemPrompt(text) before sending to the gateway.
   *
   * Never claims inventory, never identifies as Grok, never produces JSON or cards.
   */
  var GROK_SOMMELIER_SYSTEM_PROMPT = [
    'You are Sterlon, a top-tier cigar and spirits sommelier for a private lounge.',
    '',
    'Answer the member\'s question the way a great sommelier would at the rail — direct, specific, human. You may recommend real-world bottles, brands, and cigars by name. Do not hide behind generic tasting notes.',
    '',
    'Pairing philosophy:',
    'Aim for pairings that feel intentional — complementary when profiles echo, contrasting when you want balance on the palate. Either can be a 10/10 night if the logic is clear.',
    '',
    'Inventory honesty:',
    '- You are not checking lounge inventory.',
    '- Name specific brands as expert suggestions; do not claim the lounge carries them.',
    '- If something is rare or allocated, say so briefly.',
    '- If they ask what is on the current menu, say you would need the current menu.',
    '',
    'Specificity:',
    'Unless the question is purely conceptual, name real products — not just "a bourbon" or "an aged rum." Make a call when they want one; give distinct named options when they ask for several.',
    '',
    'Voice and shape — this is critical:',
    '- Write like a person, not a form. Vary your openings and structure from turn to turn.',
    '- Match the member\'s question: one pick when they want a decision; a short list when they ask for options; a side-by-side when they want a comparison.',
    '- Use short, confident sentences. A tight paragraph or a few natural lines is fine.',
    '- Do NOT use the same fixed section headers every time (no "Direct Pick:", "The Core Flavor:", "The Strategy:", "What to Avoid:", "Serving:" rubric).',
    '- Do NOT repeat the same five-part outline on every answer. Weave pairing logic into normal prose.',
    '- Skip labels, numbered rubrics, and markdown headers unless the member explicitly asked for that format.',
    '',
    '{{RESPONSE_SHAPE_HINT}}',
    '',
    'Product names:',
    '- Wrap every specific bottle, brand, and cigar in **double asterisks** (example: **Booker\'s Bourbon**, **Padron 1926**).',
    '- Bold product names only — not whole sentences, section labels, or glassware.',
    '',
    '{{FOLLOWUP_INSTRUCTIONS}}',
    '',
    'Tone:',
    'Confident, warm, premium, concise. Sound like a real lounge expert, not an AI. No markdown tables. No JSON. No fake inventory claims. Avoid excessive hedging.',
    '',
    'Member question:',
    '{{USER_MESSAGE}}'
  ].join('\n');

  function inferResponseShapeHint(text) {
    var RT = typeof window !== 'undefined' ? window.SterlonChatRouter : null;
    if (RT && typeof RT.isPureGreeting === 'function' && RT.isPureGreeting(text)) {
      return 'Shape hint: Pure greeting — welcome them warmly and ask what mood, category, or pairing direction they want. Do NOT recommend specific bottles, cigars, or pairings in this response.';
    }
    var t = String(text || '').toLowerCase();
    if (
      /\b(?:give me|show me|list|suggest)\s+(?:me\s+)?(\d+|one|two|three|four|five|a few|several|couple)\b/.test(t) ||
      /\b(\d+|three|3|two|2|four|4|five|5|few|several)\s+(?:options?|choices?|picks?|recommendations?|pairings?|ideas?)\b/.test(t) ||
      (/\boptions?\b/.test(t) && /\b(give|show|list|what are|any)\b/.test(t))
    ) {
      return 'Shape hint: They asked for multiple options — give that many distinct, named picks (each with a brief why). Do not collapse into one pick with filler sections.';
    }
    if (/\b(compare|comparison|versus|vs\.?|difference between|which is better|between .+ and)\b/.test(t)) {
      return 'Shape hint: They want a comparison — contrast the specific products in plain, conversational language.';
    }
    if (/\b(why|how come|what makes|explain|walk me through)\b/.test(t)) {
      return 'Shape hint: They want insight — teach briefly while naming concrete bottles or cigars.';
    }
    if (/\b(pair|pairing|goes with|works with|what should i (?:drink|pour|smoke))\b/.test(t)) {
      return 'Shape hint: They want a pairing call — name the spirit and cigar (or either side they left open) and say why they work in natural prose.';
    }
    return 'Shape hint: Answer in whatever shape fits — one pick, a short list, or a quick comparison. Keep it fresh; do not default to a formula.';
  }

  /**
   * Returns a ready-to-send system prompt with {{USER_MESSAGE}} replaced by text.
   * Use this instead of GROK_SOMMELIER_SYSTEM_PROMPT directly.
   */
  function buildGrokSystemPrompt(text) {
    var memberMessage = (text || '').trim();
    var follow = (typeof window !== 'undefined' && window.SterlonGrokFollowups)
      ? window.SterlonGrokFollowups.GROK_FOLLOWUP_PROMPT_LINES
      : '';
    return GROK_SOMMELIER_SYSTEM_PROMPT
      .replace('{{RESPONSE_SHAPE_HINT}}', inferResponseShapeHint(memberMessage))
      .replace('{{FOLLOWUP_INSTRUCTIONS}}', follow)
      .replace('{{USER_MESSAGE}}', memberMessage);
  }

  function parseGrokSommelierResponse(rawText, userMessage) {
    if (typeof window !== 'undefined' && window.SterlonGrokFollowups) {
      return window.SterlonGrokFollowups.parseGrokSommelierResponse(rawText, userMessage);
    }
    return { prose: rawText || '', chips: [] };
  }

  /**
   * Returns true when the Grok sommelier bypass is active.
   * Reads window.STERLON_GROK_SOMMELIER_ONLY at call time so it can be toggled
   * in DevTools without a page reload.
   */
  function isGrokSommelierMode() {
    return typeof window !== 'undefined' && window.STERLON_GROK_SOMMELIER_ONLY === true;
  }

  window.SterlonGrokSommelier = {
    GROK_SOMMELIER_SYSTEM_PROMPT: GROK_SOMMELIER_SYSTEM_PROMPT,
    buildGrokSystemPrompt: buildGrokSystemPrompt,
    parseGrokSommelierResponse: parseGrokSommelierResponse,
    inferResponseShapeHint: inferResponseShapeHint,
    isGrokSommelierMode: isGrokSommelierMode
  };

}());
