/**
 * Runtime test harness for generated apps.
 *
 * Injects test code into the generated HTML, loads it in a hidden iframe,
 * and collects real runtime results via postMessage.
 *
 * KEY TESTS:
 * - JS errors on load
 * - Canvas rendering (pixels drawn)
 * - Actually CLICKS start buttons / canvas and verifies state change
 * - Detects "immediate game-over" bug (game skips playing state)
 * - Checks game STAYS in playing state for 2+ seconds
 * - JS errors AFTER clicking
 */

export interface RuntimeTestResult {
  id: string;
  name: string;
  status: 'pass' | 'fail';
  reason?: string;
}

export interface RuntimeTestReport {
  results: RuntimeTestResult[];
  jsErrors: string[];
  overallPass: boolean;
  summary: string;
  /** Base64-encoded PNG screenshots captured from the canvas at different states */
  screenshots: {
    /** Title/menu screen before any interaction */
    menuScreen?: string;
    /** Active gameplay after clicking start */
    gameplayScreen?: string;
  };
}

/**
 * The test script injected into the generated HTML.
 * Runs tests in phases:
 *   Phase 1 (500ms): Check load errors, canvas setup, initial render
 *   Phase 2 (1000ms): Snapshot canvas, CLICK start button / canvas
 *   Phase 3 (2500ms): Verify game is PLAYING (not game-over), check post-click errors
 *   Phase 4 (4000ms): Verify game is STILL playing (didn't immediately die)
 */
