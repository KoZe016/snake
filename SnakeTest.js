(function () {
    'use strict';

    const GRID_SIZE = 20;
    const CANVAS_SIZE = 500;
    const CELL_SIZE = CANVAS_SIZE / GRID_SIZE;
    const BASE_SPEED = 9;
    const MAX_SPEED = 18;
    const SPEED_PER_FOOD = 0.25;
    const INPUT_QUEUE_MAX = 2;
    const SWIPE_THRESHOLD = 35;

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // --- DPR scaling (Change #5) ---
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    canvas.style.width = CANVAS_SIZE + 'px';
    canvas.style.height = CANVAS_SIZE + 'px';
    ctx.scale(dpr, dpr);

    const scoreDisplay = document.getElementById('scoreDisplay');
    const highScoreDisplay = document.getElementById('highScoreDisplay');
    const gameWrapper = document.getElementById('gameWrapper');
    const scoreBox = document.getElementById('scoreBox');
    const btnStart = document.getElementById('btnStart');
    const btnPause = document.getElementById('btnPause');
    const touchControls = document.getElementById('touchControls');

    let highScore = 0;
    try {
        highScore = parseInt(localStorage.getItem('snakeHighScore'), 10) || 0;
    } catch { /* ignore */ }
    highScoreDisplay.textContent = highScore;

    let snake, food, bonusFood, bonusFoodTicks;
    let direction;
    let inputQueue;
    let score, foodEaten;
    let particles, shakeAmount;
    let isRunning, isPaused, isGameOver;
    let hasStartedOnce = false;

    let rafId = null;
    let deathAnimId = null;
    let lastTickTime = 0;
    let currentSpeed = BASE_SPEED;

    // --- Body gradient cache (Change #2) ---
    let snakeBodyGrad = null;
    let snakeBodyGradLength = 0;

    function getSnakeBodyGrad() {
        if (snakeBodyGrad && snake.length === snakeBodyGradLength) return snakeBodyGrad;
        // only recreate when length changes
        const hx = snake[0].x * CELL_SIZE + CELL_SIZE / 2;
        const hy = snake[0].y * CELL_SIZE + CELL_SIZE / 2;
        const tx = snake[snake.length - 1].x * CELL_SIZE + CELL_SIZE / 2;
        const ty = snake[snake.length - 1].y * CELL_SIZE + CELL_SIZE / 2;
        snakeBodyGrad = ctx.createLinearGradient(tx, ty, hx, hy);
        snakeBodyGrad.addColorStop(0, '#006629');
        snakeBodyGrad.addColorStop(0.4, '#00a846');
        snakeBodyGrad.addColorStop(1, '#00c853');
        snakeBodyGradLength = snake.length;
        return snakeBodyGrad;
    }

    const bgParticlesEl = document.getElementById('bgParticles');
    for (let i = 0; i < 30; i++) {
        const el = document.createElement('div');
        const size = Math.random() * 4 + 2;
        el.className = 'bg-particle';
        el.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;`
            + `animation-duration:${Math.random()*12+8}s;animation-delay:${Math.random()*10}s`;
        bgParticlesEl.appendChild(el);
    }

    function tickInterval() {
        return 1000 / currentSpeed;
    }

    function initGame() {
        const mid = Math.floor(GRID_SIZE / 2);
        snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
        direction = { x: 1, y: 0 };
        inputQueue = [];
        food = { x: 0, y: 0 };
        bonusFood = null;
        bonusFoodTicks = 0;
        score = 0;
        foodEaten = 0;
        particles = [];
        shakeAmount = 0;
        currentSpeed = BASE_SPEED;
        isGameOver = false;
        lastTickTime = 0;
        // Reset gradient cache
        snakeBodyGrad = null;
        snakeBodyGradLength = 0;

        scoreDisplay.textContent = '0';
        gameWrapper.classList.remove('game-over-state');
        scoreBox.classList.remove('pop');

        // Pause button hidden on initial state (and game over)
        btnPause.style.display = 'none';
        btnPause.textContent = 'Pause';

        // Start button visible with 'Start'
        btnStart.style.display = '';
        btnStart.textContent = 'Start';

        spawnFood();
        drawGame(performance.now());
    }

    function spawnFood() {
        const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
        if (bonusFood) occupied.add(`${bonusFood.x},${bonusFood.y}`);
        const free = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                if (!occupied.has(`${x},${y}`)) free.push({ x, y });
            }
        }
        if (!free.length) return;
        food = free[Math.floor(Math.random() * free.length)];

        const bonusChance = Math.min(0.5, 0.2 + foodEaten * 0.01);
        if (free.length > 1 && Math.random() < bonusChance) {
            const others = free.filter(c => c.x !== food.x || c.y !== food.y);
            bonusFood = others[Math.floor(Math.random() * others.length)];
            bonusFoodTicks = 50 + Math.floor(Math.random() * 20);
        } else {
            bonusFood = null;
            bonusFoodTicks = 0;
        }
    }

    function spawnParticles(gridX, gridY, color, count = 12) {
        const cx = gridX * CELL_SIZE + CELL_SIZE / 2;
        const cy = gridY * CELL_SIZE + CELL_SIZE / 2;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
            const speed = Math.random() * 3 + 1.5;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: Math.random() * 0.04 + 0.03,
                size: Math.random() * 4 + 2,
                color,
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    // --- Optimized particle drawing (Change #3) ---
    function drawParticles() {
        ctx.save();
        ctx.shadowBlur = 6;
        for (const p of particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function startLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        lastTickTime = performance.now();
        rafId = requestAnimationFrame(loop);
    }

    function stopLoop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    function loop(now) {
        if (!isRunning || isPaused || isGameOver) return;

        const interval = tickInterval();
        if (now - lastTickTime >= interval) {
            const ticks = Math.min(2, Math.floor((now - lastTickTime) / interval));
            for (let t = 0; t < ticks; t++) {
                tickGame();
                if (isGameOver) break;
            }
            // --- Time accumulation (Change #4) ---
            lastTickTime += interval * ticks;
        }

        drawGame(now);
        if (!isGameOver) rafId = requestAnimationFrame(loop);
    }

    function tickGame() {
        if (inputQueue.length > 0) {
            const next = inputQueue.shift();
            if (!(next.x === -direction.x && next.y === -direction.y && snake.length > 1)) {
                direction = next;
            }
        }

        const head = snake[0];
        const newHead = { x: head.x + direction.x, y: head.y + direction.y };

        if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
            endGame();
            return;
        }

        const willEatFood = newHead.x === food.x && newHead.y === food.y;
        const willEatBonus = bonusFood && newHead.x === bonusFood.x && newHead.y === bonusFood.y;
        const willEat = willEatFood || willEatBonus;

        const bodyForCollision = willEat ? snake : snake.slice(0, -1);
        if (bodyForCollision.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
            endGame();
            return;
        }

        snake.unshift(newHead);

        if (willEatFood) {
            score += 10;
            foodEaten += 1;
            currentSpeed = Math.min(MAX_SPEED, BASE_SPEED + foodEaten * SPEED_PER_FOOD);
            spawnParticles(food.x, food.y, '#00e676', 14);
            spawnFood();
            triggerScorePop();
        } else if (willEatBonus) {
            score += 30;
            foodEaten += 1;
            currentSpeed = Math.min(MAX_SPEED, BASE_SPEED + foodEaten * SPEED_PER_FOOD);
            spawnParticles(bonusFood.x, bonusFood.y, '#ffd740', 20);
            bonusFood = null;
            bonusFoodTicks = 0;
            triggerScorePop();
        } else {
            snake.pop();
        }

        if (bonusFood && --bonusFoodTicks <= 0) {
            bonusFood = null;
            bonusFoodTicks = 0;
        }

        scoreDisplay.textContent = score;

        if (score > highScore) {
            highScore = score;
            highScoreDisplay.textContent = highScore;
            try {
                localStorage.setItem('snakeHighScore', highScore);
            } catch { /* ignore */ }
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
        isRunning = false;
        shakeAmount = 14;
        stopLoop();
        if (deathAnimId) {
            cancelAnimationFrame(deathAnimId);
            deathAnimId = null;
        }
        // Hide Pause button, show Start as 'Restart'
        btnPause.style.display = 'none';
        btnStart.style.display = '';
        btnStart.textContent = 'Restart';
        drawGame(performance.now());
        gameWrapper.classList.add('game-over-state');
        spawnParticles(snake[0].x, snake[0].y, '#ff4081', 28);

        let frames = 40;
        function deathAnim() {
            if (frames <= 0 || particles.length === 0) {
                deathAnimId = null;
                return;
            }
            updateParticles();
            drawGame(performance.now());
            frames--;
            deathAnimId = requestAnimationFrame(deathAnim);
        }
        deathAnimId = requestAnimationFrame(deathAnim);
    }

    // --- Batched grid drawing (Change #1) ---
    function drawGrid() {
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff18';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < GRID_SIZE; i++) {
            const pos = i * CELL_SIZE;
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos, canvas.height);
            ctx.moveTo(0, pos);
            ctx.lineTo(canvas.width, pos);
        }
        ctx.stroke(); // one call at the end
    }

    function drawFood(now) {
        const pulse = 1 + Math.sin(now / 250) * 0.12;
        const fx = food.x * CELL_SIZE + CELL_SIZE / 2;
        const fy = food.y * CELL_SIZE + CELL_SIZE / 2;
        const radius = (CELL_SIZE / 2 - 2) * pulse;

        const glow = ctx.createRadialGradient(fx, fy, radius * 0.3, fx, fy, radius * 2.2);
        glow.addColorStop(0, '#00e676aa');
        glow.addColorStop(0.5, '#00e67633');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(fx, fy, radius * 2.2, 0, Math.PI * 2);
        ctx.fill();

        const apple = ctx.createRadialGradient(fx - radius * 0.25, fy - radius * 0.3, radius * 0.1, fx, fy, radius);
        apple.addColorStop(0, '#69f0ae');
        apple.addColorStop(0.6, '#00e676');
        apple.addColorStop(1, '#009624');
        ctx.fillStyle = apple;
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(fx, fy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff55';
        ctx.beginPath();
        ctx.arc(fx - radius * 0.3, fy - radius * 0.35, radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawBonusFood(now) {
        if (!bonusFood || bonusFoodTicks <= 0) return;
        const pulse = 1 + Math.sin(now / 200) * 0.18;
        const bx = bonusFood.x * CELL_SIZE + CELL_SIZE / 2;
        const by = bonusFood.y * CELL_SIZE + CELL_SIZE / 2;
        const radius = (CELL_SIZE / 2 - 3) * pulse;
        const alpha = Math.min(1, bonusFoodTicks / 15);

        const glow = ctx.createRadialGradient(bx, by, radius * 0.3, bx, by, radius * 2);
        glow.addColorStop(0, `rgba(255,215,64,${0.7 * alpha})`);
        glow.addColorStop(0.5, `rgba(255,215,64,${0.2 * alpha})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(bx, by, radius * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255,215,64,${alpha})`;
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * alpha})`;
        ctx.lineWidth = 1.5;
        drawStar(bx, by, radius, 5);
        ctx.fill();
        ctx.stroke();
    }

    function drawStar(cx, cy, r, points) {
        const step = Math.PI / points;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle = -Math.PI / 2 + i * step;
            const radius = i % 2 === 0 ? r : r * 0.45;
            if (i === 0) {
                ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
            } else {
                ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
            }
        }
        ctx.closePath();
    }

    function drawSnakeBody() {
        if (snake.length === 0) return;
        const len = snake.length;
        const bodyW = CELL_SIZE * 0.82;

        function cx(s) { return s.x * CELL_SIZE + CELL_SIZE / 2; }
        function cy(s) { return s.y * CELL_SIZE + CELL_SIZE / 2; }

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#004d1a';
        ctx.lineWidth = bodyW + 3;
        ctx.beginPath();
        ctx.moveTo(cx(snake[len - 1]), cy(snake[len - 1]));
        for (let i = len - 2; i >= 0; i--) ctx.lineTo(cx(snake[i]), cy(snake[i]));
        ctx.stroke();
        ctx.restore();

        // --- Cached body gradient (Change #2) ---
        const bodyGrad = getSnakeBodyGrad();

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = bodyGrad;
        ctx.lineWidth = bodyW;
        ctx.beginPath();
        ctx.moveTo(cx(snake[len - 1]), cy(snake[len - 1]));
        for (let i = len - 2; i >= 0; i--) ctx.lineTo(cx(snake[i]), cy(snake[i]));
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(105,240,174,0.35)';
        ctx.lineWidth = bodyW * 0.35;
        ctx.translate(-bodyW * 0.12, -bodyW * 0.14);
        ctx.beginPath();
        ctx.moveTo(cx(snake[len - 1]), cy(snake[len - 1]));
        for (let i = len - 2; i >= 0; i--) ctx.lineTo(cx(snake[i]), cy(snake[i]));
        ctx.stroke();
        ctx.restore();
    }

    function drawSnakeHead() {
        if (snake.length === 0) return;
        const head = snake[0];
        const hx = head.x * CELL_SIZE + CELL_SIZE / 2;
        const hy = head.y * CELL_SIZE + CELL_SIZE / 2;
        const headR = CELL_SIZE * 0.46;

        const hg = ctx.createRadialGradient(hx - headR * 0.25, hy - headR * 0.3, headR * 0.1, hx, hy, headR);
        hg.addColorStop(0, '#69f0ae');
        hg.addColorStop(0.6, '#00c853');
        hg.addColorStop(1, '#007e33');

        ctx.fillStyle = hg;
        ctx.strokeStyle = '#004d1a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(hx, hy, headR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        drawSnakeEyes(hx, hy, headR);
    }

    function drawSnakeEyes(cx, cy, radius) {
        const eyeSize = radius * 0.25;
        const dx = direction.x || 1;
        const dy = direction.y || 0;
        const eyeCenterX = cx + dx * radius * 0.38;
        const eyeCenterY = cy + dy * radius * 0.38;
        const perpX = -dy * radius * 0.28;
        const perpY = dx * radius * 0.28;

        const eyeOffsets = [
            [eyeCenterX + perpX, eyeCenterY + perpY],
            [eyeCenterX - perpX, eyeCenterY - perpY],
        ];
        for (const [ex, ey] of eyeOffsets) {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(ex, ey, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(ex + dx * eyeSize * 0.4, ey + dy * eyeSize * 0.4, eyeSize * 0.55, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawSnake() {
        if (snake.length === 0) return;
        if (snake.length === 1) {
            const head = snake[0];
            const hx = head.x * CELL_SIZE + CELL_SIZE / 2;
            const hy = head.y * CELL_SIZE + CELL_SIZE / 2;
            const headR = CELL_SIZE * 0.46;
            const hg = ctx.createRadialGradient(hx - headR * 0.25, hy - headR * 0.3, headR * 0.1, hx, hy, headR);
            hg.addColorStop(0, '#69f0ae');
            hg.addColorStop(0.6, '#00c853');
            hg.addColorStop(1, '#007e33');
            ctx.fillStyle = hg;
            ctx.strokeStyle = '#004d1a';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(hx, hy, headR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            drawSnakeEyes(hx, hy, headR);
            return;
        }

        drawSnakeBody();
        drawSnakeHead();
    }

    function drawStartOverlay() {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.font = 'bold 32px "Segoe UI","Inter",sans-serif';
        ctx.fillStyle = '#00e676';
        ctx.shadowColor = '#00e676';
        ctx.shadowBlur = 18;
        const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
        ctx.fillText(isTouchDevice ? 'Tap Start to play' : 'Press Space to start', canvas.width / 2, canvas.height / 2 - 14);
        ctx.shadowBlur = 0;
        ctx.font = '14px "Segoe UI","Inter",sans-serif';
        ctx.fillStyle = 'rgba(0,230,118,0.7)';
        if (!isTouchDevice) {
            ctx.fillText('WASD / Arrow keys to move  ·  Space / P to pause', canvas.width / 2, canvas.height / 2 + 18);
        }
        ctx.textAlign = 'start';
    }

    function drawPauseOverlay() {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px "Segoe UI","Inter",sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Paused', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'start';
    }

    function drawGameOverOverlay() {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.font = 'bold 32px "Segoe UI","Inter",sans-serif';
        ctx.fillStyle = '#ff4081';
        ctx.shadowColor = '#ff4081';
        ctx.shadowBlur = 18;
        ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 14);
        ctx.shadowBlur = 0;
        ctx.font = '14px "Segoe UI","Inter",sans-serif';
        ctx.fillStyle = 'rgba(255,64,129,0.7)';
        const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
        if (!isTouchDevice) {
            ctx.fillText('Space to restart  ·  WASD / Arrow keys to move  ·  Space / P to pause', canvas.width / 2, canvas.height / 2 + 18);
        }
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

        if (!isRunning && !hasStartedOnce && !isGameOver) drawStartOverlay();
        if (isPaused && !isGameOver) drawPauseOverlay();
        if (isGameOver) drawGameOverOverlay();
    }

    function queueDirection(dx, dy) {
        if (!isRunning || isPaused || isGameOver) return;

        const last = inputQueue.length > 0 ? inputQueue[inputQueue.length - 1] : direction;
        if (dx === last.x && dy === last.y) return;
        if (dx === -last.x && dy === -last.y && snake.length > 1) return;

        if (inputQueue.length < INPUT_QUEUE_MAX) {
            inputQueue.push({ x: dx, y: dy });
        } else {
            inputQueue[inputQueue.length - 1] = { x: dx, y: dy };
        }
    }

    function startGame() {
        stopLoop();
        if (deathAnimId) {
            cancelAnimationFrame(deathAnimId);
            deathAnimId = null;
        }
        initGame();
        isRunning = true;
        isPaused = false;
        isGameOver = false;
        hasStartedOnce = true;

        // Hide Start, show Pause
        btnStart.style.display = 'none';
        btnPause.style.display = '';
        btnPause.textContent = 'Pause';

        startLoop();
    }

    function togglePause() {
        if (!isRunning || isGameOver) return;
        isPaused = !isPaused;
        if (isPaused) {
            stopLoop();
            btnPause.textContent = 'Resume';
        } else {
            btnPause.textContent = 'Pause';
            startLoop();
        }
        drawGame(performance.now());
    }

    const DIR_KEYS = {
        arrowup: [0, -1],
        arrowdown: [0, 1],
        arrowleft: [-1, 0],
        arrowright: [1, 0],
        w: [0, -1],
        s: [0, 1],
        a: [-1, 0],
        d: [1, 0],
    };
    const SCROLL_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (SCROLL_KEYS.has(key)) e.preventDefault();

        if (DIR_KEYS[key]) {
            const [dx, dy] = DIR_KEYS[key];
            queueDirection(dx, dy);
        } else if (key === ' ') {
            if (!isRunning || isGameOver) {
                startGame();
            } else {
                togglePause();
            }
        } else if (key === 'p') {
            togglePause();
        }
    });

    function addMainBtn(el, fn) {
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fn();
            }
        });
    }
    addMainBtn(btnStart, startGame);
    addMainBtn(btnPause, togglePause);

    function addTouchBtn(id, dx, dy) {
        const el = document.getElementById(id);
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            queueDirection(dx, dy);
        });
    }
    addTouchBtn('touchUp', 0, -1);
    addTouchBtn('touchDown', 0, 1);
    addTouchBtn('touchLeft', -1, 0);
    addTouchBtn('touchRight', 1, 0);

    let swipeTouchId = null;
    let swipeStartX = 0;
    let swipeStartY = 0;

    function onTouchStart(e) {
        const tag = e.target.tagName;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return;
        e.preventDefault();
        if (swipeTouchId !== null) return;
        const t = e.changedTouches[0];
        swipeTouchId = t.identifier;
        swipeStartX = t.clientX;
        swipeStartY = t.clientY;
    }

    function onTouchMove(e) {
        e.preventDefault();
        if (swipeTouchId === null) return;
        const t = [...e.changedTouches].find(t => t.identifier === swipeTouchId);
        if (!t) return;

        const dx = t.clientX - swipeStartX;
        const dy = t.clientY - swipeStartY;
        if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

        if (Math.abs(dx) > Math.abs(dy)) {
            queueDirection(dx > 0 ? 1 : -1, 0);
        } else {
            queueDirection(0, dy > 0 ? 1 : -1);
        }
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

    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    document.addEventListener('touchcancel', onTouchEnd, { passive: false });

    document.addEventListener('wheel', (e) => {
        if (isRunning && !isGameOver) e.preventDefault();
    }, { passive: false });

    function updateTouchControls() {
        touchControls.style.display = window.innerWidth <= 540 ? 'flex' : 'none';
    }
    window.addEventListener('resize', updateTouchControls);
    updateTouchControls();

    // Initialise
    initGame();
    isRunning = false;
})();
