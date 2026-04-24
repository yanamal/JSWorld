// TODO: wrap/encapsulate so it's possibleto import at top of html?

// ============================================
// CANVAS SETUP
// ============================================
const playArea = document.getElementById('playArea');
const waterCanvas = document.getElementById('waterCanvas');
const waterCtx = waterCanvas.getContext('2d');

function resizeCanvas() {
    // Save current water content before resize
    let savedImage = null;
    if (waterCanvas.width > 0 && waterCanvas.height > 0) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = waterCanvas.width;
        tempCanvas.height = waterCanvas.height;
        tempCanvas.getContext('2d').drawImage(waterCanvas, 0, 0);
        savedImage = tempCanvas;
    }

    // Resize canvas
    waterCanvas.width = window.innerWidth;
    waterCanvas.height = window.innerHeight;

    // Restore water content
    if (savedImage) {
        waterCtx.drawImage(savedImage, 0, 0);
    }
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ============================================
// GAME STATE
// ============================================
const fires = [];

// ============================================
// ENTITY CLASS
// ============================================
class Entity {
    constructor(x, y, symbol = '🧙') {
        this.x = x;
        this.y = y;
        // rotation: 0 = facing UP, π/2 = facing RIGHT, π = facing DOWN, -π/2 = facing LEFT
        this.rotation = 0;
        this.symbol = symbol;
        this.speed = 250;
        this.targetX = x;
        this.targetY = y;
        this.isMoving = false;

        this.createElement();
    }

    createElement() {
        this.element = document.createElement('div');
        this.element.className = 'entity';
        this.element.innerHTML = `
            ${this.symbol}
            <div class="entity-direction"></div>
            <div class="coord-axes">
                <div class="axis x-axis" style="transform: rotate(-90deg);">
                    <div class="axis-line"></div>
                    <div class="axis-arrow"></div>
                    <div class="axis-label">+X</div>
                    <div class="axis-ticks">
                        <div class="tick" style="left: 50px;"><span class="tick-label">50</span></div>
                        <div class="tick" style="left: 100px;"><span class="tick-label">100</span></div>
                    </div>
                </div>
                <div class="axis y-axis" style="transform: rotate(180deg);">
                    <div class="axis-line"></div>
                    <div class="axis-arrow"></div>
                    <div class="axis-label" style="transform: rotate(180deg); right: -28px; top: -8px;">+Y</div>
                    <div class="axis-ticks">
                        <div class="tick" style="left: 50px;"><span class="tick-label" style="transform: rotate(180deg) translateX(50%);">50</span></div>
                        <div class="tick" style="left: 100px;"><span class="tick-label" style="transform: rotate(180deg) translateX(50%);">100</span></div>
                    </div>
                </div>
            </div>
        `;
        playArea.appendChild(this.element);
        this.updateElement();
    }

    updateElement() {
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';
        // rotation = 0 means facing up, which matches the emoji's natural orientation
        this.element.style.transform = `translate(-50%, -50%) rotate(${this.rotation}rad)`;

        // Update coordinate display
        document.getElementById('playerPos').textContent =
            `(${Math.round(this.x)}, ${Math.round(this.y)})`;

        // Convert rotation to degrees, where 0° = up
        let degrees = Math.round(this.rotation * 180 / Math.PI);
        document.getElementById('playerAngle').textContent = `${degrees}°`;
    }

    moveTo(targetX, targetY) {
        this.targetX = targetX;
        this.targetY = targetY;
        // Calculate rotation where 0 = UP, positive = clockwise
        // atan2(dx, -dy) gives us: up=0, right=π/2, down=π, left=-π/2
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        this.rotation = Math.atan2(dx, -dy);
        this.isMoving = true;
        this.updateElement();
    }

    update(deltaTime) {
        if (!this.isMoving) return;

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const moveAmount = this.speed * deltaTime / 1000;

        if (dist <= moveAmount) {
            this.x = this.targetX;
            this.y = this.targetY;
            this.isMoving = false;
        } else {
            this.x += (dx / dist) * moveAmount;
            this.y += (dy / dist) * moveAmount;
        }
        this.updateElement();
    }