function getTestScript(): string {
  return `
<script data-appforge-test="true">
(function() {
  var results = [];
  var jsErrors = [];
  var jsErrorsAfterClick = [];
  var clickPhaseStarted = false;
  var screenshots = {};

  // Catch JS errors — split by before/after click
  window.onerror = function(msg, url, line, col, error) {
    var entry = (msg || 'Unknown error') + ' (line ' + (line || '?') + ')';
    if (clickPhaseStarted) {
      jsErrorsAfterClick.push(entry);
    } else {
      jsErrors.push(entry);
    }
    return false;
  };
  window.addEventListener('unhandledrejection', function(e) {
    var entry = 'Unhandled promise: ' + (e.reason && e.reason.message ? e.reason.message : e.reason || 'unknown');
    if (clickPhaseStarted) {
      jsErrorsAfterClick.push(entry);
    } else {
      jsErrors.push(entry);
    }
  });

  function addResult(id, name, pass, reason) {
    results.push({ id: id, name: name, status: pass ? 'pass' : 'fail', reason: reason || undefined });
  }

  function sampleCanvas(canvas) {
    try {
      var ctx = canvas.getContext('2d');
      if (!ctx) return { nonTransparent: 0, hash: 0 };
      var w = Math.min(canvas.width, 375);
      var h = Math.min(canvas.height, 667);
      var imgData = ctx.getImageData(0, 0, w, h);
      var pixels = imgData.data;
      var nonTransparent = 0;
      var hash = 0;
      for (var p = 0; p < pixels.length; p += 400) {
        if (pixels[p + 3] > 0) nonTransparent++;
        hash = ((hash << 5) - hash + pixels[p] + pixels[p+1] + pixels[p+2]) | 0;
      }
      return { nonTransparent: nonTransparent, hash: hash };
    } catch(e) {
      return { nonTransparent: -1, hash: 0, error: e.message };
    }
  }

  function captureScreenshot(label) {
    try {
      var canvases = document.querySelectorAll('canvas');
      if (canvases.length > 0) {
        var canvas = canvases[0];
        if (canvas.width > 0 && canvas.height > 0) {
          screenshots[label] = canvas.toDataURL('image/png');
          return;
        }
      }
      var body = document.body || document.documentElement;
      var w = Math.min(body.scrollWidth || 375, 375);
      var h = Math.min(body.scrollHeight || 667, 667);
      var offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      var ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.fillStyle = getComputedStyle(body).backgroundColor || '#ffffff';
        ctx.fillRect(0, 0, w, h);
        screenshots[label] = offscreen.toDataURL('image/png');
      }
    } catch(e) {}
  }

  function findStartButton() {
    var candidates = document.querySelectorAll('button, [role="button"], [onclick], a');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = (el.textContent || '').toLowerCase().trim();
      // Skip hidden elements
      var style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      if (text.match(/^(start|play|begin|tap to|click to|press to|go!?|launch|new game|play game)$/i) ||
          text.match(/start|play game|begin game|tap to start|tap to play|click to start|click to play/)) {
        return el;
      }
    }
    return null;
  }

  /**
   * Detect if the game is currently showing a "game over" screen.
   * Checks both DOM text content and canvas-rendered text.
   */
  function detectGameOverState() {
    var gameOverPatterns = /game\\s*over|you\\s*(died|lost|lose)|restart|try\\s*again|play\\s*again|final\\s*score|your\\s*score/i;

    // Check DOM text content
    var allText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    if (gameOverPatterns.test(allText)) {
      // But make sure this isn't just a "play again" button on a title screen
      // If we also see "start" or "play" as a primary action, it might be a title screen
      var hasStartButton = findStartButton();
      // If we see "game over" or "your score" or "restart" text, it's definitely game-over
      if (/game\\s*over|your\\s*score|final\\s*score|you\\s*(died|lost)/i.test(allText)) {
        return { isGameOver: true, evidence: 'DOM text contains game-over indicators: "' + allText.slice(0, 100).replace(/\\n/g, ' ') + '"' };
      }
    }

    // Check for visible game-over overlay divs
    var overlays = document.querySelectorAll('div, section, dialog, [class*="over"], [class*="end"], [id*="over"], [id*="end"], [class*="modal"], [class*="gameover"]');
    for (var i = 0; i < overlays.length; i++) {
      var el = overlays[i];
      var style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      var text = (el.textContent || '').toLowerCase();
      if (/game\\s*over|you\\s*(died|lost)/i.test(text) && style.position !== 'static') {
        return { isGameOver: true, evidence: 'Visible overlay with game-over text found' };
      }
    }

    return { isGameOver: false, evidence: '' };
  }

  /**
   * Check the game state variable directly if accessible.
   * Many games store state in a global variable like gameState, state, currentState.
   */
  function detectGameStateVariable() {
    var stateVarNames = ['gameState', 'state', 'currentState', 'game_state', 'GAME_STATE'];
    for (var i = 0; i < stateVarNames.length; i++) {
      try {
        var val = window[stateVarNames[i]];
        if (typeof val === 'string') {
          return { varName: stateVarNames[i], value: val };
        }
      } catch(e) {}
    }
    // Also check common patterns in source code
    var scripts = document.querySelectorAll('script:not([data-appforge-test])');
    var code = '';
    scripts.forEach(function(s) { code += s.textContent || ''; });

    // Check for state variable declarations
    var stateMatch = code.match(/(?:let|var|const)\\s+(gameState|state|currentState|game_state)\\s*=\\s*['"]([^'"]+)['"]/);
    if (stateMatch) {
      try {
        var val = window[stateMatch[1]];
        if (typeof val === 'string') {
          return { varName: stateMatch[1], value: val };
        }
      } catch(e) {}
    }
    return null;
  }

  // ═══ PHASE 1: Load checks (500ms after ready) ═══
  function phase1() {
    addResult('no-js-errors-load', 'No JavaScript errors on page load',
      jsErrors.length === 0,
      jsErrors.length > 0 ? 'JS errors on load: ' + jsErrors.join('; ') : undefined);

    var canvases = document.querySelectorAll('canvas');
    var isCanvasApp = canvases.length > 0;

    if (isCanvasApp) {
      var canvas = canvases[0];
      var hasSize = canvas.width > 0 && canvas.height > 0;
      addResult('canvas-setup', 'Canvas has valid dimensions',
        hasSize,
        hasSize ? undefined : 'Canvas dimensions: ' + canvas.width + 'x' + canvas.height);

      var scripts = document.querySelectorAll('script:not([data-appforge-test])');
      var code = '';
      scripts.forEach(function(s) { code += s.textContent || ''; });
      var hasRAF = code.includes('requestAnimationFrame');
      addResult('has-game-loop', 'Game loop (requestAnimationFrame) exists',
        hasRAF,
        hasRAF ? undefined : 'No requestAnimationFrame found');

      // Check for proper game states in source
      var hasGameStates = code.match(/['"]menu['"]/i) && code.match(/['"]play(ing)?['"]/i);
      addResult('has-game-states', 'Game has proper state management (menu, playing, gameover)',
        !!hasGameStates,
        hasGameStates ? undefined : 'Could not find game state strings like "menu" and "playing" — the game may not have proper state management');
    }

    // Check for input handlers
    var scripts2 = document.querySelectorAll('script:not([data-appforge-test])');
    var allCode = '';
    scripts2.forEach(function(s) { allCode += s.textContent || ''; });
    var hasInput = allCode.includes('addEventListener') &&
      (allCode.includes('click') || allCode.includes('touchstart') || allCode.includes('mousedown') ||
       allCode.includes('pointerdown') || allCode.includes('keydown'));
    addResult('has-input-handlers', 'Event listeners for user input exist',
      hasInput,
      hasInput ? undefined : 'No click/touch/key event listeners found');

    // CHECK: Is the game already in game-over state before we even click?
    var initialState = detectGameOverState();
    addResult('not-gameover-on-load', 'Game is NOT in game-over state on initial load',
      !initialState.isGameOver,
      initialState.isGameOver ? 'CRITICAL: Game is showing game-over screen immediately on load! ' + initialState.evidence : undefined);

    setTimeout(phase2, 500);
  }

  // ═══ PHASE 2: Click test (1000ms after ready) ═══
  function phase2() {
    var canvases = document.querySelectorAll('canvas');
    var isCanvasApp = canvases.length > 0;
    var canvasBefore = null;

    captureScreenshot('menuScreen');

    if (isCanvasApp) {
      canvasBefore = sampleCanvas(canvases[0]);
      addResult('canvas-renders-initial', 'Canvas has visible content (title screen)',
        canvasBefore.nonTransparent > 5,
        canvasBefore.nonTransparent > 5 ? undefined :
          'Canvas appears blank (nonTransparent pixels: ' + canvasBefore.nonTransparent + ')');
    }

    clickPhaseStarted = true;

    // Try to click the start button
    var clicked = false;
    var clickTarget = '';

    // 1. DOM start button
    var startBtn = findStartButton();
    if (startBtn) {
      try {
        startBtn.click();
        clicked = true;
        clickTarget = 'DOM button: "' + (startBtn.textContent || '').trim().slice(0, 30) + '"';
      } catch(e) {
        jsErrorsAfterClick.push('Error clicking start button: ' + e.message);
      }
    }

    // 2. Canvas click/touch
    if (isCanvasApp) {
      var canvas = canvases[0];
      try {
        var rect = canvas.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;

        // Touch events
        try {
          canvas.dispatchEvent(new TouchEvent('touchstart', {
            bubbles: true, cancelable: true,
            touches: [new Touch({ identifier: 1, target: canvas, clientX: cx, clientY: cy })]
          }));
          canvas.dispatchEvent(new TouchEvent('touchend', {
            bubbles: true, cancelable: true,
            changedTouches: [new Touch({ identifier: 1, target: canvas, clientX: cx, clientY: cy })]
          }));
        } catch(te) {}

        // Mouse click
        canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
        canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
        canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));

        // Space key
        var spaceDown = new KeyboardEvent('keydown', { bubbles: true, key: ' ', code: 'Space', keyCode: 32 });
        document.dispatchEvent(spaceDown);
        canvas.dispatchEvent(spaceDown);

        clicked = true;
        clickTarget = clickTarget ? clickTarget + ' + canvas' : 'canvas (tap + click + space)';
      } catch(e) {
        jsErrorsAfterClick.push('Could not dispatch events: ' + e.message);
      }
    }

    // 3. Document click fallback
    try { document.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch(e) {}

    addResult('click-dispatched', 'Start interaction dispatched',
      clicked,
      clicked ? 'Clicked: ' + clickTarget : 'Could not find or click any start element');

    // Wait 1.5 seconds, then check if game actually started (not game-over)
    setTimeout(function() { phase3(canvasBefore, isCanvasApp); }, 1500);
  }

  // ═══ PHASE 3: Verify game is PLAYING, not game-over (2500ms after ready) ═══
  function phase3(canvasBefore, isCanvasApp) {
    captureScreenshot('gameplayScreen');

    addResult('no-js-errors-click', 'No JavaScript errors after start interaction',
      jsErrorsAfterClick.length === 0,
      jsErrorsAfterClick.length > 0 ? 'JS errors after click: ' + jsErrorsAfterClick.join('; ') : undefined);

    // CRITICAL CHECK: Is the start button still visible after clicking it?
    var startBtnStillVisible = findStartButton();
    if (startBtnStillVisible) {
      // Double-check it's actually visible (not just in DOM)
      var startStyle = window.getComputedStyle(startBtnStillVisible);
      var startStillShowing = startStyle.display !== 'none' && startStyle.visibility !== 'hidden' && startStyle.opacity !== '0';
      addResult('start-button-hidden', 'Start/menu buttons are hidden after starting',
        !startStillShowing,
        startStillShowing ?
          'CRITICAL BUG: The Start button ("' + (startBtnStillVisible.textContent || '').trim().slice(0, 30) + '") is STILL VISIBLE after clicking it. Menu buttons must be hidden/removed when transitioning to the playing state. Use startButton.style.display = "none" or remove the element from the DOM.' :
          undefined);
    }

    // Also check for other menu-only elements that should be hidden (Instructions, How to Play, etc.)
    var menuOnlyPatterns = /^(instructions|how to play|rules|tutorial|about|help|settings|options)$/i;
    var allButtons = document.querySelectorAll('button, [role="button"], a');
    var staleMenuButtons = [];
    for (var mi = 0; mi < allButtons.length; mi++) {
      var mbtn = allButtons[mi];
      var mtext = (mbtn.textContent || '').trim();
      var mstyle = window.getComputedStyle(mbtn);
      if (menuOnlyPatterns.test(mtext) && mstyle.display !== 'none' && mstyle.visibility !== 'hidden' && mstyle.opacity !== '0') {
        staleMenuButtons.push(mtext);
      }
    }
    if (staleMenuButtons.length > 0) {
      addResult('menu-buttons-hidden', 'Menu-only buttons are hidden after starting',
        false,
        'CRITICAL BUG: Menu buttons still visible during gameplay: "' + staleMenuButtons.join('", "') + '". These should be hidden when the game/app transitions from menu to playing state.');
    }

    // CRITICAL CHECK: Is the game in game-over state right after clicking start?
    var postClickState = detectGameOverState();
    addResult('not-gameover-after-start', 'Game is NOT in game-over state after clicking start',
      !postClickState.isGameOver,
      postClickState.isGameOver ?
        'CRITICAL BUG: Game jumped directly to game-over after clicking start! The game never entered a playable state. ' + postClickState.evidence +
        '. This usually means: (1) the game loop collision detection runs before the game starts, (2) the initial player position overlaps an obstacle, or (3) the state transitions are broken.' :
        undefined);

    // Check game state variable if accessible
    var stateVar = detectGameStateVariable();
    if (stateVar) {
      var isPlaying = /play(ing)?|active|running|started/i.test(stateVar.value);
      var isGameOver = /over|end|dead|lost|finished/i.test(stateVar.value);
      addResult('game-state-playing', 'Game state variable indicates playing state',
        isPlaying && !isGameOver,
        isPlaying && !isGameOver ? undefined :
          'Game state "' + stateVar.varName + '" = "' + stateVar.value + '" — expected "playing" or similar, got "' + stateVar.value + '"');
    }

    if (isCanvasApp && canvasBefore) {
      var canvases = document.querySelectorAll('canvas');
      if (canvases.length > 0) {
        var canvasAfter = sampleCanvas(canvases[0]);
        var changed = canvasAfter.hash !== canvasBefore.hash;
        var stillDrawn = canvasAfter.nonTransparent > 5;

        addResult('game-starts', 'Game state changes after start interaction',
          changed && stillDrawn,
          changed && stillDrawn ? undefined :
            !stillDrawn ? 'Canvas went blank after clicking' :
            'Canvas did NOT change after clicking start — start button is broken. Hash before: ' + canvasBefore.hash + ', after: ' + canvasAfter.hash);

        // Phase 4: Wait 1.5 more seconds and verify game is STILL playing
        setTimeout(function() { phase4(canvasAfter, canvases[0]); }, 1500);
      } else {
        finishTests();
      }
    } else {
      // DOM-BASED APP — run interactive element tests
      setTimeout(function() { phase4DOM(); }, 1500);
    }
  }

  // ═══ PHASE 4 (DOM apps): Click interactive elements and verify DOM changes ═══
  function phase4DOM() {
    // Snapshot the current DOM state
    var bodyBefore = (document.body ? document.body.innerHTML : '').length;
    var textBefore = (document.body ? (document.body.innerText || document.body.textContent || '') : '');
    var visibleElementsBefore = document.querySelectorAll('button, [role="button"], a, input, select, [onclick]').length;

    // Find all clickable elements that are NOT the start button
    var interactiveEls = [];
    var allClickable = document.querySelectorAll('button, [role="button"], a, [onclick], input[type="radio"], input[type="checkbox"], label, .option, .answer, .choice, [data-answer], [data-option], [data-choice]');
    for (var i = 0; i < allClickable.length; i++) {
      var el = allClickable[i];
      var style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      var text = (el.textContent || '').toLowerCase().trim();
      // Skip start/play buttons and navigation-only links
      if (text.match(/^(start|play|begin|tap to|click to|press to|go!?|launch|new game|play game)$/i)) continue;
      if (el.tagName === 'A' && el.getAttribute('href') === '#') continue;
      interactiveEls.push(el);
    }

    addResult('has-interactive-elements', 'App has interactive elements beyond start button',
      interactiveEls.length > 0,
      interactiveEls.length > 0 ? 'Found ' + interactiveEls.length + ' interactive elements' :
        'CRITICAL: No interactive elements found after starting the app. The app has no buttons, options, or clickable elements for the user to interact with.');

    if (interactiveEls.length === 0) {
      finishTests();
      return;
    }

    // Click the FIRST interactive element (e.g., first answer in a trivia game)
    var targetEl = interactiveEls[0];
    var targetText = (targetEl.textContent || '').trim().slice(0, 40);

    try {
      targetEl.click();
      // Also dispatch touch events for mobile
      try {
        var rect = targetEl.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
        targetEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy }));
      } catch(e) {}
    } catch(e) {
      jsErrorsAfterClick.push('Error clicking interactive element: ' + e.message);
    }

    // Wait 1 second and check if anything changed
    setTimeout(function() {
      var textAfter = (document.body ? (document.body.innerText || document.body.textContent || '') : '');
      var bodyAfter = (document.body ? document.body.innerHTML : '').length;
      var visibleElementsAfter = document.querySelectorAll('button, [role="button"], a, input, select, [onclick]').length;

      // Check if DOM changed after clicking
      var textChanged = textAfter !== textBefore;
      var structureChanged = Math.abs(bodyAfter - bodyBefore) > 10;
      var elementsChanged = visibleElementsAfter !== visibleElementsBefore;
      var somethingChanged = textChanged || structureChanged || elementsChanged;

      addResult('interaction-causes-change', 'Clicking interactive element "' + targetText + '" causes visible change',
        somethingChanged,
        somethingChanged ? undefined :
          'CRITICAL: Clicking "' + targetText + '" did NOT change anything in the DOM. The click handler may be broken, missing, or not connected. Text length before: ' + textBefore.length + ', after: ' + textAfter.length);

      // Check for JS errors after interactive click
      addResult('no-js-errors-interaction', 'No JavaScript errors after interacting with app elements',
        jsErrorsAfterClick.length === 0,
        jsErrorsAfterClick.length > 0 ? 'JS errors after interaction: ' + jsErrorsAfterClick.join('; ') : undefined);

      // If there are multiple options (like a trivia game), try clicking a second one
      if (interactiveEls.length > 1 && somethingChanged) {
        // Re-scan for interactive elements (DOM may have changed)
        var freshEls = document.querySelectorAll('button:not([disabled]), [role="button"], .option, .answer, .choice, [data-answer], [data-option]');
        var visibleFreshEls = [];
        for (var j = 0; j < freshEls.length; j++) {
          var fel = freshEls[j];
          var fstyle = window.getComputedStyle(fel);
          if (fstyle.display !== 'none' && fstyle.visibility !== 'hidden' && fstyle.opacity !== '0') {
            visibleFreshEls.push(fel);
          }
        }

        addResult('app-continues-after-interaction', 'App presents new content or options after first interaction',
          visibleFreshEls.length > 0,
          visibleFreshEls.length > 0 ? 'Found ' + visibleFreshEls.length + ' interactive elements after first interaction' :
            'No interactive elements found after first interaction — app may be stuck or frozen');
      }

      captureScreenshot('gameplayScreen');
      finishTests();
    }, 1000);
  }

  // ═══ PHASE 4: Verify game STAYS in playing state (4000ms after ready) ═══
  function phase4(canvasAfterStart, canvas) {
    var canvasNow = sampleCanvas(canvas);
    var animating = canvasNow.hash !== canvasAfterStart.hash;
    addResult('game-animating', 'Game animation is still running',
      animating,
      animating ? undefined : 'Canvas stopped changing — game loop may have stopped');

    // Final game-over check: make sure game didn't die in the 1.5 seconds since phase 3
    var finalState = detectGameOverState();
    addResult('game-still-playing', 'Game is still in playing state after 1.5 seconds of gameplay',
      !finalState.isGameOver,
      finalState.isGameOver ?
        'Game died within 1.5 seconds of starting! This is too fast, especially for kids. ' + finalState.evidence +
        '. The difficulty is too high, or an obstacle spawns immediately on top of the player.' :
        undefined);

    finishTests();
  }

  function finishTests() {
    var allErrors = jsErrors.concat(jsErrorsAfterClick);
    var allPass = results.every(function(r) { return r.status === 'pass'; });
    var failCount = results.filter(function(r) { return r.status === 'fail'; }).length;

    var report = {
      results: results,
      jsErrors: allErrors,
      overallPass: allPass,
      summary: allPass
        ? 'All ' + results.length + ' runtime tests passed'
        : failCount + ' of ' + results.length + ' tests failed',
      screenshots: screenshots
    };

    try {
      window.parent.postMessage({ type: 'appforge-test-results', report: report }, '*');
    } catch(e) {
      window.__appforgeTestReport = report;
    }
  }

  // Start tests after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(phase1, 500);
    });
  } else {
    setTimeout(phase1, 500);
  }
})();
</script>`;
}

