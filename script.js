const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Configuration & Global State ---
const BASE_WIDTH = 480; // Kích thước gốc để tính scale
const BASE_HEIGHT = 640;
let scaleFactor = 1;
let canvasWidth = BASE_WIDTH;
let canvasHeight = BASE_HEIGHT;

let gameState = 'loading'; // 'loading', 'mainMenu', 'playing', 'gameOver', 'win' // 'win' được thêm vào
let score = 0;
let highScore = 0;
let gameFrame = 0; // General frame counter

// Game Settings (sẽ lưu vào localStorage nếu cần)
let gameSettings = {
    difficulty: 'medium', // 'easy', 'medium', 'hard'
    selectedPlayerSkin: 'player_default', // Key của skin tàu
    selectedBulletSkin: 'bullet_default', // Key của skin đạn
    unlockedSkins: { // Theo dõi những gì đã mở khóa
        player: ['player_default'], // Đảm bảo default luôn có
        bullet: ['bullet_default']
    },
    soundEnabled: true // Ví dụ
};

// Game Objects
let player;
let invaders = [];
let playerBullets = [];
let invaderBullets = [];
let explosions = []; // Để vẽ hiệu ứng nổ
let uiElements = {}; // Chứa các nút, text... của UI hiện tại

// Input State
let keys = {};
let touchPos = null; // Lưu vị trí chạm cuối cùng
let touchHandled = true; // Đánh dấu đã xử lý touch chưa

// Difficulty Parameters (Sẽ được load dựa trên gameSettings.difficulty)
let params = {};

const difficultyPresets = {
    easy: { PLAYER_SPEED: 4, BULLET_SPEED: 6, INVADER_BULLET_SPEED: 3, PLAYER_SHOOT_COOLDOWN: 18, INVADER_FIRE_PROBABILITY: 0.002, INVADER_SPEED_X: 0.8, INVADER_DROP_Y: 12 },
    medium: { PLAYER_SPEED: 5, BULLET_SPEED: 7, INVADER_BULLET_SPEED: 4, PLAYER_SHOOT_COOLDOWN: 15, INVADER_FIRE_PROBABILITY: 0.003, INVADER_SPEED_X: 1, INVADER_DROP_Y: 15 },
    hard: { PLAYER_SPEED: 6, BULLET_SPEED: 8, INVADER_BULLET_SPEED: 5, PLAYER_SHOOT_COOLDOWN: 12, INVADER_FIRE_PROBABILITY: 0.005, INVADER_SPEED_X: 1.3, INVADER_DROP_Y: 18 }
};

// --- Asset Loading ---
const assets = {
    // Sử dụng tên file bạn cung cấp, liên kết với keys
    player_default: { src: 'assets/player.png', img: new Image() },
    invader_basic: { src: 'assets/invader.png', img: new Image() }, // Key này dùng cho Invader cơ bản
    bullet_default: { src: 'assets/bullet.png', img: new Image() },
    explosion: { src: 'assets/explosion.png', img: new Image(), frames: 6, frameWidth: 32 }, // Giả sử ảnh nổ là sprite sheet 6 frame, mỗi frame 32x32
    background: { src: 'assets/background.png', img: new Image() }
    // Thêm các skin khác vào đây nếu có (ví dụ: player_blue: { src: 'assets/player_blue.png', img: new Image() },)
};

let assetsLoadedCount = 0;
let totalAssets = Object.keys(assets).length;