    /**
     * Convert local coordinates to world coordinates
     * Local: (0,0) = entity position
     * +X = forward (direction entity is facing)
     * +Y = left of forward direction
     *
     * When rotation = 0 (facing up):
     *   local (1, 0) -> world (0, -1) [up]
     *   local (0, 1) -> world (-1, 0) [left]
     */
    localToWorld(localX, localY) {
        const sin = Math.sin(this.rotation);
        const cos = Math.cos(this.rotation);
        return {
            x: this.x + localX * sin - localY * cos,
            y: this.y - localX * cos - localY * sin
        };
    }

    /**
     * 🔥 FIRE SPELL
     * Creates a fire at the relative position (x, y)
     */
    fire(x, y) {
        const world = this.localToWorld(x, y);
        createFire(world.x, world.y);
        console.log(`🔥 Fire cast at local (${x}, ${y}) → world (${Math.round(world.x)}, ${Math.round(world.y)})`);
        // fire has no onComplete; it's handled by the setTimeout(callback, 300) in the wrapper
    }

    /**
     * 💧 WATER SPELL
     * Creates an expanding water circle at relative position (x, y) with final radius r
     */
    water(x, y, r, onComplete) {
        const world = this.localToWorld(x, y);
        createWater(world.x, world.y, r, onComplete);  // pass onComplete down
        console.log(`💧 Water cast at local (${x}, ${y}) → world (${Math.round(world.x)}, ${Math.round(world.y)}) radius ${r}`);
    }

    /**
     * 💨 WIND SPELL
     * Creates a wind corridor from (x1, y1) to (x2, y2) with width w
     */
    wind(x1, y1, x2, y2, w, onComplete) {
        const start = this.localToWorld(x1, y1);
        const end = this.localToWorld(x2, y2);
        createWind(start.x, start.y, end.x, end.y, w, onComplete);  // pass onComplete down
        console.log(`💨 Wind cast from (${Math.round(start.x)}, ${Math.round(start.y)}) to (${Math.round(end.x)}, ${Math.round(end.y)}) width ${w}`);
    }
}

// ============================================
// FIRE SYSTEM
// ============================================
function createFire(x, y) {
    const el = document.createElement('div');
    el.className = 'fire';
    el.textContent = '🔥';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    playArea.appendChild(el);

    const fire = { x, y, element: el, radius: 20 };
    fires.push(fire);
    return fire;
}

function removeFire(fire) {
    const index = fires.indexOf(fire);
    if (index > -1) {
        fires.splice(index, 1);
        fire.element.style.transition = 'opacity 0.3s, transform 0.3s';
        fire.element.style.opacity = '0';
        fire.element.style.transform = 'translate(-50%, -50%) scale(0)';
        setTimeout(() => fire.element.remove(), 300);
        console.log('🔥 Fire extinguished!');
    }
}

// ============================================
// WATER SYSTEM
// ============================================
function createWater(x, y, finalRadius, onComplete) {
    let currentRadius = 0;
    let lastDrawnRadius = 0;
    const expandSpeed = 200; // pixels per second
    let lastTime = performance.now();

    function animate(currentTime) {
        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;

        currentRadius += expandSpeed * deltaTime / 1000;
        if (currentRadius > finalRadius) currentRadius = finalRadius;

        // Draw ring from lastDrawnRadius to currentRadius
        if (currentRadius > lastDrawnRadius) {
            // Main fill
            waterCtx.fillStyle = 'rgba(30, 144, 255, 0.35)';
            waterCtx.beginPath();
            waterCtx.arc(x, y, currentRadius, 0, Math.PI * 2);
            if (lastDrawnRadius > 0) {
                waterCtx.arc(x, y, lastDrawnRadius, 0, Math.PI * 2, true);
            }
            waterCtx.fill();

            // Outer glow ring
            waterCtx.strokeStyle = 'rgba(100, 180, 255, 0.5)';
            waterCtx.lineWidth = 3;
            waterCtx.beginPath();
            waterCtx.arc(x, y, currentRadius, 0, Math.PI * 2);
            waterCtx.stroke();

            lastDrawnRadius = currentRadius;
        }

        // Check fire collisions
        for (let i = fires.length - 1; i >= 0; i--) {
            const fire = fires[i];
            const dx = fire.x - x;
            const dy = fire.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < currentRadius + fire.radius * 0.5) {
                removeFire(fire);
            }
        }

        if (currentRadius < finalRadius) {
            requestAnimationFrame(animate);
        } else {
            // Animation complete — resume the interpreter
            if (onComplete) onComplete();
        }
    }

    requestAnimationFrame(animate);
}

