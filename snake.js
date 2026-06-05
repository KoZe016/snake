(function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────────────
    const GRID_SIZE = 20;
    const CELL_SIZE = 500 / GRID_SIZE; // 25 px
    const BASE_SPEED = 9;          // cells per second at start
    const MAX_SPEED  = 18;         // speed cap
    const SPEED_PER_FOOD = 0.25;   // speed increase per food eaten
    const INPUT_QUEUE_MAX = 2;     // buffer up to 2 queued turns (classic feel)

    // ── DOM refs ───────────────────────────────────────────────────
    const canvas          = document.getElementById('gameCanvas');
    const ctx             = canvas.getContext('2d');
    const scoreDisplay    = document.getElementById('scoreDisplay');
    const highScoreDisplay= document.getElementById('highScoreDisplay');
    const gameStatus      = document.getElementById('gameStatus');
    const gameWrapper     = document.getElementById('gameWrapper');
    const scoreBox        = document.getElementById('scoreBox');
    const btnStart        = document.getElementById('btnStart');
    const btnPause        = document.getElementById('btnPause');
    const touchControls   = document.getElementById('touchControls');

    // ── Persistent state ───────────────────────────────────────────
    let highScore = 0;
    try { highScore = parseInt(localStorage.getItem('snakeHighScore'), 10) || 0; } catch { /**/ }
    highScoreDisplay.textContent = highScore;

    // ── Game state ─────────────────────────────────────────────────
    let snake, food, bonusFood, bonusFoodTicks;
    let direction;                 // current committed direction
    let inputQueue;                // buffered turn queue
    let score, foodEaten;
    let particles, shakeAmount;
    let isRunning, isPaused, isGameOver;
    let hasStartedOnce = false;

    // rAF-based timing
    let rafId = null;
    let lastTickTime = 0;          // timestamp of last game-logic tick
    let currentSpeed = BASE_SPEED; // cells/sec

    // ── Background particles ───────────────────────────────────────
    const bgParticlesEl = document.getElementById('bgParticles');
    for (let i = 0; i < 30; i++) {
        const el = document.createElement('div');
        const size = Math.random() * 4 + 2;
        el.className = 'bg-particle';
        el.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;`
            + `animation-duration:${Math.random()*12+8}s;animation-delay:${Math.random()*10}s`;
        bgParticlesEl.appendChild(el);
    }

    // ── Helpers ────────────────────────────────────────────────────
    function tickInterval() { return 1000 / currentSpeed; }

    // ── Init / Reset ───────────────────────────────────────────────
    function initGame() {
        const mid = Math.floor(GRID_SIZE / 2);
        snake         = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
        direction     = { x: 1, y: 0 };
        inputQueue    = [];
        food          = { x: 0, y: 0 };
        bonusFood     = null;
        bonusFoodTicks= 0;
        score         = 0;
        foodEaten     = 0;
        particles     = [];
        shakeAmount   = 0;
        currentSpeed  = BASE_SPEED;
        isGameOver    = false;
        lastTickTime  = 0;

        scoreDisplay.textContent = '0';
        gameStatus.textContent   = 'Use arrow keys or WASD to move';
        gameStatus.classList.remove('alert');
        gameWrapper.classList.remove('game-over-state');
        scoreBox.classList.remove('pop');
        btnPause.textContent = 'Pause';

        spawnFood();
        drawGame(performance.now());
    }

    // ── Food ───────────────────────────────────────────────────────
    function spawnFood() {
        const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
        if (bonusFood) occupied.add(`${bonusFood.x},${bonusFood.y}`);
        const free = [];
        for (let x = 0; x < GRID_SIZE; x++)
            for (let y = 0; y < GRID_SIZE; y++)
                if (!occupied.has(`${x},${y}`)) free.push({ x, y });
        if (!free.length) return;
        food = free[Math.floor(Math.random() * free.length)];

        // Spawn bonus food with increasing frequency as snake grows
        const bonusChance = Math.min(0.5, 0.2 + foodEaten * 0.01);
        if (free.length > 1 && Math.random() < bonusChance) {
            const others = free.filter(c => c.x !== food.x || c.y !== food.y);
            bonusFood      = others[Math.floor(Math.random() * others.length)];
            bonusFoodTicks = 50 + Math.floor(Math.random() * 20); // ~50-70 ticks visible
        } else {
            bonusFood      = null;
            bonusFoodTicks = 0;
        }
    }

    // ── Particles ──────────────────────────────────────────────────
    function spawnParticles(gridX, gridY, color, count = 12) {
        const cx = gridX * CELL_SIZE + CELL_SIZE / 2;
        const cy = gridY * CELL_SIZE + CELL_SIZE / 2;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
            const speed = Math.random() * 3 + 1.5;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                life: 1, decay: Math.random() * 0.04 + 0.03,
                size: Math.random() * 4 + 2, color,
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy; p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle   = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur  = 6;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }

    // ── Game loop (rAF) ────────────────────────────────────────────
    function startLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        lastTickTime = performance.now();
        rafId = requestAnimationFrame(loop);
    }

    function stopLoop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function loop(now) {
        if (!isRunning || isPaused || isGameOver) return;

        // Catch up: if enough time has passed, run one or more logic ticks
        const interval = tickInterval();
        if (now - lastTickTime >= interval) {
            // At high speeds we might owe >1 tick; cap at 2 to avoid stutter
            const ticks = Math.min(2, Math.floor((now - lastTickTime) / interval));
            for (let t = 0; t < ticks; t++) {
                tickGame();
                if (isGameOver) break;
            }
            lastTickTime = now;
        }

        drawGame(now);
        if (!isGameOver) rafId = requestAnimationFrame(loop);
    }

    function tickGame() {
        // Consume next buffered input (classic: one turn per tick)
        if (inputQueue.length > 0) {
            const next = inputQueue.shift();
            // Validate: can't reverse into yourself
            if (!(next.x === -direction.x && next.y === -direction.y && snake.length > 1)) {
                direction = next;
            }
        }

        const head    = snake[0];
        const newHead = { x: head.x + direction.x, y: head.y + direction.y };

        // Wall collision (hard walls, classic feel)
        if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
            newHead.y < 0 || newHead.y >= GRID_SIZE) {
            endGame(); return;
        }

        // Determine if we'll eat this tick (affects collision check)
        const eatsFood  = newHead.x === food.x && newHead.y === food.y;
        const eatsBonus = bonusFood && newHead.x === bonusFood.x && newHead.y === bonusFood.y;
        const eating    = eatsFood || eatsBonus;

        // Self collision — if eating, tail won't vacate so check full body
        const bodySlice = eating ? snake : snake.slice(0, -1);
        for (const seg of bodySlice) {
            if (seg.x === newHead.x && seg.y === newHead.y) { endGame(); return; }
        }

        snake.unshift(newHead);

        if (eatsFood) {
            score      += 10;
            foodEaten  += 1;
            currentSpeed = Math.min(MAX_SPEED, BASE_SPEED + foodEaten * SPEED_PER_FOOD);
            spawnParticles(food.x, food.y, '#00e676', 14);
            spawnFood();
            triggerScorePop();
        } else if (eatsBonus) {
            const pts   = 30;
            score      += pts;
            foodEaten  += 1;
            currentSpeed = Math.min(MAX_SPEED, BASE_SPEED + foodEaten * SPEED_PER_FOOD);
            spawnParticles(bonusFood.x, bonusFood.y, '#ffd740', 20);
            bonusFood      = null;
            bonusFoodTicks = 0;
            triggerScorePop();
        } else {
            snake.pop();
        }

        // Tick down bonus food lifetime
        if (bonusFood && --bonusFoodTicks <= 0) { bonusFood = null; bonusFoodTicks = 0; }

        scoreDisplay.textContent = score;

        if (score > highScore) {
            highScore = score;
            highScoreDisplay.textContent = highScore;
            try { localStorage.setItem('snakeHighScore', highScore); } catch { /**/ }
        }

        updateParticles();
        shakeAmount = shakeAmount > 0.05 ? shakeAmount * 0.85 : 0;
    }

    function triggerScorePop() {
        scoreBox.classList.remove('pop');
        void scoreBox.offsetWidth;
        scoreBox.classList.add('pop');
    }

    function endGame() {
        isGameOver = true;
        isRunning  = false;
        shakeAmount = 14;
        stopLoop();
        // One last draw to show shake
        drawGame(performance.now());
        gameStatus.textContent = 'Game Over — Press Start or Space';
        gameStatus.classList.add('alert');
        gameWrapper.classList.add('game-over-state');
        btnStart.textContent = 'Restart';
        spawnParticles(snake[0].x, snake[0].y, '#ff4081', 28);
        // Animate particles after death
        (function deathAnim(n) {
            if (n <= 0 || particles.length === 0) return;
            updateParticles();
            drawGame(performance.now());
            requestAnimationFrame(() => deathAnim(n - 1));
        })(40);
    }

    // ── Draw helpers ───────────────────────────────────────────────
    function drawGrid() {
        ctx.strokeStyle = '#ffffff18';
        ctx.lineWidth   = 0.5;
        for (let i = 1; i < GRID_SIZE; i++) {
            const pos = i * CELL_SIZE;
            ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, canvas.height); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(canvas.width, pos); ctx.stroke();
        }
    }

    function drawFood(now) {
        const pulse  = 1 + Math.sin(now / 250) * 0.12;
        const fx     = food.x * CELL_SIZE + CELL_SIZE / 2;
        const fy     = food.y * CELL_SIZE + CELL_SIZE / 2;
        const radius = (CELL_SIZE / 2 - 2) * pulse;

        const glow = ctx.createRadialGradient(fx, fy, radius * 0.3, fx, fy, radius * 2.2);
        glow.addColorStop(0, '#00e676aa');
        glow.addColorStop(0.5, '#00e67633');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(fx, fy, radius * 2.2, 0, Math.PI * 2); ctx.fill();

        const apple = ctx.createRadialGradient(fx - radius * 0.25, fy - radius * 0.3, radius * 0.1, fx, fy, radius);
        apple.addColorStop(0, '#69f0ae');
        apple.addColorStop(0.6, '#00e676');
        apple.addColorStop(1, '#009624');
        ctx.fillStyle   = apple;
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.arc(fx, fy, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff55';
        ctx.beginPath(); ctx.arc(fx - radius * 0.3, fy - radius * 0.35, radius * 0.3, 0, Math.PI * 2); ctx.fill();
    }

    function drawBonusFood(now) {
        if (!bonusFood || bonusFoodTicks <= 0) return;
        const pulse  = 1 + Math.sin(now / 200) * 0.18;
        const bx     = bonusFood.x * CELL_SIZE + CELL_SIZE / 2;
        const by     = bonusFood.y * CELL_SIZE + CELL_SIZE / 2;
        const radius = (CELL_SIZE / 2 - 3) * pulse;
        const alpha  = Math.min(1, bonusFoodTicks / 15);

        const glow = ctx.createRadialGradient(bx, by, radius * 0.3, bx, by, radius * 2);
        glow.addColorStop(0, `rgba(255,215,64,${0.7 * alpha})`);
        glow.addColorStop(0.5, `rgba(255,215,64,${0.2 * alpha})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(bx, by, radius * 2, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle   = `rgba(255,215,64,${alpha})`;
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * alpha})`;
        ctx.lineWidth   = 1.5;
        drawStar(bx, by, radius, 5);
        ctx.fill(); ctx.stroke();
    }

    function drawSnakeEyes(cx, cy, radius) {
        const eyeSize       = radius * 0.25;
        const dx            = direction.x || 1;
        const dy            = direction.y || 0;
        const eyeCenterX    = cx + dx * radius * 0.38;
        const eyeCenterY    = cy + dy * radius * 0.38;
        const perpX         = -dy * radius * 0.28;
        const perpY         =  dx * radius * 0.28;
        for (const [ex, ey] of [[eyeCenterX + perpX, eyeCenterY + perpY],
                                 [eyeCenterX - perpX, eyeCenterY - perpY]]) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(ex, ey, eyeSize, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(ex + dx * eyeSize * 0.4, ey + dy * eyeSize * 0.4, eyeSize * 0.55, 0, Math.PI * 2); ctx.fill();
        }
    }

    function drawSnake() {
        if (!snake.length) return;
        const len      = snake.length;
        const bodyW    = CELL_SIZE * 0.82;  // tube diameter
        const headR    = CELL_SIZE * 0.46;  // head circle radius

        // Helper: centre-pixel of a grid cell
        function cx(s) { return s.x * CELL_SIZE + CELL_SIZE / 2; }
        function cy(s) { return s.y * CELL_SIZE + CELL_SIZE / 2; }

        if (len === 1) {
            // Degenerate single-cell snake — just draw a circle
            const x = cx(snake[0]), y = cy(snake[0]);
            const g = ctx.createRadialGradient(x - headR*0.25, y - headR*0.3, headR*0.1, x, y, headR);
            g.addColorStop(0, '#69f0ae'); g.addColorStop(0.65, '#00c853'); g.addColorStop(1, '#007e33');
            ctx.fillStyle = g;
            ctx.strokeStyle = '#004d1a'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(x, y, headR, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            drawSnakeEyes(x, y, headR);
            return;
        }

        // ── 1. Dark outline (slightly wider, drawn first) ──────────
        ctx.save();
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#004d1a';
        ctx.lineWidth   = bodyW + 3;
        ctx.beginPath();
        ctx.moveTo(cx(snake[len-1]), cy(snake[len-1]));
        for (let i = len - 2; i >= 0; i--) ctx.lineTo(cx(snake[i]), cy(snake[i]));
        ctx.stroke();
        ctx.restore();

        // ── 2. Main body fill — linear gradient head→tail ──────────
        // Use a gradient from head colour to tail colour along the path.
        // Canvas linear gradient is world-space, so we align it head-to-tail.
        const hx = cx(snake[0]),  hy = cy(snake[0]);
        const tx = cx(snake[len-1]), ty = cy(snake[len-1]);
        const bodyGrad = ctx.createLinearGradient(tx, ty, hx, hy);
        bodyGrad.addColorStop(0,   '#006629'); // tail
        bodyGrad.addColorStop(0.4, '#00a846');
        bodyGrad.addColorStop(1,   '#00c853'); // head

        ctx.save();
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.strokeStyle = bodyGrad;
        ctx.lineWidth   = bodyW;
        ctx.beginPath();
        ctx.moveTo(cx(snake[len-1]), cy(snake[len-1]));
        for (let i = len - 2; i >= 0; i--) ctx.lineTo(cx(snake[i]), cy(snake[i]));
        ctx.stroke();
        ctx.restore();

        // ── 3. Highlight stripe (thin, semi-transparent, offset up-left) ──
        ctx.save();
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.strokeStyle = 'rgba(105,240,174,0.35)';
        ctx.lineWidth   = bodyW * 0.35;
        // Offset the path slightly toward the light source
        ctx.translate(-bodyW * 0.12, -bodyW * 0.14);
        ctx.beginPath();
        ctx.moveTo(cx(snake[len-1]), cy(snake[len-1]));
        for (let i = len - 2; i >= 0; i--) ctx.lineTo(cx(snake[i]), cy(snake[i]));
        ctx.stroke();
        ctx.restore();

        // ── 4. Head circle (on top, richer colour) ──────────────────
        const hgx = hx, hgy = hy;
        const hg  = ctx.createRadialGradient(hgx - headR*0.25, hgy - headR*0.3, headR*0.1, hgx, hgy, headR);
        hg.addColorStop(0,   '#69f0ae');
        hg.addColorStop(0.6, '#00c853');
        hg.addColorStop(1,   '#007e33');

        ctx.fillStyle   = hg;
        ctx.strokeStyle = '#004d1a';
        ctx.lineWidth   = 1.2;
        ctx.beginPath(); ctx.arc(hgx, hgy, headR, 0, Math.PI*2); ctx.fill(); ctx.stroke();

        // ── 5. Eyes ──────────────────────────────────────────────────
        drawSnakeEyes(hgx, hgy, headR);
    }

    function drawStar(cx, cy, r, points) {
        const step = Math.PI / points;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle  = -Math.PI / 2 + i * step;
            const radius = i % 2 === 0 ? r : r * 0.45;
            i === 0
                ? ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
                : ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        }
        ctx.closePath();
    }

    function drawPauseOverlay() {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font      = 'bold 28px "Segoe UI","Inter",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Paused', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'start';
    }

    function drawGame(now) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const sx = shakeAmount > 0.1 ? (Math.random() - 0.5) * shakeAmount : 0;
        const sy = shakeAmount > 0.1 ? (Math.random() - 0.5) * shakeAmount : 0;
        ctx.save();
        ctx.translate(sx, sy);
        drawGrid();
        drawFood(now);
        drawBonusFood(now);
        drawSnake();
        drawParticles();
        ctx.restore();
        if (isPaused && !isGameOver) drawPauseOverlay();
    }

    // ── Input ──────────────────────────────────────────────────────
    /**
     * Classic-style input buffering: enqueue up to INPUT_QUEUE_MAX turns.
     * Each buffered turn is validated against the *last* queued direction,
     * so quick double-taps are handled correctly without reversing.
     */
    function queueDirection(dx, dy) {
        if (!isRunning || isPaused || isGameOver) return;

        // Last known direction (pending or current)
        const last = inputQueue.length > 0 ? inputQueue[inputQueue.length - 1] : direction;

        // Ignore: same direction or direct reversal
        if (dx === last.x && dy === last.y) return;
        if (dx === -last.x && dy === -last.y && snake.length > 1) return;

        if (inputQueue.length < INPUT_QUEUE_MAX) {
            inputQueue.push({ x: dx, y: dy });
        } else {
            // Replace last queued (most recent wins)
            inputQueue[inputQueue.length - 1] = { x: dx, y: dy };
        }
    }

    function startGame() {
        stopLoop();
        initGame();
        isRunning       = true;
        isPaused        = false;
        isGameOver      = false;
        hasStartedOnce  = true;
        btnStart.textContent = 'Restart';
        startLoop();
    }

    function togglePause() {
        if (!isRunning || isGameOver) return;
        isPaused = !isPaused;
        if (isPaused) {
            stopLoop();
            gameStatus.textContent  = 'Paused';
            btnPause.textContent    = 'Resume';
        } else {
            gameStatus.textContent  = 'Use arrow keys or WASD to move';
            btnPause.textContent    = 'Pause';
            startLoop();
        }
        drawGame(performance.now());
    }

    // ── Keyboard ───────────────────────────────────────────────────
    const DIR_KEYS = {
        arrowup:    [0, -1], arrowdown:  [0,  1],
        arrowleft:  [-1, 0], arrowright: [1,  0],
        w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    };
    const SCROLL_KEYS = new Set(['arrowup','arrowdown','arrowleft','arrowright',' ']);

    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (SCROLL_KEYS.has(key)) e.preventDefault(); // prevent page scroll

        if (DIR_KEYS[key]) {
            const [dx, dy] = DIR_KEYS[key];
            // Auto-start on first arrow key
            if (!isRunning && !isGameOver) { startGame(); }
            queueDirection(dx, dy);
        } else if (key === ' ' || key === 'enter') {
            (!isRunning || isGameOver) ? startGame() : togglePause();
        } else if (key === 'p') {
            togglePause();
        }
    });

    // Use pointerdown instead of click so these fire immediately on touch
    // without depending on the browser's click-synthesis (which our document-level
    // touchstart/touchend preventDefault can suppress on some mobile browsers).
    function addMainBtn(el, fn) {
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
        // Keyboard / mouse fallback — pointerdown already covers mouse, but
        // keep click as a no-op duplicate guard for accessibility (Enter on focused btn).
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
    }
    addMainBtn(btnStart, startGame);
    addMainBtn(btnPause, togglePause);

    // ── Touch controls (buttons) ───────────────────────────────────
    function addTouchBtn(id, dx, dy) {
        const el = document.getElementById(id);
        // pointerdown for instant response; prevent default to avoid ghost clicks & scroll
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (!isRunning && !isGameOver) startGame();
            queueDirection(dx, dy);
        });
    }
    addTouchBtn('touchUp',    0, -1);
    addTouchBtn('touchDown',  0,  1);
    addTouchBtn('touchLeft', -1,  0);
    addTouchBtn('touchRight', 1,  0);

    // ── Swipe detection (whole document) ──────────────────────────
    // We block ALL touch scrolling while the game is active.
    let swipeTouchId  = null;
    let swipeStartX   = 0;
    let swipeStartY   = 0;
    const SWIPE_THRESHOLD = 20; // px — low for responsiveness

    function onTouchStart(e) {
        // Don't block default on buttons/links — doing so suppresses the
        // synthesized click event that btnStart / btnPause rely on.
        const tag = e.target.tagName;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return;

        e.preventDefault(); // block scroll / bounce everywhere else

        if (swipeTouchId !== null) return; // already tracking
        const t       = e.changedTouches[0];
        swipeTouchId  = t.identifier;
        swipeStartX   = t.clientX;
        swipeStartY   = t.clientY;
    }

    function onTouchMove(e) {
        e.preventDefault(); // block scroll
        if (swipeTouchId === null) return;

        const t = [...e.changedTouches].find(t => t.identifier === swipeTouchId);
        if (!t) return;

        const dx = t.clientX - swipeStartX;
        const dy = t.clientY - swipeStartY;

        if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

        // Commit direction on move (not just end) for snappier feel
        if (Math.abs(dx) > Math.abs(dy)) {
            queueDirection(dx > 0 ? 1 : -1, 0);
        } else {
            queueDirection(0, dy > 0 ? 1 : -1);
        }

        // Reset origin so they can swipe again in same gesture
        swipeStartX = t.clientX;
        swipeStartY = t.clientY;
    }

    function onTouchEnd(e) {
        const tag = e.target.tagName;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return;
        e.preventDefault();
        const t = [...e.changedTouches].find(t => t.identifier === swipeTouchId);
        if (t) swipeTouchId = null;
    }

    // Attach to document so swipe works anywhere on page
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove',  onTouchMove,  { passive: false });
    document.addEventListener('touchend',   onTouchEnd,   { passive: false });
    document.addEventListener('touchcancel',onTouchEnd,   { passive: false });

    // Also block wheel/scroll on the wrapper
    document.addEventListener('wheel', (e) => {
        if (isRunning && !isGameOver) e.preventDefault();
    }, { passive: false });

    // ── Responsive touch control visibility ───────────────────────
    function updateTouchControls() {
        touchControls.style.display = window.innerWidth <= 540 ? 'flex' : 'none';
    }
    window.addEventListener('resize', updateTouchControls);
    updateTouchControls();

    // ── Boot ───────────────────────────────────────────────────────
    initGame();
    isRunning = false;
    gameStatus.textContent = 'Press Start or arrow key to play';

}());