function loadAssets() {
    console.log("Loading assets...");
    gameState = 'loading'; // Đặt trạng thái loading
    for (const key in assets) {
        assets[key].img.onload = () => {
            assetsLoadedCount++;
            console.log(`Loaded: ${key} (${assetsLoadedCount}/${totalAssets})`);
            if (assetsLoadedCount === totalAssets) {
                console.log("All assets loaded!");
                loadGameSettings();
                loadHighScore();
                resizeCanvas(); // Gọi resize sau khi load xong để tính toán ban đầu
                gameState = 'mainMenu'; // Chuyển sang menu chính
                // Không gọi gameLoop ở đây, nó sẽ được gọi ở dưới cùng
            }
        };
        assets[key].img.onerror = () => {
            console.error(`Failed to load asset: ${key} at ${assets[key].src}`);
            // Xử lý lỗi: có thể hiển thị thông báo lỗi trên canvas
            assetsLoadedCount++; // Vẫn tăng để tránh bị kẹt
             if (assetsLoadedCount === totalAssets) {
                  console.warn("Proceeding with missing assets.");
                  loadGameSettings();
                  loadHighScore();
                  resizeCanvas();
                  gameState = 'mainMenu';
             }
        };
        assets[key].img.src = assets[key].src;
    }
}

// --- Local Storage ---
function loadHighScore() {
    highScore = parseInt(localStorage.getItem('spaceInvadersHighScore') || '0', 10);
}
function saveHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('spaceInvadersHighScore', highScore.toString());
    }
}
function loadGameSettings() {
    const savedSettings = localStorage.getItem('spaceInvadersSettings');
    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            gameSettings = { ...gameSettings, ...parsed };
             // Đảm bảo unlockedSkins có cấu trúc đúng
             if (!gameSettings.unlockedSkins || typeof gameSettings.unlockedSkins !== 'object') {
                 gameSettings.unlockedSkins = { player: ['player_default'], bullet: ['bullet_default'] };
             }
             gameSettings.unlockedSkins.player = Array.isArray(gameSettings.unlockedSkins.player) ? [...new Set(['player_default', ...gameSettings.unlockedSkins.player])] : ['player_default'];
             gameSettings.unlockedSkins.bullet = Array.isArray(gameSettings.unlockedSkins.bullet) ? [...new Set(['bullet_default', ...gameSettings.unlockedSkins.bullet])] : ['bullet_default'];

        } catch (e) { console.error("Failed to parse saved settings.", e); }
    }
     console.log("Loaded settings:", gameSettings);
}
function saveGameSettings() {
    localStorage.setItem('spaceInvadersSettings', JSON.stringify(gameSettings));
     console.log("Saved settings:", gameSettings);
}

// --- Responsive Canvas & Scaling ---
function resizeCanvas() {
    const aspectRatio = BASE_WIDTH / BASE_HEIGHT;
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;

    canvasHeight = windowHeight;
    canvasWidth = canvasHeight * aspectRatio;

    if (canvasWidth > windowWidth) {
        canvasWidth = windowWidth;
        canvasHeight = canvasWidth / aspectRatio;
    }

    canvasWidth *= 0.98;
    canvasHeight *= 0.98;

    canvas.width = Math.floor(canvasWidth);
    canvas.height = Math.floor(canvasHeight);
    scaleFactor = canvas.height / BASE_HEIGHT;

    loadDifficultyParameters();
    setupUIForState(gameState); // Cập nhật UI sau khi resize
}

// --- Difficulty Management ---
function loadDifficultyParameters() {
    const preset = difficultyPresets[gameSettings.difficulty] || difficultyPresets.medium;
    for (const key in preset) {
        if (key.includes('SPEED') || key.includes('DROP')) {
             params[key] = preset[key] * scaleFactor;
        } else {
            params[key] = preset[key];
        }
    }
}