// ============================================
// WIND SYSTEM
// ============================================
function createWind(x1, y1, x2, y2, width, onComplete) {
    const duration = 500; // ms for wind to travel
    const startTime = performance.now();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

    // Create wind visual element
    const windEl = document.createElement('div');
    windEl.className = 'wind-corridor';
    windEl.innerHTML = '<div class="wind-particles"></div>';
    windEl.style.left = x1 + 'px';
    windEl.style.top = y1 + 'px';
    windEl.style.width = '0px';
    windEl.style.height = width + 'px';
    windEl.style.transform = `translate(0, -50%) rotate(${angle}rad)`;
    windEl.style.background = 'linear-gradient(90deg, rgba(200, 230, 255, 0.4), rgba(200, 230, 255, 0.1))';
    windEl.style.borderRadius = (width / 2) + 'px';
    windEl.style.boxShadow = '0 0 30px rgba(200, 230, 255, 0.3)';
    playArea.appendChild(windEl);

    let lastProgress = 0;

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Update visual width
        windEl.style.width = (length * progress) + 'px';

        // Erode water incrementally
        if (progress > lastProgress) {
            erodeWater(x1, y1, angle, length * lastProgress, length * progress, width);
            lastProgress = progress;
        }

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Fade out and remove
            windEl.style.transition = 'opacity 0.3s';
            windEl.style.opacity = '0';
            setTimeout(() => {
                windEl.remove();
                // Resume the interpreter only after the fade-out too,
                // so the wind visually fully disappears before next spell.
                if (onComplete) onComplete();
            }, 300);
        }
    }

    requestAnimationFrame(animate);
}

function erodeWater(startX, startY, angle, startDist, endDist, width) {
    waterCtx.save();
    waterCtx.globalCompositeOperation = 'destination-out';

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x1 = startX + cos * startDist;
    const y1 = startY + sin * startDist;

    waterCtx.translate(x1, y1);
    waterCtx.rotate(angle);
    waterCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    waterCtx.fillRect(-2, -width / 2, endDist - startDist + 4, width);

    waterCtx.restore();
}

// ============================================
// PLAYER & GAME LOOP
// ============================================
const player = new Entity(
    window.innerWidth / 2,
    window.innerHeight / 2,
    '🧙'
);

// Click to move
playArea.addEventListener('click', (e) => {
    if (e.target === playArea || e.target === waterCanvas) {
        player.moveTo(e.clientX, e.clientY);
    }
});

// Game loop
let lastTime = performance.now();
function gameLoop(currentTime) {
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    player.update(deltaTime);

    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// ============================================
// EXPOSE TO CONSOLE
// ============================================
window.player = player;
window.fires = fires;

// Helper functions for testing
window.clearWater = () => {
    waterCtx.clearRect(0, 0, waterCanvas.width, waterCanvas.height);
    console.log('💧 All water cleared');
};

window.clearFires = () => {
    while (fires.length > 0) {
        removeFire(fires[0]);
    }
    console.log('🔥 All fires cleared');
};

// Welcome message
console.log('%c🔮 Magic System Ready!', 'font-size: 20px; color: #7dd3fc;');
console.log('%cAvailable commands:', 'font-size: 14px; color: #a3e635;');
console.log('  player.fire(x, y)              - Create fire');
console.log('  player.water(x, y, r)          - Create water puddle');
console.log('  player.wind(x1, y1, x2, y2, w) - Create wind corridor');
console.log('  clearWater()                   - Clear all water');
console.log('  clearFires()                   - Clear all fires');
console.log('%cCoordinate system: +X = forward (where wizard faces), +Y = left', 'color: #fbbf24;');
console.log('%cTry: player.fire(100, 0) to create fire ahead of the wizard!', 'color: #f97316;');