/**
 * Inject test harness into HTML and run in a hidden iframe.
 * Returns runtime test results.
 */
export function runRuntimeTests(html: string, timeoutMs = 10000): Promise<RuntimeTestReport> {
  return new Promise((resolve) => {
    let testHtml: string;
    const testScript = getTestScript();

    if (html.includes('</body>')) {
      testHtml = html.replace('</body>', testScript + '</body>');
    } else if (html.includes('</html>')) {
      testHtml = html.replace('</html>', testScript + '</html>');
    } else {
      testHtml = html + testScript;
    }

    // Create hidden iframe — needs real dimensions for canvas to render
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:375px;height:667px;border:none;opacity:0;pointer-events:none;';
    iframe.sandbox.add('allow-scripts');

    let resolved = false;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'appforge-test-results' && !resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        cleanup();
        resolve(event.data.report as RuntimeTestReport);
      }
    };
    window.addEventListener('message', handler);

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        cleanup();
        resolve({
          results: [{
            id: 'timeout',
            name: 'App completes test run within timeout',
            status: 'fail',
            reason: `Tests did not complete within ${timeoutMs / 1000}s — app may have crashed, entered an infinite loop, or blocked the main thread`,
          }],
          jsErrors: [],
          overallPass: false,
          summary: 'Tests timed out',
          screenshots: {},
        });
      }
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 200);
    }

    const blob = new Blob([testHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    iframe.src = url;

    iframe.addEventListener('load', () => {
      URL.revokeObjectURL(url);
    });

    iframe.addEventListener('error', () => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', handler);
        cleanup();
        resolve({
          results: [{
            id: 'load-error',
            name: 'App loads without error',
            status: 'fail',
            reason: 'Iframe failed to load the generated HTML',
          }],
          jsErrors: [],
          overallPass: false,
          summary: 'App failed to load',
          screenshots: {},
        });
      }
    });

    document.body.appendChild(iframe);
  });
}
