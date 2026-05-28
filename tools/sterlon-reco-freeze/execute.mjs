/**
 * Execute one freeze fixture input against a loaded Sterlon vm context.
 * @param {import('vm').Context} ctx
 * @param {object} input - fixture payload (must include op)
 */

import { loadSterlonConciergeProseStack } from '../load-sterlon-stack.mjs';
import { loadPairingEvalDataset, runPairingQualityGate } from '../pairing-eval-gate.mjs';

const SLOT_KEYS = ['best', 'safe', 'wildcard'];

function latchSession(WJ, session, text) {
  const d = WJ.detectLevelFromPrompt(text);
  if (d === 'novice' || d === 'advanced') {
    session.latchedJourneyLevel = d;
    return;
  }
  if (WJ.isNovicePalate(text) && !session.latchedJourneyLevel) {
    session.latchedJourneyLevel = 'novice';
  }
}

function effectiveJourneyLevel(WJ, session, text) {
  latchSession(WJ, session, text);
  if (WJ.isNovicePalate(text)) {
    if (!session.latchedJourneyLevel) session.latchedJourneyLevel = 'novice';
    return 'novice';
  }
  if (session.latchedJourneyLevel === 'novice' || session.latchedJourneyLevel === 'advanced') {
    return session.latchedJourneyLevel;
  }
  return 'advanced';
}

function pickProvenance(p) {
  if (!p || typeof p !== 'object') return {};
  const out = {};
  if (p.source != null) out.source = p.source;
  if (p.module != null) out.module = p.module;
  if (p.reason != null) out.reason = p.reason;
  if (p.degradedCause != null) out.degradedCause = p.degradedCause;
  if (p.deckKey != null) out.deckKey = p.deckKey;
  if (Array.isArray(p.signals)) out.signals = p.signals.slice();
  if (p.postValidation === true) out.postValidation = true;
  // Provenance identity fields — freeze presence/value but not the UUID itself.
  out.hasTurnId = typeof p.turnId === 'string' && p.turnId.length > 0;
  if (p.scoringVersion != null) out.scoringVersion = p.scoringVersion;
  if (p.runtimeVersion != null) out.runtimeVersion = p.runtimeVersion;
  return out;
}

/** JSON-stable subset of RecommendationTurn for freeze goldens (no full context blobs). */
function projectRecommendationTurnForFreeze(ctx, turn) {
  const cards = turn.cards || [];
  const cbs = turn.contextsBySlot || {};
  const rbs = turn.rationaleBySlot || {};
  const comp = turn.compatibilityBySlot || {};
  const conf = turn.confidenceBySlot || {};
  const TH = ctx.RecommendationTurnHelpers;
  let validateOk = null;
  let governanceOk = null;
  let governanceAuthorityOk = null;
  if (TH && typeof TH.validateRecommendationTurn === 'function') {
    validateOk = TH.validateRecommendationTurn(turn).ok;
    const govFull = TH.validateRecommendationTurn(turn, { governance: true });
    governanceOk = govFull.ok;
    governanceAuthorityOk = govFull.governance ? govFull.governance.ok : null;
  }
  const als = turn.allowlistStatus;
  const allowlistVerified = als != null ? als.verified : null;
  const allowlistViolationCount = als && Array.isArray(als.violations) ? als.violations.length : null;
  const cardsProductIds = cards.map((c, i) => {
    if (!c) return { slot: SLOT_KEYS[i] || null, cigarId: null, spiritId: null, foodId: null };
    return {
      slot: c.slot || SLOT_KEYS[i] || null,
      cigarId: c.cigarId != null ? c.cigarId : null,
      spiritId: c.spiritId != null ? c.spiritId : null,
      foodId: c.foodId != null ? c.foodId : null
    };
  });
  return {
    contractVersion: turn.contractVersion,
    productIdAuthority: turn.productIdAuthority != null ? turn.productIdAuthority : null,
    cardsProductIds,
    runtimeMode: turn.runtimeMode == null ? null : turn.runtimeMode,
    degraded: turn.degraded,
    journeyLevel: turn.journeyLevel == null ? null : turn.journeyLevel,
    provenance: pickProvenance(turn.provenance),
    degradedCause: turn.provenance && turn.provenance.degradedCause != null ? turn.provenance.degradedCause : null,
    cardsLen: cards.length,
    slotKeys: SLOT_KEYS.slice(),
    bestContextPresent: !!cbs.best,
    safeContextPresent: !!cbs.safe,
    wildcardContextPresent: !!cbs.wildcard,
    bestRationaleLen: Array.isArray(rbs.best) ? rbs.best.length : 0,
    safeRationaleLen: Array.isArray(rbs.safe) ? rbs.safe.length : 0,
    wildcardRationaleLen: Array.isArray(rbs.wildcard) ? rbs.wildcard.length : 0,
    bestCompatibilityPresent: !!comp.best,
    safeCompatibilityPresent: !!comp.safe,
    wildcardCompatibilityPresent: !!comp.wildcard,
    bestConfidence: conf.best != null ? conf.best : null,
    safeConfidence: conf.safe != null ? conf.safe : null,
    wildcardConfidence: conf.wildcard != null ? conf.wildcard : null,
    allowlistVerified,
    allowlistViolationCount,
    validateOk,
    governanceOk,
    governanceAuthorityOk
  };
}

