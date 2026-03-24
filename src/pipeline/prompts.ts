import type { AppSpec, ClarificationAnswer } from '../types/index.js';

export const SYSTEM_PROMPT = `You are AppForge, a world-class product designer, game developer, and full-stack engineer. You create stunning, fully functional, self-contained HTML applications — including games, tools, interactive experiences, and utilities.

You are known for creating BEAUTIFUL procedural graphics using Canvas 2D. Your games look hand-crafted, with detailed characters, lush environments, and juicy animations. You NEVER draw plain rectangles or circles as characters — you always create detailed, appealing sprites using combinations of Canvas shapes, gradients, arcs, bezier curves, and layered drawing calls.

CORE PRINCIPLES:
- Every app you create must be a SINGLE HTML file with embedded CSS and JavaScript
- Mobile-first: touch controls, responsive layout, large tap targets (44px minimum)
- You write production-quality code — clean, well-structured, bug-free
- You handle edge cases, empty states, loading states, and error recovery
- Your apps feel native — smooth animations, haptic-like feedback, polished UI

FOR GAMES & INTERACTIVE APPS:
- Use HTML5 Canvas for any game that involves movement, physics, or animation
- Implement a proper game loop using requestAnimationFrame with delta-time for consistent speed
- Handle both touch AND mouse/keyboard input
- CRITICAL: Use a gameState variable ('menu' | 'playing' | 'gameover') and check it at the TOP of every game loop iteration. Only run physics, obstacles, and collision detection when gameState === 'playing'. Start the game in 'menu' state. Do NOT populate obstacles until the user starts the game. Add a 2-second grace period after start where collisions are skipped.
- Add score tracking, particle effects, and juicy feedback (screen shake, flash effects, bounce animations)
- Ensure consistent 60fps performance
- Create DETAILED procedural sprites — not boxes/circles. Use multiple Canvas drawing calls per sprite.

FOR UTILITY & FORM-BASED APPS:
- Use semantic HTML with modern CSS (flexbox, grid, custom properties)
- Implement smooth screen transitions (slide, fade)
- Handle form validation with helpful inline errors
- Store app state in JavaScript (no localStorage in sandboxed iframe)

PROCEDURAL GRAPHICS MASTERY:
When drawing characters, objects, and environments on Canvas, you ALWAYS use:
- Multiple layered shapes to build detailed sprites (body + head + eyes + ears + limbs)
- ctx.beginPath() + arcs + bezierCurveTo for organic, rounded shapes
- Linear and radial gradients for depth and lighting
- Shadow effects (ctx.shadowColor, ctx.shadowBlur) for glow and depth
- Sprite animation by varying drawing parameters per frame (bobbing, squash-and-stretch)
- Parallax scrolling backgrounds with multiple layers (far mountains, mid-ground hills, near ground)
- Particle systems for dust, sparkles, explosions, and trail effects

Example of GOOD character drawing (a bunny):
- Body: rounded ellipse with gradient (light on top, darker below)
- Head: circle with slight overlap on body
- Ears: two elongated ellipses with pink inner fills
- Eyes: white circles with black pupils that look in movement direction
- Nose: small pink triangle
- Cheeks: semi-transparent pink circles
- Tail: small white fluffy circle
- Legs: small rounded rectangles that animate while running

Example of GOOD tree/obstacle drawing:
- Trunk: tapered rectangle with bark texture (brown gradient + darker vertical lines)
- Canopy: multiple overlapping circles/ellipses with green gradient
- Leaves: scattered small shapes at the edges
- Shadow on the ground: semi-transparent dark ellipse
- Slight sway animation in wind

OUTPUT FORMAT:
- Always output ONLY the complete HTML. No markdown fences. No explanation.
- Start with <!DOCTYPE html> and end with </html>
- The entire app must work in a sandboxed iframe with NO network access`;