// --- UI System ---
function setupUIForState(state) {
    uiElements = {};
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    if (state === 'loading') {
         uiElements.loadingText = { type: 'text', x: cx, y: cy, text: 'Loading Assets...', font: `${30 * scaleFactor}px Arial`, color: '#FFFFFF', align: 'center' };
    } else if (state === 'mainMenu') {
        uiElements.title = { type: 'text', x: cx, y: canvas.height * 0.15, text: 'SPACE INVADERS', font: `bold ${60 * scaleFactor}px Arial`, color: '#00FFFF', align: 'center' };
        uiElements.highScore = { type: 'text', x: cx, y: canvas.height * 0.25, text: `High Score: ${highScore}`, font: `${24 * scaleFactor}px Arial`, color: '#FFFF00', align: 'center' };
        uiElements.playButton = createButton(cx, cy - 50 * scaleFactor, 250 * scaleFactor, 70 * scaleFactor, 'CHƠI', '#4CAF50', () => { initializeGame(); gameState = 'playing'; });

        const diffBtnWidth = 150 * scaleFactor;
        const diffBtnHeight = 50 * scaleFactor;
        const diffBtnY = cy + 50 * scaleFactor;
        const diffBtnSpacing = 20 * scaleFactor;
        const totalDiffWidth = diffBtnWidth * 3 + diffBtnSpacing * 2;
        let startX = cx - totalDiffWidth / 2 + diffBtnWidth / 2;

        uiElements.easyBtn = createButton(startX, diffBtnY, diffBtnWidth, diffBtnHeight, 'Dễ', gameSettings.difficulty === 'easy' ? '#FFC107' : '#607D8B', () => { gameSettings.difficulty = 'easy'; loadDifficultyParameters(); saveGameSettings(); setupUIForState('mainMenu'); });
        startX += diffBtnWidth + diffBtnSpacing;
        uiElements.mediumBtn = createButton(startX, diffBtnY, diffBtnWidth, diffBtnHeight, 'Thường', gameSettings.difficulty === 'medium' ? '#FFC107' : '#607D8B', () => { gameSettings.difficulty = 'medium'; loadDifficultyParameters(); saveGameSettings(); setupUIForState('mainMenu'); });
        startX += diffBtnWidth + diffBtnSpacing;
        uiElements.hardBtn = createButton(startX, diffBtnY, diffBtnWidth, diffBtnHeight, 'Khó', gameSettings.difficulty === 'hard' ? '#FFC107' : '#607D8B', () => { gameSettings.difficulty = 'hard'; loadDifficultyParameters(); saveGameSettings(); setupUIForState('mainMenu'); });

        // Thêm các nút khác (skins, options...) nếu muốn
        uiElements.skinButton = createButton(cx, cy + 150 * scaleFactor, 200 * scaleFactor, 50 * scaleFactor, 'Skins (TBD)', '#03A9F4', () => { console.log("Skin selection TBD"); });

    } else if (state === 'gameOver') {
         uiElements.title = { type: 'text', x: cx, y: cy - 80 * scaleFactor, text: 'GAME OVER', font: `bold ${70 * scaleFactor}px Arial`, color: '#FF0000', align: 'center' };
         uiElements.finalScore = { type: 'text', x: cx, y: cy, text: `Score: ${score}`, font: `${30 * scaleFactor}px Arial`, color: '#FFFFFF', align: 'center' };
         uiElements.highScore = { type: 'text', x: cx, y: cy + 40 * scaleFactor, text: `High Score: ${highScore}`, font: `${24 * scaleFactor}px Arial`, color: '#FFFF00', align: 'center' };
         uiElements.restartButton = createButton(cx, cy + 100 * scaleFactor, 250 * scaleFactor, 60 * scaleFactor, 'Menu Chính', '#4CAF50', () => { gameState = 'mainMenu'; setupUIForState('mainMenu'); });

    } else if (state === 'win') { // Thêm màn hình Win
         uiElements.title = { type: 'text', x: cx, y: cy - 80 * scaleFactor, text: 'YOU WIN!', font: `bold ${70 * scaleFactor}px Arial`, color: '#00FF00', align: 'center' };
         uiElements.finalScore = { type: 'text', x: cx, y: cy, text: `Score: ${score}`, font: `${30 * scaleFactor}px Arial`, color: '#FFFFFF', align: 'center' };
         uiElements.highScore = { type: 'text', x: cx, y: cy + 40 * scaleFactor, text: `High Score: ${highScore}`, font: `${24 * scaleFactor}px Arial`, color: '#FFFF00', align: 'center' };
         uiElements.restartButton = createButton(cx, cy + 100 * scaleFactor, 250 * scaleFactor, 60 * scaleFactor, 'Menu Chính', '#4CAF50', () => { gameState = 'mainMenu'; setupUIForState('mainMenu'); });
    }
}