/** Delegates to RecommendationRuntime.resolveRecommendationTurn (canonical) or buildRecommendationSet. */
function runtimeRecommendationCards(ctx, text, session) {
  const RR = ctx.RecommendationRuntime;
  const WJ = ctx.WhiskeyJourney;
  const resolveTurn =
    RR && typeof RR.resolveRecommendationTurn === 'function'
      ? RR.resolveRecommendationTurn
      : RR && typeof RR.buildRecommendationSet === 'function'
        ? RR.buildRecommendationSet
        : null;
  if (!resolveTurn) {
    throw new Error('RecommendationRuntime.resolveRecommendationTurn required for recommendation freeze');
  }
  const journeyLevel = effectiveJourneyLevel(WJ, session, text);
  const turn = resolveTurn({
    promptText: text || '',
    journeyLevel,
    sessionRuntime: session
  });
  return turn.cards;
}
import { handleGroupA } from './execute-handlers-a.mjs';
import { handleGroupB } from './execute-handlers-b.mjs';
import { handleGroupC } from './execute-handlers-c.mjs';
import { handleGroupD } from './execute-handlers-d.mjs';
import { handleGroupE } from './execute-handlers-e.mjs';
import { handleGroupF } from './execute-handlers-f.mjs';
import { handleGroupG } from './execute-handlers-g.mjs';
import { handleGroupH } from './execute-handlers-h.mjs';
import { handleGroupI } from './execute-handlers-i.mjs';

export function executeFreezeCase(ctx, input) {
  const op = input.op;
  const H = {
    latchSession, effectiveJourneyLevel, pickProvenance,
    projectRecommendationTurnForFreeze, runtimeRecommendationCards,
    loadSterlonConciergeProseStack, loadPairingEvalDataset,
    runPairingQualityGate, SLOT_KEYS
  };
  let r;
  r = handleGroupA(ctx, op, input, H); if (r !== undefined) return r;
  r = handleGroupB(ctx, op, input, H); if (r !== undefined) return r;
  r = handleGroupC(ctx, op, input, H); if (r !== undefined) return r;
  r = handleGroupD(ctx, op, input, H); if (r !== undefined) return r;
  r = handleGroupE(ctx, op, input, H); if (r !== undefined) return r;
  r = handleGroupF(ctx, op, input, H); if (r !== undefined) return r;
  r = handleGroupG(ctx, op, input, H); if (r !== undefined) return r;
  r = handleGroupH(ctx, op, input, H); if (r !== undefined) return r;
  r = handleGroupI(ctx, op, input, H); if (r !== undefined) return r;
  throw new Error('executeFreezeCase: unknown op: ' + op);
}