export function clarificationPrompt(userPrompt: string): string {
  return `The user wants to build this app:
"${userPrompt}"

Generate 3-5 clarifying multiple-choice questions that will help you build a better, more personalized app. Each question should have 3-4 options.

Focus on:
- Core gameplay mechanics or feature behavior that could go multiple ways
- Visual style and tone (minimal, colorful, dark, retro pixel, cartoon, etc.)
- Target audience specifics (kids, adults, professionals)
- Difficulty level or complexity preferences
- Any data, content, or theme that would personalize the app

Return ONLY valid JSON in this format:
{
  "questions": [
    {
      "question": "What visual style fits your app best?",
      "options": ["Clean & minimal", "Colorful & playful", "Dark & sleek", "Retro pixel art"]
    }
  ]
}`;
}

export function planningPrompt(
  userPrompt: string,
  clarifications: ClarificationAnswer[]
): string {
  const clarificationText =
    clarifications.length > 0
      ? clarifications.map((c) => `Q: ${c.question}\nA: ${c.answer}`).join('\n\n')
      : 'No additional clarifications provided.';

  return `Based on this brief, create a complete app specification.

APP DESCRIPTION:
"${userPrompt}"

USER PREFERENCES:
${clarificationText}

First, determine the APP TYPE:
- "game" for games, interactive toys, simulations
- "tool" for utilities, calculators, productivity apps
- "content" for readers, galleries, reference apps
- "form" for data entry, surveys, wizards

Then create a detailed specification:

1. App name and icon (use an emoji)
2. App type classification
3. Target audience and difficulty level (if game: easy/medium/hard — pay close attention to user preferences about kids, casual, etc.)
4. For GAMES: describe in thorough detail:
   - Game mechanics, physics, controls
   - Player character appearance (describe EXACTLY how to draw it with Canvas shapes — body parts, colors, proportions)
   - Obstacle/enemy appearance (describe EXACTLY how to draw each one)
   - Background/environment appearance (layers, colors, elements)
   - Particle effects and animations
   - Scoring and difficulty progression
   - Win/lose conditions
   - Difficulty tuning parameters (speeds, gaps, timings) appropriate for the target audience
5. For ALL APPS: describe every screen/state (id, name, purpose, key components, interactions)
6. User flows (navigation between screens/states)
7. Design system (color palette as hex values, typography, spacing, border radius, style)
8. Key implementation notes (canvas vs DOM, animation approach, input handling)
9. Test cases (functional tests with id, type, description, steps, expected result)

IMPORTANT FOR KID-FRIENDLY GAMES:
- If the target audience is children, set very forgiving difficulty: slow speeds, wide gaps, generous hitboxes
- Use bright, cheerful colors and cute character designs
- Make controls simple (single tap)
- Add encouraging feedback (stars, sparkles, happy sounds)
- Start very easy and ramp up slowly

Return ONLY valid JSON matching this schema:
{
  "name": "App Name",
  "icon": "emoji",
  "appType": "game|tool|content|form",
  "targetAudience": "description of who this is for",
  "difficulty": "easy|medium|hard (for games)",
  "gameMechanics": "extremely detailed description of mechanics, physics, controls, scoring, difficulty parameters if game type, otherwise null",
  "characterDesign": "detailed Canvas 2D drawing instructions for the main character — every shape, color, gradient, proportion",
  "obstacleDesign": "detailed Canvas 2D drawing instructions for obstacles/enemies — every shape, color, gradient",
  "environmentDesign": "detailed description of background layers, colors, decorative elements, parallax scrolling",
  "screens": [{ "id": "string", "name": "string", "purpose": "string", "wireframe": "string", "components": ["string"], "interactions": ["string"] }],
  "flows": [{ "id": "string", "name": "string", "steps": ["string"], "fromScreen": "string", "toScreen": "string" }],
  "designSystem": {
    "colorPalette": { "primary": "#hex", "secondary": "#hex", "background": "#hex", "surface": "#hex", "text": "#hex", "textMuted": "#hex", "accent": "#hex", "error": "#hex", "success": "#hex" },
    "typography": { "heading": "font-family", "body": "font-family" },
    "spacing": "description",
    "borderRadius": "value",
    "style": "minimal|playful|corporate|dark|elegant|retro|cartoon"
  },
  "implementationNotes": "key technical approach — canvas vs DOM, animation strategy, input handling, difficulty tuning values, etc.",
  "testCases": [{ "id": "string", "type": "ui|functional|regression", "description": "string", "steps": ["string"], "expected": "string", "status": "pending" }]
}`;
}