function createButton(x, y, width, height, text, color, onClick) {
    return { type: 'button', rect: { x: x - width / 2, y: y - height / 2, width: width, height: height }, text: text, color: color, hoverColor: lightenColor(color, 20), textColor: '#FFFFFF', font: `bold ${height * 0.4}px Arial`, onClick: onClick, isHovering: false };
}

function drawUI() {
    // Vẽ background mờ cho các màn hình không phải playing
    if (gameState !== 'playing') {
         ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // Nền mờ
         ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    for (const key in uiElements) {
        const el = uiElements[key];
        ctx.save(); // Lưu trạng thái vẽ
        if (el.type === 'text') {
            ctx.fillStyle = el.color;
            ctx.font = el.font;
            ctx.textAlign = el.align || 'left';
            ctx.textBaseline = 'middle'; // Căn giữa theo chiều dọc tốt hơn
            ctx.fillText(el.text, el.x, el.y);
        } else if (el.type === 'button') {
            ctx.fillStyle = el.isHovering ? el.hoverColor : el.color;
            // Vẽ hình chữ nhật bo góc (trông đẹp hơn)
            fillRoundRect(ctx, el.rect.x, el.rect.y, el.rect.width, el.rect.height, 10 * scaleFactor); // Bo góc
            // ctx.fillRect(el.rect.x, el.rect.y, el.rect.width, el.rect.height); // Hình chữ nhật thường

            ctx.fillStyle = el.textColor;
            ctx.font = el.font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(el.text, el.rect.x + el.rect.width / 2, el.rect.y + el.rect.height / 2);
        }
        ctx.restore(); // Khôi phục trạng thái vẽ
    }

    // Vẽ UI trong game
    if (gameState === 'playing') {
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.font = `${20 * scaleFactor}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Score: ${score}`, 10 * scaleFactor, 10 * scaleFactor);
        // Ví dụ vẽ High Score ở góc trên bên phải
        ctx.textAlign = 'right';
        ctx.fillText(`Hi: ${highScore}`, canvas.width - 10 * scaleFactor, 10 * scaleFactor);
        ctx.restore();
    }
}

// Helper vẽ hình chữ nhật bo góc
function fillRoundRect(ctx, x, y, width, height, radius) {
  if (width < 2 * radius) radius = width / 2;
  if (height < 2 * radius) radius = height / 2;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y,   x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
}


