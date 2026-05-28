/**
 * SterlonConciergeProseShared — context provider + internal helpers for concierge modules.
 */
(function (global) {
  'use strict';

  var _contextProviderWired = false;
  var _unwiredWarned = false;

  function _defaultContext() {
    return {
      sessionRuntime: {
        turnCount: 0,
        sessionProductRegistry: [],
        activeRecommendationSet: null,
        activeCategoryFocus: null,
        lastRecommendationTurn: null,
        flavorRoute: null,
        refinementChainDepth: 0
      },
      currentTurnDeckKey: 'bourbon',
      spiritIntensityLadder: null,
      cigarIntensityLadder: null
    };
  }

  var _contextProvider = function () { return _defaultContext(); };

  function setContextProvider(fn) {
    if (typeof fn !== 'function') return;
    if (_contextProviderWired) {
      if (global.console && console.warn && !setContextProvider._doubleWarned) {
        setContextProvider._doubleWarned = true;
        console.warn('[SterlonConciergeProse] setContextProvider called more than once — last provider wins.');
      }
    }
    _contextProvider = fn;
    _contextProviderWired = true;
  }

  function _ctx() {
    if (!_contextProviderWired && global.console && console.warn && !_unwiredWarned) {
      _unwiredWarned = true;
      console.warn('[SterlonConciergeProse] setContextProvider not called — using isolated default context');
    }
    var raw = _contextProvider();
    return raw && typeof raw === 'object' ? raw : _defaultContext();
  }

  function _PP() { return global.SterlonProsePipeline || {}; }
  function _GP() { return global.SterlonGatewayProse || {}; }
  function _SP() { return global.SterlonPresentationOverlays || {}; }
  function _SO() { return global.SterlonSessionRouting || {}; }
  function _RT() { return global.SterlonChatRouter || null; }
  function _SR() { return global.SterlonRecommendations || null; }
  function _RR() { return global.RecommendationRuntime || null; }

  function _runtimeModeEnum() {
    var c = _ctx();
    if (c.RuntimeMode) return c.RuntimeMode;
    var RS = global.SterlonRuntimeState;
    return (RS && RS.RuntimeMode) || {};
  }

  function _session() {
    return _ctx().sessionRuntime || _defaultContext().sessionRuntime;
  }

  function _spiritLadder() {
    var c = _ctx();
    if (c.spiritIntensityLadder && c.spiritIntensityLadder.length) return c.spiritIntensityLadder;
    var ss = global.SterlonSensory;
    if (ss && typeof ss.getIntensityOrderedSpirits === 'function') return ss.getIntensityOrderedSpirits();
    var lp = global.LoungeProducts;
    return lp && typeof lp.listMenuSpiritNames === 'function' ? lp.listMenuSpiritNames() : [];
  }

  function _cigarLadder() {
    var c = _ctx();
    if (c.cigarIntensityLadder && c.cigarIntensityLadder.length) return c.cigarIntensityLadder;
    var ss = global.SterlonSensory;
    if (ss && typeof ss.getIntensityOrderedCigars === 'function') return ss.getIntensityOrderedCigars();
    var lp = global.LoungeProducts;
    return lp && typeof lp.listMenuCigarNames === 'function' ? lp.listMenuCigarNames() : [];
  }

  function _validateVisibleText(rawText, promptTextForFallback, profileKey, opts) {
    var GP = _GP();
    var PP = _PP();
    var profile = profileKey || 'recommendation';
    var govOpts = opts && opts.sealedCards
      ? {
          sealedCards: opts.sealedCards,
          bindSealedSlots: opts.bindSealedSlots === true,
          categoryFocus: opts.categoryFocus || null,
          promptText: promptTextForFallback || null
        }
      : undefined;
    var text = GP.governGeneratedProse(PP.humanizePresentationProse(rawText || ''), profile, govOpts);
    if (!text) {
      var Rec = global.SterlonConciergeRecommendationProse;
      text = promptTextForFallback && Rec && Rec.buildRecommendationLeadProse
        ? Rec.buildRecommendationLeadProse(promptTextForFallback)
        : (PP.GENERIC_LEAD_FALLBACK || '');
    }
    text = text.replace(/\b(i am an ai|as an ai|language model)\b/gi, '');
    if (GP.hasEmoji && GP.hasEmoji(text)) {
      text = text.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
    }
    return GP.governGeneratedProse(text, profile, govOpts);
  }

  function _visible(raw, prompt, profile, opts) {
    var c = _ctx();
    if (typeof c.validateVisibleText === 'function') {
      return c.validateVisibleText(raw, prompt, profile, opts);
    }
    return _validateVisibleText(raw, prompt, profile, opts);
  }

  function _inferRecoSlot(turn, card) {
    var inf = _ctx().inferRecoSlotFromTurn;
    if (typeof inf === 'function') return inf(turn, card);
    return null;
  }

  function _resolveFlavorRoute(text) {
    var RT = _RT();
    var SFM = global.SterlonFlavorMatch;
    if (!SFM || !RT || typeof SFM.resolveFlavorRoute !== 'function') return null;
    return SFM.resolveFlavorRoute(text, { category: RT.inferCategoryBiasForFlavor(text) });
  }

  global.SterlonConciergeProseShared = {
    setContextProvider: setContextProvider,
    _ctx: _ctx,
    _PP: _PP,
    _GP: _GP,
    _SP: _SP,
    _SO: _SO,
    _RT: _RT,
    _SR: _SR,
    _RR: _RR,
    _runtimeModeEnum: _runtimeModeEnum,
    _session: _session,
    _spiritLadder: _spiritLadder,
    _cigarLadder: _cigarLadder,
    _visible: _visible,
    _inferRecoSlot: _inferRecoSlot,
    _resolveFlavorRoute: _resolveFlavorRoute
  };
})(typeof window !== 'undefined' ? window : global);