export function codingPrompt(userPrompt: string, _spec: AppSpec, planJson: string): string {
  return `Generate a COMPLETE, polished, self-contained HTML application.

ORIGINAL USER REQUEST:
"${userPrompt}"

APP PLAN (follow this CLOSELY — especially character designs, difficulty settings, and visual descriptions):
${planJson}

ABSOLUTE REQUIREMENTS:
1. Single HTML file — all CSS in <style>, all JS in <script>
2. Must work in a sandboxed iframe (no localStorage, no sessionStorage, no fetch, no external resources)
3. ALL graphics must be created programmatically using Canvas 2D
4. Must handle both touch AND mouse/keyboard input
5. Mobile-first but works on desktop too
6. Include proper <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">

FOR GAMES — GRAPHICS (THIS IS CRITICAL):
Do NOT draw characters or objects as simple rectangles or circles. Every sprite must be drawn with MULTIPLE Canvas calls to look detailed and appealing:

CHARACTER DRAWING: Create a dedicated drawCharacter(ctx, x, y, size, frame) function that draws the character using:
- Multiple overlapping shapes for body parts (body, head, limbs, ears, tail, etc.)
- ctx.fillStyle with gradients (createLinearGradient / createRadialGradient) for depth
- ctx.beginPath() + arc() + bezierCurveTo() for organic rounded shapes
- Small details: eyes with pupils, nose, mouth, blush marks, accessories
- Frame-based animation: squash & stretch, bobbing, leg movement
- The character should be CUTE and APPEALING, especially if for kids

OBSTACLE DRAWING: Create a dedicated drawObstacle(ctx, x, y, width, height, type) function that draws with:
- Realistic or stylized shapes (not rectangles!) — trees with trunks and canopies, rocks with irregular shapes, etc.
- Gradients and shadow for 3D effect
- Small decorative details (leaves, bark texture, moss)
- Variety: at least 2-3 visual variations

BACKGROUND/ENVIRONMENT:
- Draw a multi-layer parallax scrolling background
- Far layer: sky gradient with clouds (slowly moving)
- Mid layer: hills or mountains with gradient fills
- Near layer: ground with grass/texture detail
- Add small decorative elements: flowers, butterflies, birds in background
- Use subtle color palette matching the design system

PARTICLE EFFECTS:
- Create a particle system for: dust/trail behind character, sparkle on score, burst on collision
- Each particle: position, velocity, life, size, color, alpha
- Update and draw in the game loop

FOR GAMES — STATE MACHINE (THIS IS CRITICAL — MOST BUGS COME FROM GETTING THIS WRONG):
Your game MUST have a state variable: let gameState = 'menu';  // 'menu' | 'playing' | 'gameover'
The state machine MUST follow these EXACT rules:

1. On page load: gameState = 'menu'. Show title screen. Do NOT spawn any obstacles yet. Do NOT run collision detection.
2. The game loop MUST check gameState before doing ANYTHING:
   function gameLoop(timestamp) {
     requestAnimationFrame(gameLoop);
     if (gameState === 'menu') { drawMenuScreen(); return; }
     if (gameState === 'gameover') { drawGameOverScreen(); return; }
     // ONLY update physics, move obstacles, check collisions when gameState === 'playing'
     updateGame(dt);
     checkCollisions();
     drawGame();
   }
3. Click/tap handler: if (gameState === 'menu') { startGame(); } else if (gameState === 'playing') { playerJump(); } else if (gameState === 'gameover') { resetGame(); }
4. startGame() MUST: set gameState = 'playing', reset score to 0, reset player position, CLEAR all obstacles arrays, set a 2-second grace period before spawning first obstacle
5. checkCollisions() MUST: ONLY run when gameState === 'playing'. Use forgiving hitboxes (60% of visual size).
6. gameOver() MUST: set gameState = 'gameover', show game-over UI
7. resetGame() MUST: set gameState = 'menu' (NOT 'playing'), let the user see the menu and click to start again

COMMON BUGS TO AVOID:
- DO NOT spawn obstacles in the initial game setup — only start spawning AFTER startGame() is called
- DO NOT check collisions when gameState !== 'playing'
- DO NOT set gameState = 'playing' on page load
- DO NOT have obstacles array pre-populated before the game starts
- Add a grace period: after startGame(), skip collision detection for the first 2 seconds (or until first obstacle is fully on screen)

CRITICAL — NEVER BLOCK THE MAIN THREAD:
- NEVER use while/for loops that wait for a condition (e.g., while(!answered){}) — this freezes the ENTIRE PAGE
- NEVER use synchronous XMLHttpRequest or alert/confirm/prompt during gameplay
- NEVER use busy-wait loops or polling loops — these will lock up the browser completely
- ALL waiting MUST use setTimeout, setInterval, requestAnimationFrame, or event listeners
- ALL user interaction MUST be handled via event listeners (onclick, addEventListener), NEVER via polling
- If you need to delay, use setTimeout(() => { ... }, delay) — NEVER a spin loop

FOR GAMES — GENERAL MECHANICS:
- Use requestAnimationFrame with delta-time (const dt = (timestamp - lastTime) / 1000)
- Title screen: show character, game name, "Tap to Start" or "Press Space", brief controls hint
- Gameplay: smooth physics, responsive controls, proper collision using bounding boxes (slightly smaller than visual for forgiving feel)
- Game over: show score, best score, "Tap to Restart" option, character reaction animation
- Score display: large, readable, with subtle animation on increment

FOR GAMES — DIFFICULTY & TARGET AUDIENCE:
- Read the plan's difficulty and targetAudience fields CAREFULLY
- For kids/easy: MODERATE speeds (75-80% of normal — slow enough to react but fast enough to be fun), WIDE gaps (1.5x character size), GENEROUS collision boxes (shrink hitbox to 65% of visual), gentle gravity, simple controls. The game should feel FUN not boring — kids still want action!
- For medium: standard speeds, reasonable gaps, standard hitboxes
- For hard: fast speeds, tight gaps, precise hitboxes
- Always start easy and ramp up GRADUALLY (increase difficulty every 10+ points for easy, every 5 for medium)
- IMPORTANT: obstacles must scroll at a visible, satisfying speed. If obstacles take more than 3 seconds to cross the screen, they're TOO SLOW.

FOR GAMES — SOUND:
- Use Web Audio API for simple sound effects
- Create a playSound(type) function with AudioContext + OscillatorNode + GainNode
- Sound types: jump (rising pitch), score (cheerful ding), hit (low thud), button (click)
- Keep sounds short and pleasant, especially for kids

FOR TRIVIA, QUIZ, AND QUESTION-BASED APPS (THIS IS CRITICAL):
These apps MUST follow this exact pattern — most bugs in trivia/quiz apps come from broken navigation between questions:

1. DATA STRUCTURE: Store all questions in an array at the top of your script:
   const questions = [
     { question: "...", options: ["A", "B", "C", "D"], correct: 0 },
     ...
   ];
   let currentQuestion = 0;
   let score = 0;
   let gameState = 'menu'; // 'menu' | 'playing' | 'result'

2. SCREEN RENDERING: Create a single render() function that reads gameState and draws the appropriate screen:
   function render() {
     const container = document.getElementById('app');
     if (gameState === 'menu') { renderMenu(container); return; }
     if (gameState === 'result') { renderResult(container); return; }
     renderQuestion(container);
   }

3. QUESTION RENDERING (renderQuestion):
   - Clear the container, then create fresh DOM elements for the current question
   - Show question number ("Question 3 of 10") and score
   - Show the question text
   - Create CLICKABLE BUTTONS for each option — EACH button MUST have an onclick/addEventListener that calls selectAnswer(index)
   - CRITICAL: Attach event listeners INSIDE renderQuestion(), NOT in a separate setup function. Every time you render a new question, create new buttons with new listeners.
   - Style the selected answer with visual feedback (green for correct, red for wrong)

4. ANSWER HANDLING (selectAnswer):
   function selectAnswer(selectedIndex) {
     // Prevent double-clicks
     if (answered) return;
     answered = true;
     // Show correct/wrong feedback
     const isCorrect = selectedIndex === questions[currentQuestion].correct;
     if (isCorrect) score++;
     // Highlight correct answer green, wrong answer red
     // After a short delay (1-1.5s), advance to next question
     setTimeout(() => {
       currentQuestion++;
       answered = false;
       if (currentQuestion >= questions.length) {
         gameState = 'result';
       }
       render();
     }, 1200);
   }

5. COMMON TRIVIA BUGS TO AVOID:
   - DO NOT use innerHTML with onclick="..." strings — use addEventListener or assign onclick as a function
   - DO NOT declare event listeners once at startup and expect them to work after DOM is replaced — re-attach listeners every render
   - DO NOT forget to increment currentQuestion — this causes the same question to repeat forever
   - DO NOT use event delegation without proper target checking — clicks may not reach the right handler
   - Make sure each option button is a real <button> element with display:block or inline-block, min-height 44px
   - Test that clicking ANY option (not just the first) triggers the handler
   - NEVER use a while loop to wait for the user's answer — use event listeners and callbacks
   - NEVER block the main thread — all transitions between questions must use setTimeout or event-driven flow

FOR UTILITY APPS (if applicable):
- Use DOM with modern CSS (flexbox, grid, custom properties, transitions)
- Implement smooth screen transitions
- Large touch targets (44px+), no hover-only interactions
- Handle all form validation inline

EMOJI AND ICONS:
- ALWAYS use actual Unicode emoji characters (🚀, ⭐, 🎮, etc.) — NEVER use HTML entities like &#128640; or &#9733;
- HTML numeric entities render as literal text in many contexts. Always paste the real emoji character.

SCREEN TRANSITIONS — HIDE PREVIOUS UI (THIS IS CRITICAL):
When transitioning between screens/states (menu → playing, playing → gameover, etc.), you MUST completely remove or hide the previous screen's elements:
- If using DOM: either clear the container's innerHTML and rebuild, OR set display='none' on the old screen and display='block' on the new one
- If using Canvas with DOM overlays: the menu buttons (Start, Instructions, etc.) MUST be set to display='none' or removed from DOM when gameState changes to 'playing'
- NEVER leave menu buttons visible during gameplay — this is the #1 most reported bug
- Pattern: create a showScreen(screenName) function that hides ALL screen containers, then shows only the requested one
- If you use a Start button as a DOM element overlaying a canvas, add: startButton.style.display = 'none' in startGame()
- Same for any Instructions, How to Play, or other menu-only elements

QUALITY BAR:
- The app should feel COMPLETE and POLISHED — like a finished product, not a prototype
- Smooth 60fps animation throughout
- Canvas should resize properly on window resize
- Handle rapid input gracefully (debounce taps if needed)
- Code should be clean, well-organized with clear function names

OUTPUT: Return ONLY the complete HTML. Start with <!DOCTYPE html> and end with </html>.
No markdown code fences. No explanation before or after the code.`;
}