// --- Game Object Classes ---
class Player {
    constructor() {
        // Chọn skin dựa trên setting, fallback về default
        this.skinKey = gameSettings.unlockedSkins.player.includes(gameSettings.selectedPlayerSkin) ? gameSettings.selectedPlayerSkin : 'player_default';
        this.skin = assets[this.skinKey];

        this.width = (this.skin.img.naturalWidth || 40) * scaleFactor * 0.8; // Dùng naturalWidth an toàn hơn
        this.height = (this.skin.img.naturalHeight || 30) * scaleFactor * 0.8;
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 30 * scaleFactor;
        this.speed = params.PLAYER_SPEED;
        this.shootTimer = 0;
        this.shootCooldown = params.PLAYER_SHOOT_COOLDOWN;
        this.bulletSkinKey = gameSettings.unlockedSkins.bullet.includes(gameSettings.selectedBulletSkin) ? gameSettings.selectedBulletSkin : 'bullet_default';
        this.alive = true;
    }
    draw() { if (this.alive) ctx.drawImage(this.skin.img, this.x, this.y, this.width, this.height); }
    update() {
        if (!this.alive) return;
        if (keys['ArrowLeft'] || keys['KeyA']) this.move(-1);
        if (keys['ArrowRight'] || keys['KeyD']) this.move(1);
        if (this.shootTimer > 0) this.shootTimer--;
    }
    move(direction) {
        this.x += direction * this.speed;
        this.x = Math.max(0, Math.min(this.x, canvas.width - this.width)); // Clamp position
    }
    shoot() {
        if (this.shootTimer <= 0 && this.alive) {
            const bulletAsset = assets[this.bulletSkinKey] || assets.bullet_default;
            const bulletWidth = (bulletAsset.img.naturalWidth || 5) * scaleFactor;
            const bulletHeight = (bulletAsset.img.naturalHeight || 10) * scaleFactor;
            const bulletX = this.x + this.width / 2 - bulletWidth / 2;
            const bulletY = this.y;
            playerBullets.push(new Bullet(bulletX, bulletY, bulletWidth, bulletHeight, this.bulletSkinKey, -1));
            this.shootTimer = this.shootCooldown;
        }
    }
    die() {
        if (!this.alive) return; // Tránh die nhiều lần
        this.alive = false;
        createExplosion(this.x + this.width / 2, this.y + this.height / 2);
        saveHighScore(); // Lưu điểm trước khi chuyển state
        gameState = 'gameOver';
        setupUIForState('gameOver');
    }
}

class Invader {
     constructor(x, y, type = 'basic') {
        this.type = type;
        this.skinKey = `invader_${type}`; // Key dựa trên type
        this.skin = assets[this.skinKey] || assets.invader_basic; // Fallback
        this.width = (this.skin.img.naturalWidth || 30) * scaleFactor * 0.9;
        this.height = (this.skin.img.naturalHeight || 25) * scaleFactor * 0.9;
        this.x = x;
        this.y = y;
        this.alive = true;
        this.points = (type === 'strong') ? 50 : 10; // Ví dụ điểm
    }
    draw() { if (this.alive) ctx.drawImage(this.skin.img, this.x, this.y, this.width, this.height); }
    update(dx, dy) { if (this.alive) { this.x += dx; this.y += dy; } }
    shoot() {
        if (this.alive && Math.random() < params.INVADER_FIRE_PROBABILITY) {
            const bulletSkinKey = 'bullet_default'; // Hoặc đạn riêng của invader
            const bulletAsset = assets[bulletSkinKey];
            const bulletWidth = (bulletAsset.img.naturalWidth || 5) * scaleFactor;
            const bulletHeight = (bulletAsset.img.naturalHeight || 10) * scaleFactor;
            const bulletX = this.x + this.width / 2 - bulletWidth / 2;
            const bulletY = this.y + this.height;
            invaderBullets.push(new Bullet(bulletX, bulletY, bulletWidth, bulletHeight, bulletSkinKey, 1));
        }
    }
     die() {
         if (!this.alive) return;
         this.alive = false;
         score += this.points;
         createExplosion(this.x + this.width / 2, this.y + this.height / 2);
     }
}

class Bullet {
    constructor(x, y, width, height, skinKey, direction) {
        this.skinKey = skinKey;
        this.skin = assets[this.skinKey] || assets.bullet_default; // Fallback
        this.x = x; this.y = y; this.width = width; this.height = height;
        this.direction = direction;
        this.speed = (direction === -1 ? params.BULLET_SPEED : params.INVADER_BULLET_SPEED);
        this.active = true;
    }
    draw() { if (this.active) ctx.drawImage(this.skin.img, this.x, this.y, this.width, this.height); }
    update() {
        if (!this.active) return;
        this.y += this.direction * this.speed;
        if (this.y + this.height < 0 || this.y > canvas.height) { this.active = false; }
    }
}

