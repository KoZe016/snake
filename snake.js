(function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────────────
    const GRID_SIZE = 20;
    const FRAME_DELAY = 85; // ms per tick
    const CELL_SIZE = 500 / GRID_SIZE; // 25 px (matches canvas width)

    // ── DOM refs ───────────────────────────────────────────────────
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const highScoreDisplay = document.getElementById('highScoreDisplay');
    const gameStatus = document.getElementById('gameStatus');
    const gameWrapper = document.getElementById('gameWrapper');
    const scoreBox = document.getElementById('scoreBox');
    const btnStart = document.getElementById('btnStart');
    const btnPause = document.getElementById('btnPause');
    const touchControls = document.getElementById('touchControls');

    // ── Game state ─────────────────────────────────────────────────
    let snake, food, bonusFood, bonusFoodTimer;
    let direction, nextDirection;
    let score, particles, shakeAmount;
    let isRunning, isPaused, isGameOver;
    let gameInterval = null;
    let hasStartedOnce = false;

    let highScore = 0;
    try { highScore = parseInt(localStorage.getItem('snakeHighScore'), 10) || 0; } catch { /* ignore */ }
    highScoreDisplay.textContent = highScore;

    // ── Background particles ───────────────────────────────────────
    const bgParticlesEl = document.getElementById('bgParticles');
    for (let i = 0; i < 30; i++) {
        const el = document.createElement('div');
        const size = Math.random() * 4 + 2;
        el.className = 'bg-particle';
        el.style.width = size + 'px';
        el.style.height = size + 'px';
        el.style.left = (Math.random() * 100) + '%';
        el.style.animationDuration = (Math.random() * 12 + 8) + 's';
        el.style.animationDelay = (Math.random() * 10) + 's';
        bgParticlesEl.appendChild(el);
    }

    // ── Init / Reset ───────────────────────────────────────────────
    function initGame() {
        const mid = Math.floor(GRID_SIZE / 2);
        snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
        direction = { x: 1, y: 0 };
        nextDirection = { x: 1, y: 0 };
        food = { x: 0, y: 0 };
        bonusFood = null;
        bonusFoodTimer = 0;
        score = 0;
        particles = [];
        shakeAmount = 0;
        isGameOver = false;

        scoreDisplay.textContent = '0';
        gameStatus.textContent = 'Use arrow keys or WASD to move';
        gameStatus.classList.remove('alert');
        gameWrapper.classList.remove('game-over-state');
        scoreBox.classList.remove('pop');
        btnPause.textContent = 'Pause';

        spawnFood();
        drawGame();
    }

    // ── Food ───────────────────────────────────────────────────────
    function spawnFood() {
        const occupied = new Set(snake.map(s => s.x + ',' + s.y));
        const freeCells = [];
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                if (!occupied.has(x + ',' + y)) freeCells.push({ x, y });
            }
        }
        if (!freeCells.length) return;

        food = freeCells[Math.floor(Math.random() * freeCells.length)];

        if (freeCells.length > 1 && Math.random() < 0.25) {
            const others = freeCells.filter(c => c.x !== food.x || c.y !== food.y);
            bonusFood = others[Math.floor(Math.random() * others.length)];
            bonusFoodTimer = 60;
        } else {
            bonusFood = null;
            bonusFoodTimer = 0;
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

    function drawParticles() {
        for (const p of particles) {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ── Game loop ──────────────────────────────────────────────────
    function startGameLoop() {
        if (gameInterval) clearInterval(gameInterval);
        gameInterval = setInterval(tickGame, FRAME_DELAY);
    }

    function stopGameLoop() {
        clearInterval(gameInterval);
        gameInterval = null;
    }

    function tickGame() {
        if (!isRunning || isPaused || isGameOver) return;

        direction = { ...nextDirection };
        const head = snake[0];
        const newHead = { x: head.x + direction.x, y: head.y + direction.y };

        // Wall collision
        if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
            newHead.y < 0 || newHead.y >= GRID_SIZE) {
            endGame(); return;
        }

        // Self collision (exclude tail — it vacates unless eating)
        const willEat = (newHead.x === food.x && newHead.y === food.y) ||
            (bonusFood && newHead.x === bonusFood.x && newHead.y === bonusFood.y);
        const bodyToCheck = willEat ? snake : snake.slice(0, -1);
        for (const seg of bodyToCheck) {
            if (seg.x === newHead.x && seg.y === newHead.y) { endGame(); return; }
        }

        snake.unshift(newHead);

        let ate = false;
        if (newHead.x === food.x && newHead.y === food.y) {
            score += 10;
            ate = true;
            spawnParticles(food.x, food.y, '#00e676', 14);
            spawnFood();
        } else if (bonusFood && newHead.x === bonusFood.x && newHead.y === bonusFood.y) {
            score += 30;
            ate = true;
            spawnParticles(bonusFood.x, bonusFood.y, '#ffd740', 18);
            bonusFood = null;
            bonusFoodTimer = 0;
        } else {
            snake.pop();
        }

        if (bonusFood && --bonusFoodTimer <= 0) bonusFood = null;

        scoreDisplay.textContent = score;
        if (ate) {
            scoreBox.classList.remove('pop');
            void scoreBox.offsetWidth; // force reflow to restart animation
            scoreBox.classList.add('pop');
        }

        if (score > highScore) {
            highScore = score;
            highScoreDisplay.textContent = highScore;
            try { localStorage.setItem('snakeHighScore', highScore); } catch { /* ignore */ }
        }

        updateParticles();
        shakeAmount = shakeAmount > 0.05 ? shakeAmount * 0.85 : 0;
        drawGame();
    }

    function endGame() {
        isGameOver = true;
        isRunning = false;
        shakeAmount = 12;
        stopGameLoop();
        gameStatus.textContent = 'Game Over';
        gameStatus.classList.add('alert');
        gameWrapper.classList.add('game-over-state');
        btnStart.textContent = 'Restart';
        if (snake.length) spawnParticles(snake[0].x, snake[0].y, '#ff4081', 25);
        drawGame();
    }

    // ── Draw helpers ───────────────────────────────────────────────
    function drawGrid() {
        ctx.strokeStyle = '#ffffff18';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < GRID_SIZE; i++) {
            const pos = i * CELL_SIZE;
            ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, canvas.height); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(canvas.width, pos); ctx.stroke();
        }
    }

    function drawFood() {
        const pulse = 1 + Math.sin(Date.now() / 250) * 0.15;
        const fx = food.x * CELL_SIZE + CELL_SIZE / 2;
        const fy = food.y * CELL_SIZE + CELL_SIZE / 2;
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
        ctx.fillStyle = apple;
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(fx, fy, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        // Highlight
        ctx.fillStyle = '#ffffff55';
        ctx.beginPath(); ctx.arc(fx - radius * 0.3, fy - radius * 0.35, radius * 0.3, 0, Math.PI * 2); ctx.fill();
    }

    function drawBonusFood() {
        if (!bonusFood || bonusFoodTimer <= 0) return;
        const pulse = 1 + Math.sin(Date.now() / 200) * 0.2;
        const bx = bonusFood.x * CELL_SIZE + CELL_SIZE / 2;
        const by = bonusFood.y * CELL_SIZE + CELL_SIZE / 2;
        const radius = (CELL_SIZE / 2 - 3) * pulse;
        const alpha = Math.min(1, bonusFoodTimer / 20);

        const glow = ctx.createRadialGradient(bx, by, radius * 0.3, bx, by, radius * 2);
        glow.addColorStop(0, 'rgba(255,215,64,' + (0.7 * alpha) + ')');
        glow.addColorStop(0.5, 'rgba(255,215,64,' + (0.2 * alpha) + ')');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(bx, by, radius * 2, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = 'rgba(255,215,64,' + alpha + ')';
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * alpha) + ')';
        ctx.lineWidth = 1.5;
        drawStar(bx, by, radius, 5);
        ctx.fill(); ctx.stroke();
    }


    function drawSnakeEyes(cx, cy, radius) {
        const eyeSize = radius * 0.25;
        const dx = direction.x || 1;
        const dy = direction.y || 0;

        const forwardOffset = radius * 0.38;
        const sideOffset = radius * 0.28;
        const eyeCenterX = cx + dx * forwardOffset;
        const eyeCenterY = cy + dy * forwardOffset;
        const perpX = -dy * sideOffset;
        const perpY = dx * sideOffset;

        const eyePositions = [
            [eyeCenterX + perpX, eyeCenterY + perpY],
            [eyeCenterX - perpX, eyeCenterY - perpY],
        ];

        for (const [ex, ey] of eyePositions) {
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(ex, ey, eyeSize, 0, Math.PI * 2); ctx.fill();

            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(ex + dx * eyeSize * 0.4, ey + dy * eyeSize * 0.4, eyeSize * 0.55, 0, Math.PI * 2); ctx.fill();
        }
    }

    function drawSnake() {
        if (!snake.length) return;
        const len = snake.length;
        const maxRadius = CELL_SIZE * 0.46;
        const minRadius = CELL_SIZE * 0.22;

        // Draw tail-to-head so head renders on top
        for (let i = len - 1; i >= 0; i--) {
            const seg = snake[i];
            const cx = seg.x * CELL_SIZE + CELL_SIZE / 2;
            const cy = seg.y * CELL_SIZE + CELL_SIZE / 2;
            const t = len === 1 ? 0 : i / (len - 1);
            const radius = maxRadius - t * (maxRadius - minRadius);

            const grad = ctx.createRadialGradient(
                cx - radius * 0.25, cy - radius * 0.3, radius * 0.1,
                cx, cy, radius
            );
            grad.addColorStop(0, '#69f0ae');
            grad.addColorStop(0.7, '#00c853');
            grad.addColorStop(1, '#007e33');

            ctx.fillStyle = grad;
            ctx.strokeStyle = '#004d1a';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (i === 0) drawSnakeEyes(cx, cy, radius);
        }
    }

    function drawStar(cx, cy, r, points) {
        const step = Math.PI / points;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const angle = -Math.PI / 2 + i * step;
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
        ctx.font = 'bold 28px "Segoe UI", "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Paused', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'start';
    }

    function drawGame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const sx = shakeAmount > 0.1 ? (Math.random() - 0.5) * shakeAmount : 0;
        const sy = shakeAmount > 0.1 ? (Math.random() - 0.5) * shakeAmount : 0;
        ctx.save();
        ctx.translate(sx, sy);

        drawGrid();
        drawFood();
        drawBonusFood();
        drawSnake();
        drawParticles();

        ctx.restore();
        if (isPaused && !isGameOver) drawPauseOverlay();
    }

    // ── Input ──────────────────────────────────────────────────────
    function setDirection(dx, dy) {
        if (!isRunning || isPaused || isGameOver) return;
        if (dx === -direction.x && dy === -direction.y && snake.length > 1) return;
        if (dx === direction.x && dy === direction.y) return;
        nextDirection = { x: dx, y: dy };
    }

    function startGame() {
        stopGameLoop();
        initGame();
        isRunning = true;
        isPaused = false;
        isGameOver = false;
        hasStartedOnce = true;
        btnStart.textContent = 'Restart';
        startGameLoop();
    }

    function togglePause() {
        if (!isRunning || isGameOver) return;
        isPaused = !isPaused;
        if (isPaused) {
            stopGameLoop();
            gameStatus.textContent = 'Paused';
            btnPause.textContent = 'Resume';
        } else {
            startGameLoop();
            gameStatus.textContent = 'Use arrow keys or WASD to move';
            btnPause.textContent = 'Pause';
        }
        drawGame();
    }

    // Keyboard
    const KEY_ACTIONS = {
        arrowup: () => setDirection(0, -1),
        arrowdown: () => setDirection(0, 1),
        arrowleft: () => setDirection(-1, 0),
        arrowright: () => setDirection(1, 0),
        w: () => setDirection(0, -1),
        s: () => setDirection(0, 1),
        a: () => setDirection(-1, 0),
        d: () => setDirection(1, 0),
    };
    const BLOCKED_KEYS = new Set([...Object.keys(KEY_ACTIONS), ' ', 'p', 'enter']);

    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        if (BLOCKED_KEYS.has(key)) e.preventDefault();

        if (KEY_ACTIONS[key]) {
            KEY_ACTIONS[key]();
        } else if (key === ' ' || key === 'enter') {
            (!isRunning || isGameOver) ? startGame() : togglePause();
        } else if (key === 'p') {
            togglePause();
        }
    });

    btnStart.addEventListener('click', startGame);
    btnPause.addEventListener('click', togglePause);

    // Touch buttons
    document.getElementById('touchUp').addEventListener('click', () => setDirection(0, -1));
    document.getElementById('touchDown').addEventListener('click', () => setDirection(0, 1));
    document.getElementById('touchLeft').addEventListener('click', () => setDirection(-1, 0));
    document.getElementById('touchRight').addEventListener('click', () => setDirection(1, 0));

    // Swipe on canvas
    let swipeStartX = 0, swipeStartY = 0;
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            swipeStartX = e.touches[0].clientX;
            swipeStartY = e.touches[0].clientY;
        }
    }, { passive: true });
    canvas.addEventListener('touchend', (e) => {
        if (!isRunning || isPaused || isGameOver) return;
        const dx = (e.changedTouches[0]?.clientX ?? swipeStartX) - swipeStartX;
        const dy = (e.changedTouches[0]?.clientY ?? swipeStartY) - swipeStartY;
        const THRESHOLD = 30;
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
        Math.abs(dx) > Math.abs(dy)
            ? setDirection(dx > 0 ? 1 : -1, 0)
            : setDirection(0, dy > 0 ? 1 : -1);
    });

    // Responsive touch controls
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