/**
 * Prompt for LLM self-review of generated code BEFORE runtime tests.
 * Catches logic bugs that runtime tests can't easily detect.
 */
export function codeReviewPrompt(code: string, userPrompt: string): string {
  const codePreview = code.length > 30000 ? code.slice(0, 15000) + '\n\n... [middle truncated] ...\n\n' + code.slice(-15000) : code;

  return `You are a senior code reviewer. Review this generated HTML app for CRITICAL BUGS that would make it non-functional.

USER REQUEST: "${userPrompt}"

CODE:
\`\`\`html
${codePreview}
\`\`\`

Check for these SPECIFIC bug categories:

1. DEAD EVENT HANDLERS:
   - Are onclick/addEventListener callbacks actually connected to the right elements?
   - If innerHTML is used to render content, are event listeners re-attached after each render? (innerHTML destroys old listeners!)
   - Are there functions defined but never called?
   - Are event listeners added to elements that don't exist yet at the time addEventListener runs?

2. BROKEN STATE TRANSITIONS:
   - For quiz/trivia apps: does clicking an answer advance to the next question? Is currentQuestion incremented?
   - For games: does the state machine transition correctly (menu → playing → gameover)?
   - Are there missing render() calls after state changes?
   - Does the app re-render/update the DOM after state changes?

3. MISSING FUNCTIONALITY:
   - Does the app actually implement what the user asked for?
   - For trivia: are there actual questions with options? Do options respond to clicks?
   - For games: can the user actually play, or does it just show a title screen?
   - For tools: do the core features work (calculations, conversions, etc.)?

4. JAVASCRIPT ERRORS:
   - Undefined variable references
   - Missing function definitions
   - Calling methods on null/undefined
   - Typos in variable names

5. MAIN THREAD BLOCKING (CRITICAL — causes entire page to freeze):
   - while/for loops that wait for user input or a condition to change (e.g., while(!answered), while(gameState === 'playing'))
   - Synchronous busy-wait patterns
   - Infinite loops without exit conditions
   - Very tight setInterval (< 10ms)
   - Any loop that doesn't yield to the event loop

6. DOM/RENDERING BUGS:
   - Elements created but never appended to the document
   - display:none without any code to show them
   - z-index issues hiding interactive elements
   - Buttons with no visible text or too-small tap targets

Return ONLY valid JSON:
{
  "bugs": [
    {
      "severity": "critical" | "major" | "minor",
      "category": "dead-handler" | "broken-transition" | "missing-feature" | "js-error" | "dom-bug",
      "description": "Specific description of the bug",
      "fix": "Exact fix needed — reference specific function names and line locations"
    }
  ],
  "hasCriticalBugs": true/false,
  "summary": "Brief overall assessment"
}

Only flag REAL bugs — not style preferences. Focus on things that would make the app NOT WORK.`;
}