class Explosion {
    constructor(x, y) {
        this.asset = assets.explosion;
        // Đảm bảo asset tồn tại và có frameWidth
        if (!this.asset || !this.asset.frameWidth) {
            this.active = false;
            console.error("Explosion asset or frameWidth missing!");
            return;
        }
        this.frameWidth = this.asset.frameWidth;
        this.width = this.frameWidth * scaleFactor * 1.5;
        this.height = this.frameWidth * scaleFactor * 1.5; // Giả sử frame vuông
        this.x = x - this.width / 2;
        this.y = y - this.height / 2;
        this.totalFrames = this.asset.frames || 1; // Fallback 1 frame
        this.currentFrame = 0;
        this.frameTimer = 0;
        this.frameDuration = 4;
        this.active = true;
    }
    draw() {
        if (!this.active || !this.asset.img.complete) return;
        try {
            ctx.drawImage(
                this.asset.img,
                this.currentFrame * this.frameWidth, 0, this.frameWidth, this.frameWidth,
                this.x, this.y, this.width, this.height
            );
        } catch (e) {
            console.error("Error drawing explosion:", e, this);
            this.active = false; // Vô hiệu hóa nếu lỗi vẽ
        }
    }
    update() {
        if (!this.active) return;
        this.frameTimer++;
        if (this.frameTimer >= this.frameDuration) {
            this.currentFrame++;
            this.frameTimer = 0;
            if (this.currentFrame >= this.totalFrames) { this.active = false; }
        }
    }
}
function createExplosion(x, y) { explosions.push(new Explosion(x, y)); }

// --- Game Initialization & State Management ---
let invaderGrid = { x: 0, y: 0, width: 0, height: 0, direction: 1, speedX: 0, needsDrop: false };

function initializeGame() {
    score = 0; gameFrame = 0; playerBullets = []; invaderBullets = []; explosions = []; invaders = [];
    loadDifficultyParameters();
    player = new Player();

    const invaderAsset = assets.invader_basic; // Hoặc type khác
    const invaderWidth = (invaderAsset.img.naturalWidth || 30) * scaleFactor * 0.9;
    const invaderHeight = (invaderAsset.img.naturalHeight || 25) * scaleFactor * 0.9;
    const spacingX = 40 * scaleFactor; const spacingY = 30 * scaleFactor;
    const rows = 4; const cols = 8;
    const totalGridWidth = cols * invaderWidth + (cols - 1) * spacingX;
    const startX = (canvas.width - totalGridWidth) / 2;
    const startY = 60 * scaleFactor;

    invaderGrid = { x: startX, y: startY, width: totalGridWidth, height: rows * invaderHeight + (rows - 1) * spacingY, direction: 1, speedX: params.INVADER_SPEED_X, needsDrop: false };

    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        invaders.push(new Invader(startX + c * (invaderWidth + spacingX), startY + r * (invaderHeight + spacingY)));
    }
    setupUIForState('playing'); // UI cho màn hình chơi
}

// --- Update Functions ---
function updateGameObjects() {
    if(player) player.update();

    playerBullets = playerBullets.filter(b => b.active); playerBullets.forEach(b => b.update());
    invaderBullets = invaderBullets.filter(b => b.active); invaderBullets.forEach(b => b.update());
    explosions = explosions.filter(e => e.active); explosions.forEach(e => e.update());

    updateInvaderGridMovement();
    invaders.forEach(invader => invader.shoot());
}