export function testingPrompt(code: string, spec: AppSpec): string {
  const codePreview = code.length > 30000 ? code.slice(0, 15000) + '\n\n... [middle truncated] ...\n\n' + code.slice(-15000) : code;

  return `Review this generated HTML app code against the test cases.

CODE:
\`\`\`html
${codePreview}
\`\`\`

TEST CASES:
${JSON.stringify(spec.testCases, null, 2)}

For each test case, carefully evaluate whether the code correctly implements it.
Check for:
- All required UI elements/game entities exist in the code
- Character drawing uses multiple Canvas calls (NOT just a single fillRect or arc) — for canvas games
- Navigation/state transitions work correctly
- User interactions (touch, click, keyboard) are properly handled
- Game mechanics are properly implemented (physics, collision, scoring) — for games
- Difficulty is appropriate for the target audience
- Background has multiple layers (not just a solid color) — for canvas games
- Particle effects are implemented — for canvas games
- Sound effects are implemented — for games
- Edge cases are covered
- No obvious JavaScript errors (undefined variables, missing functions)
- For trivia/quiz apps: all answer buttons have working click handlers, clicking an answer advances to next question, score is tracked
- For DOM-based apps: event listeners are properly attached (not lost to innerHTML replacement), state changes trigger re-renders

Return ONLY valid JSON:
{
  "results": [
    {
      "id": "test-case-id",
      "status": "pass" or "fail",
      "reason": "specific explanation if failed — reference exact code issue"
    }
  ],
  "overallPass": true/false,
  "summary": "brief overall assessment"
}`;
}

export function iterationPrompt(
  code: string,
  failures: { id: string; reason: string }[],
  spec: AppSpec
): string {
  return `Fix the following issues in this HTML app. Return the COMPLETE corrected HTML file.

CURRENT CODE:
\`\`\`html
${code}
\`\`\`

RUNTIME TEST FAILURES (these are REAL errors from actually running the code in a browser, not guesses):
${failures.map((f) => `- ${f.id}: ${f.reason}`).join('\n')}

DESIGN SYSTEM (for reference):
${JSON.stringify(spec.designSystem, null, 2)}

IMPORTANT — these are ACTUAL runtime failures detected by executing your code in a real browser:
- If there are JavaScript errors, they are REAL errors that crashed the app — find and fix the exact bug
- If "Canvas appears blank", your drawing code is not executing — check that the game loop starts and draw calls happen
- If "No click/touch handlers found", you forgot to add event listeners — add them
- If "start button doesn't work", the click handler is broken or the game state transition is wrong
- If "Game is in game-over state on load" or "Game jumped to game-over after clicking start":
  THIS IS THE MOST COMMON BUG. It means your game state machine is broken. Fix it by:
  1. Make sure gameState starts as 'menu', NOT 'playing' or 'gameover'
  2. Do NOT pre-populate the obstacles array — start with an empty array
  3. Only run collision detection when gameState === 'playing' (add: if (gameState !== 'playing') return; at the top of your collision check function)
  4. Add a 2-second grace period after starting: set a graceTimer variable in startGame(), and skip collisions while graceTimer > 0
  5. In the game loop, RETURN EARLY if gameState is not 'playing' — do not update physics or check collisions
  6. Make sure the first obstacle spawns at least 1 screen-width away from the player
- If "Game died within 1.5 seconds": the difficulty is way too high. Reduce obstacle speed by 50%, increase gaps between obstacles by 2x, shrink hitboxes to 50% of visual size.
- If "Game has no state management": add a proper gameState variable with 'menu', 'playing', 'gameover' states.
- If "Start/menu buttons are hidden after starting" FAILS: the start button and/or other menu elements (Instructions, How to Play) are still visible during gameplay. Fix by adding startButton.style.display = 'none' (and similar for other menu elements) inside the startGame() function or when transitioning from menu to playing state. If using a screen-based approach, hide the entire menu container.
- If "Menu-only buttons are hidden after starting" FAILS: same fix — hide all menu-only buttons when game state changes to 'playing'.
- If "No interactive elements found after starting": the app rendered a start screen but has no clickable options/buttons for actual gameplay. Add proper interactive elements (answer buttons, option cards, action buttons) with working click handlers.
- If "Clicking element did NOT change anything": the click handlers are broken. The most common cause is using innerHTML to render new content, which destroys event listeners. Fix by either: (a) using addEventListener inside the render function that creates the elements, or (b) using event delegation on a parent container, or (c) assigning onclick directly to created elements.
- If "No interactive elements found after first interaction": the app got stuck after the first interaction. Make sure state advances and new content is rendered (e.g., next question in a quiz, next screen in a flow).
- Fix ALL listed issues thoroughly — don't just add workarounds
- Keep everything else working — don't break existing functionality

Return ONLY the complete HTML. Start with <!DOCTYPE html> and end with </html>.
No markdown fences. No explanation.`;
}