function updateInvaderGridMovement() {
    const aliveInvaders = invaders.filter(i => i.alive);
    if (aliveInvaders.length === 0) return;

    let currentGridLeft = Math.min(...aliveInvaders.map(i => i.x));
    let currentGridRight = Math.max(...aliveInvaders.map(i => i.x + i.width));
    let currentGridBottom = Math.max(...aliveInvaders.map(i => i.y + i.height));

    invaderGrid.needsDrop = false;
    if (invaderGrid.direction === 1 && currentGridRight + invaderGrid.speedX > canvas.width) {
        invaderGrid.direction = -1; invaderGrid.needsDrop = true;
    } else if (invaderGrid.direction === -1 && currentGridLeft - invaderGrid.speedX < 0) {
        invaderGrid.direction = 1; invaderGrid.needsDrop = true;
    }

    let dx = invaderGrid.needsDrop ? 0 : invaderGrid.speedX * invaderGrid.direction;
    let dy = invaderGrid.needsDrop ? params.INVADER_DROP_Y : 0;

    invaders.forEach(invader => invader.update(dx, dy));

     // Kiểm tra chạm người chơi SAU KHI di chuyển xong frame này
     currentGridBottom += dy; // Cập nhật bottom sau khi rơi
     if (player && player.alive && currentGridBottom >= player.y) {
         player.die();
     }
}

// --- Collision Detection ---
function checkCollisions() {
    if (!player || !player.alive) return;

    playerBullets.forEach(bullet => {
        if (!bullet.active) return;
        invaders.forEach(invader => {
            if (invader.alive && isColliding(bullet, invader)) {
                invader.die(); bullet.active = false;
            }
        });
    });

    invaderBullets.forEach(bullet => {
        if (bullet.active && isColliding(bullet, player)) {
            bullet.active = false; player.die();
        }
    });

    invaders.forEach(invader => {
        if (invader.alive && isColliding(player, invader)) {
            invader.die(); player.die();
        }
    });
}

function isColliding(r1, r2) { return r1.x < r2.x + r2.width && r1.x + r1.width > r2.x && r1.y < r2.y + r2.height && r1.y + r1.height > r2.y; }

// --- Win Condition ---
function checkWinCondition() {
    if (gameState === 'playing' && invaders.every(invader => !invader.alive)) {
        console.log("Player Wins!");
        gameState = 'win';
        saveHighScore();
        setupUIForState('win');
    }
}

// --- Draw Functions ---
function drawGame() {
    // Nền
    if (assets.background.img.complete && assets.background.img.naturalWidth > 0) {
        ctx.drawImage(assets.background.img, 0, 0, canvas.width, canvas.height);
    } else { ctx.fillStyle = '#000010'; ctx.fillRect(0, 0, canvas.width, canvas.height); }

    // Đối tượng game
    if(player) player.draw();
    invaders.forEach(i => i.draw());
    playerBullets.forEach(b => b.draw());
    invaderBullets.forEach(b => b.draw());
    explosions.forEach(e => e.draw());

    // UI (Vẽ sau cùng để đè lên trên)
    drawUI();
}