/**
 * Prompt for visual quality review using screenshots from the running game/app.
 * Sent with screenshot images to get LLM feedback on visual quality.
 */
export function visualReviewPrompt(
  userPrompt: string,
  hasMenuScreen: boolean,
  hasGameplayScreen: boolean
): string {
  const screenshotLabels: string[] = [];
  if (hasMenuScreen) screenshotLabels.push('1. The MENU / TITLE screen (before any interaction)');
  if (hasGameplayScreen) screenshotLabels.push(`${hasMenuScreen ? '2' : '1'}. The GAMEPLAY screen (after starting the game/app)`);

  return `You are reviewing screenshots from a generated web app/game. The user asked for:
"${userPrompt}"

You are looking at ${screenshotLabels.length} screenshot(s):
${screenshotLabels.join('\n')}

Evaluate the VISUAL QUALITY of the app. Score each category 1-10 and identify specific issues:

1. CHARACTER/SPRITE QUALITY: Are characters drawn with detail (multiple shapes, gradients, eyes, limbs) or are they just basic rectangles/circles?
2. ENVIRONMENT/BACKGROUND: Is there a multi-layer background (sky, hills, ground) or just a flat color? Are there decorative elements?
3. UI/TEXT QUALITY: Is the title screen attractive? Is text readable? Are scores/buttons well-positioned?
4. OVERALL POLISH: Particle effects? Smooth gradients? Shadows? Does it look like a finished game or a prototype?
5. MATCH TO REQUEST: Does it visually match what the user asked for?

Return ONLY valid JSON:
{
  "scores": {
    "characterQuality": { "score": 1-10, "issue": "specific description of what's wrong or null if good" },
    "environmentQuality": { "score": 1-10, "issue": "specific description or null" },
    "uiQuality": { "score": 1-10, "issue": "specific description or null" },
    "overallPolish": { "score": 1-10, "issue": "specific description or null" },
    "matchToRequest": { "score": 1-10, "issue": "specific description or null" }
  },
  "averageScore": 1-10,
  "needsImprovement": true/false,
  "improvements": ["specific actionable improvement 1", "specific actionable improvement 2", ...],
  "summary": "brief overall visual quality assessment"
}

Set needsImprovement=true if averageScore < 7 or if any single category scores below 5.`;
}