// --- Input Handling ---
function handleInput(event) {
    let inputX, inputY, inputType;
    let isPrimaryAction = false; // Đánh dấu nếu là click/touch bắt đầu

    if (event.type.startsWith('touch')) {
        event.preventDefault();
        const touch = event.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        inputX = touch.clientX - rect.left;
        inputY = touch.clientY - rect.top;
        inputType = event.type;
        if (inputType === 'touchstart') { touchPos = { x: inputX, y: inputY }; touchHandled = false; isPrimaryAction = true; }
        else if (inputType === 'touchend') { touchPos = null; }
    } else if (event.type.startsWith('mouse')) {
        const rect = canvas.getBoundingClientRect();
        inputX = event.clientX - rect.left;
        inputY = event.clientY - rect.top;
        inputType = event.type;

        // Cập nhật hover
        let isHoveringAnyButton = false;
        if (gameState === 'mainMenu' || gameState === 'gameOver' || gameState === 'win') {
             for (const key in uiElements) {
                 if (uiElements[key].type === 'button') {
                    const hovering = isClickInsideRect(inputX, inputY, uiElements[key].rect);
                    if(uiElements[key].isHovering !== hovering) { // Chỉ cập nhật nếu trạng thái hover thay đổi
                         uiElements[key].isHovering = hovering;
                    }
                    if(hovering) isHoveringAnyButton = true;
                 }
             }
        }
         // Đặt lại cursor
        canvas.style.cursor = isHoveringAnyButton ? 'pointer' : 'crosshair';


        if (inputType === 'mousedown') { touchPos = { x: inputX, y: inputY }; touchHandled = false; isPrimaryAction = true; }
        else if (inputType === 'mouseup') { touchPos = null; }
    } else if (event.type.startsWith('key')) {
        if (event.type === 'keydown') {
            keys[event.code] = true;
            if (event.code === 'Space') {
                event.preventDefault(); // Ngăn Space cuộn trang
                if (player && player.alive && gameState === 'playing') { player.shoot(); }
                 else if (gameState === 'mainMenu' || gameState === 'gameOver' || gameState === 'win') {
                     // Tìm nút mặc định để kích hoạt (ví dụ: Play hoặc Restart)
                      const defaultButtonKey = gameState === 'mainMenu' ? 'playButton' : 'restartButton';
                      if (uiElements[defaultButtonKey] && uiElements[defaultButtonKey].onClick) {
                         uiElements[defaultButtonKey].onClick();
                         isPrimaryAction = true; // Coi như là hành động chính
                      }
                 }
            }
             // Có thể thêm Enter như Space
             else if (event.code === 'Enter') {
                  if (gameState === 'mainMenu' || gameState === 'gameOver' || gameState === 'win') {
                      const defaultButtonKey = gameState === 'mainMenu' ? 'playButton' : 'restartButton';
                      if (uiElements[defaultButtonKey] && uiElements[defaultButtonKey].onClick) {
                         uiElements[defaultButtonKey].onClick();
                         isPrimaryAction = true;
                      }
                 }
             }
        } else if (event.type === 'keyup') {
            keys[event.code] = false;
        }
        return; // Không cần xử lý thêm
    }

    // Xử lý click/touch trên UI chỉ khi bắt đầu chạm/click
    if (isPrimaryAction && !touchHandled && touchPos) {
        let uiClickedHandled = false;
        if (gameState === 'mainMenu' || gameState === 'gameOver' || gameState === 'win') {
             for (const key in uiElements) {
                const el = uiElements[key];
                if (el.type === 'button' && isClickInsideRect(touchPos.x, touchPos.y, el.rect)) {
                    if (el.onClick) { el.onClick(); uiClickedHandled = true; break; }
                }
            }
         }
        touchHandled = true; // Đánh dấu đã xử lý, dù có click trúng nút hay không
    }
}
function isClickInsideRect(x, y, rect) { return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height; }

// --- Game Loop ---
function gameLoop(timestamp) {
    gameFrame++;

    // Cập nhật trạng thái game
    switch (gameState) {
        case 'playing':
            updateGameObjects();
            checkCollisions();
            checkWinCondition();
            break;
        // Các trạng thái khác không cần update logic game phức tạp
    }

    // Vẽ lại màn hình
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGame(); // Hàm này sẽ vẽ nền, đối tượng và UI phù hợp với gameState

    // Lặp lại
    requestAnimationFrame(gameLoop);
}

// --- Initialization ---
window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', () => {
    // Gọi loadAssets sau khi trang đã tải xong hoàn toàn (bao gồm cả DOM)
    // Điều này đảm bảo canvas đã sẵn sàng
    loadAssets();
    // Game loop sẽ bắt đầu bên trong loadAssets khi tải xong
});

// Setup input listeners (nên đặt sau khi DOM sẵn sàng, nhưng đặt ở đây cũng thường ổn)
window.addEventListener('keydown', handleInput);
window.addEventListener('keyup', handleInput);
canvas.addEventListener('mousedown', handleInput);
canvas.addEventListener('mouseup', handleInput);
canvas.addEventListener('mousemove', handleInput);
canvas.addEventListener('touchstart', handleInput, { passive: false }); // passive: false để preventDefault hoạt động
canvas.addEventListener('touchend', handleInput);
canvas.addEventListener('touchcancel', handleInput);