/**
 * Prompt to fix visual quality issues identified by screenshot review.
 */
export function visualFixPrompt(
  code: string,
  visualFeedback: {
    scores: Record<string, { score: number; issue: string | null }>;
    improvements: string[];
    summary: string;
  }
): string {
  const improvementsList = visualFeedback.improvements.map((imp, i) => `${i + 1}. ${imp}`).join('\n');
  const scoresList = Object.entries(visualFeedback.scores)
    .map(([cat, val]) => `- ${cat}: ${val.score}/10${val.issue ? ` — ${val.issue}` : ''}`)
    .join('\n');

  return `Fix the VISUAL QUALITY of this HTML app based on screenshots taken from the running app.

A visual quality review found these scores:
${scoresList}

Overall: ${visualFeedback.summary}

SPECIFIC IMPROVEMENTS NEEDED:
${improvementsList}

CURRENT CODE:
\`\`\`html
${code}
\`\`\`

IMPORTANT:
- Focus on VISUAL improvements — make characters more detailed, backgrounds more layered, effects more polished
- For characters: add more Canvas drawing calls — eyes with pupils, body with gradient, limbs, accessories
- For backgrounds: add parallax layers, clouds, decorative elements, gradient skies
- For UI: improve title screen layout, score display, game-over screen
- For polish: add particle effects, smooth transitions, shadows, glow effects
- Do NOT break any existing gameplay/interaction logic — only improve visuals
- Keep ALL event handlers, game states, and mechanics working exactly as before

Return the COMPLETE updated HTML. Start with <!DOCTYPE html> and end with </html>.
No markdown fences. No explanation.`;
}

export function refinementPrompt(
  existingCode: string,
  originalPrompt: string,
  editInstructions: string,
  spec?: AppSpec
): string {
  return `You are improving an existing HTML app. The user wants changes but wants to keep the core app working.

ORIGINAL REQUEST: "${originalPrompt}"

USER'S EDIT REQUEST: "${editInstructions}"

EXISTING CODE:
\`\`\`html
${existingCode}
\`\`\`

${spec ? `DESIGN SYSTEM (for reference):\n${JSON.stringify(spec.designSystem, null, 2)}` : ''}

YOUR TASK:
- Apply the user's requested changes to the existing code
- Keep everything that already works — DO NOT break existing functionality
- Maintain the same visual style and quality level unless the user specifically asks to change it
- If the user asks for visual improvements, make the graphics MORE detailed, not less
- If the user asks for difficulty changes, adjust the specific parameters (speeds, gaps, hitboxes)
- If the user asks for new features, integrate them cleanly into the existing code structure

Return the COMPLETE updated HTML file. Start with <!DOCTYPE html> and end with </html>.
No markdown fences. No explanation.`;
}
