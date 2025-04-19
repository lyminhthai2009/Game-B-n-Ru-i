const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Configuration & Global State ---
const BASE_WIDTH = 480; // Kích thước gốc để tính scale
const BASE_HEIGHT = 640;
let scaleFactor = 1;
let canvasWidth = BASE_WIDTH;
let canvasHeight = BASE_HEIGHT;

let gameState = 'loading'; // 'loading', 'mainMenu', 'playing', 'gameOver', 'missionComplete'
let score = 0;
let highScore = 0;
let gameFrame = 0; // General frame counter

// Game Settings (sẽ lưu vào localStorage nếu cần)
let gameSettings = {
    difficulty: 'medium', // 'easy', 'medium', 'hard'
    selectedPlayerSkin: 'default', // Key của skin tàu
    selectedBulletSkin: 'default', // Key của skin đạn
    unlockedSkins: { // Theo dõi những gì đã mở khóa
        player: ['default'],
        bullet: ['default']
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
    player_default: { src: 'assets/player.png', img: new Image() },
    invader_basic: { src: 'assets/invader.png', img: new Image() },
    bullet_default: { src: 'assets/bullet.png', img: new Image() },
    explosion: { src: 'assets/explosion.png', img: new Image(), frames: 6, frameWidth: 32 }, // Giả sử ảnh nổ là sprite sheet
    background: { src: 'assets/background.png', img: new Image() } // Ví dụ ảnh nền
    // Thêm các skin khác vào đây: player_blue, bullet_fire, invader_strong,...
};

let assetsLoadedCount = 0;
let totalAssets = Object.keys(assets).length;

function loadAssets() {
    console.log("Loading assets...");
    for (const key in assets) {
        assets[key].img.onload = () => {
            assetsLoadedCount++;
            console.log(`Loaded: ${key} (${assetsLoadedCount}/${totalAssets})`);
            if (assetsLoadedCount === totalAssets) {
                console.log("All assets loaded!");
                // Load game settings và high score
                loadGameSettings();
                loadHighScore();
                // Thiết lập kích thước và UI ban đầu
                resizeCanvas(); // Quan trọng: gọi resize để tính scale và vị trí UI
                gameState = 'mainMenu'; // Bắt đầu ở menu chính
                requestAnimationFrame(gameLoop); // Bắt đầu vòng lặp game
            }
        };
        assets[key].img.onerror = () => {
            console.error(`Failed to load asset: ${key} at ${assets[key].src}`);
            // Có thể dừng game hoặc dùng fallback ở đây
            assetsLoadedCount++; // Vẫn tăng để tránh bị kẹt loading vô hạn
             if (assetsLoadedCount === totalAssets) {
                 // Vẫn tiếp tục nhưng có thể thiếu ảnh
                  loadGameSettings();
                  loadHighScore();
                  resizeCanvas();
                  gameState = 'mainMenu';
                  requestAnimationFrame(gameLoop);
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
            // Merge với default settings để đảm bảo có đủ key
             gameSettings = { ...gameSettings, ...parsed };
             // Đảm bảo unlockedSkins là object với các mảng
            if (!gameSettings.unlockedSkins || typeof gameSettings.unlockedSkins !== 'object') {
                 gameSettings.unlockedSkins = { player: ['default'], bullet: ['default'] };
            }
             if (!Array.isArray(gameSettings.unlockedSkins.player)) gameSettings.unlockedSkins.player = ['default'];
             if (!Array.isArray(gameSettings.unlockedSkins.bullet)) gameSettings.unlockedSkins.bullet = ['default'];

        } catch (e) {
            console.error("Failed to parse saved settings, using defaults.");
            // Giữ default settings nếu parse lỗi
        }
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

    // Ưu tiên chiều cao cho mobile portrait
    canvasHeight = windowHeight;
    canvasWidth = canvasHeight * aspectRatio;

    // Nếu quá rộng so với màn hình, tính lại theo chiều rộng
    if (canvasWidth > windowWidth) {
        canvasWidth = windowWidth;
        canvasHeight = canvasWidth / aspectRatio;
    }

    // Giảm kích thước một chút để không bị tràn viền hoàn toàn
    canvasWidth *= 0.98;
    canvasHeight *= 0.98;

    canvas.width = Math.floor(canvasWidth);
    canvas.height = Math.floor(canvasHeight);

    // Tính scale factor
    scaleFactor = canvas.height / BASE_HEIGHT; // Hoặc canvas.width / BASE_WIDTH

    // Cập nhật thông số game dựa trên độ khó và scale
    loadDifficultyParameters();

    // Thiết lập lại UI Elements cho màn hình hiện tại
    setupUIForState(gameState); // Quan trọng: UI cần được định vị lại sau resize
}

// --- Difficulty Management ---
function loadDifficultyParameters() {
    const preset = difficultyPresets[gameSettings.difficulty] || difficultyPresets.medium;
    for (const key in preset) {
        // Scale các giá trị không gian (tốc độ, khoảng cách)
        if (key.includes('SPEED') || key.includes('DROP')) {
             params[key] = preset[key] * scaleFactor;
        } else {
            params[key] = preset[key]; // Các giá trị khác (cooldown, probability) giữ nguyên
        }
    }
     console.log(`Difficulty: ${gameSettings.difficulty}`, params);
}


// --- UI System (Basic) ---
function setupUIForState(state) {
    uiElements = {}; // Xóa UI cũ
    const cx = canvas.width / 2; // Center X
    const cy = canvas.height / 2; // Center Y

    if (state === 'mainMenu') {
        // Tiêu đề
        uiElements.title = { type: 'text', x: cx, y: canvas.height * 0.15, text: 'SPACE INVADERS', font: `bold ${60 * scaleFactor}px Arial`, color: '#00FFFF', align: 'center' };
        // High Score
        uiElements.highScore = { type: 'text', x: cx, y: canvas.height * 0.25, text: `High Score: ${highScore}`, font: `${24 * scaleFactor}px Arial`, color: '#FFFF00', align: 'center' };

        // Nút Play
        uiElements.playButton = createButton(cx, cy - 50 * scaleFactor, 250 * scaleFactor, 70 * scaleFactor, 'CHƠI', '#4CAF50', () => {
            initializeGame();
            gameState = 'playing';
        });

        // Nhóm nút Độ khó
        const diffBtnWidth = 150 * scaleFactor;
        const diffBtnHeight = 50 * scaleFactor;
        const diffBtnY = cy + 50 * scaleFactor;
        const diffBtnSpacing = 20 * scaleFactor;
        const totalDiffWidth = diffBtnWidth * 3 + diffBtnSpacing * 2;
        let startX = cx - totalDiffWidth / 2 + diffBtnWidth / 2; // Căn giữa nút đầu tiên

        uiElements.easyBtn = createButton(startX, diffBtnY, diffBtnWidth, diffBtnHeight, 'Dễ', gameSettings.difficulty === 'easy' ? '#FFC107' : '#607D8B', () => { gameSettings.difficulty = 'easy'; saveGameSettings(); setupUIForState('mainMenu'); });
        startX += diffBtnWidth + diffBtnSpacing;
        uiElements.mediumBtn = createButton(startX, diffBtnY, diffBtnWidth, diffBtnHeight, 'Thường', gameSettings.difficulty === 'medium' ? '#FFC107' : '#607D8B', () => { gameSettings.difficulty = 'medium'; saveGameSettings(); setupUIForState('mainMenu'); });
        startX += diffBtnWidth + diffBtnSpacing;
        uiElements.hardBtn = createButton(startX, diffBtnY, diffBtnWidth, diffBtnHeight, 'Khó', gameSettings.difficulty === 'hard' ? '#FFC107' : '#607D8B', () => { gameSettings.difficulty = 'hard'; saveGameSettings(); setupUIForState('mainMenu'); });

        // Nút Chọn Skin (Ví dụ đơn giản)
        uiElements.skinButton = createButton(cx, cy + 150 * scaleFactor, 200 * scaleFactor, 50 * scaleFactor, 'Skins (TBD)', '#03A9F4', () => {
             console.log("Màn hình chọn Skin/Đạn chưa làm!");
             // Chuyển sang gameState 'skinSelection' nếu có
        });
         // Thêm các nút chọn đạn, nhiệm vụ tương tự...

    } else if (state === 'gameOver') {
         uiElements.title = { type: 'text', x: cx, y: cy - 80 * scaleFactor, text: 'GAME OVER', font: `bold ${70 * scaleFactor}px Arial`, color: '#FF0000', align: 'center' };
         uiElements.finalScore = { type: 'text', x: cx, y: cy, text: `Score: ${score}`, font: `${30 * scaleFactor}px Arial`, color: '#FFFFFF', align: 'center' };
         uiElements.highScore = { type: 'text', x: cx, y: cy + 40 * scaleFactor, text: `High Score: ${highScore}`, font: `${24 * scaleFactor}px Arial`, color: '#FFFF00', align: 'center' };
         uiElements.restartButton = createButton(cx, cy + 100 * scaleFactor, 250 * scaleFactor, 60 * scaleFactor, 'Chơi Lại', '#4CAF50', () => { gameState = 'mainMenu'; setupUIForState('mainMenu'); }); // Quay lại Menu

    } else if (state === 'playing') {
         // UI trong game (Score) - vẽ trực tiếp trong drawUI
    }
    // Thêm các state khác: 'win', 'paused', 'skinSelection'...
}

function createButton(x, y, width, height, text, color, onClick) {
    return {
        type: 'button',
        rect: { x: x - width / 2, y: y - height / 2, width: width, height: height }, // Lưu rect để dễ kiểm tra click
        text: text,
        color: color,
        hoverColor: lightenColor(color, 20), // Màu sáng hơn khi hover
        textColor: '#FFFFFF',
        font: `bold ${height * 0.4}px Arial`, // Font size dựa vào chiều cao nút
        onClick: onClick,
        isHovering: false // Trạng thái hover
    };
}

function drawUI() {
    for (const key in uiElements) {
        const el = uiElements[key];
        if (el.type === 'text') {
            ctx.fillStyle = el.color;
            ctx.font = el.font;
            ctx.textAlign = el.align || 'left';
            ctx.fillText(el.text, el.x, el.y);
        } else if (el.type === 'button') {
            // Vẽ nút
            ctx.fillStyle = el.isHovering ? el.hoverColor : el.color; // Đổi màu nếu hover
            ctx.fillRect(el.rect.x, el.rect.y, el.rect.width, el.rect.height);
            // Vẽ chữ trên nút
            ctx.fillStyle = el.textColor;
            ctx.font = el.font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(el.text, el.rect.x + el.rect.width / 2, el.rect.y + el.rect.height / 2);
        }
    }

    // Vẽ UI trong game (Score, Lives...)
    if (gameState === 'playing') {
        ctx.fillStyle = 'white';
        ctx.font = `${20 * scaleFactor}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Score: ${score}`, 10 * scaleFactor, 10 * scaleFactor);
        // Vẽ thêm mạng sống, loại đạn hiện tại...
    }
}

// --- Game Object Classes ---
class Player {
    constructor() {
        this.skin = assets[gameSettings.selectedPlayerSkin] || assets.player_default;
        this.width = (this.skin.img.width || 40) * scaleFactor * 0.8; // Scale và giảm nhẹ size
        this.height = (this.skin.img.height || 30) * scaleFactor * 0.8;
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - this.height - 30 * scaleFactor;
        this.speed = params.PLAYER_SPEED;
        this.shootTimer = 0;
        this.shootCooldown = params.PLAYER_SHOOT_COOLDOWN;
        this.bulletSkinKey = gameSettings.selectedBulletSkin; // Lưu key skin đạn
        this.alive = true;
    }

    draw() {
        if (!this.alive) return;
        ctx.drawImage(this.skin.img, this.x, this.y, this.width, this.height);
    }

    update() {
        if (!this.alive) return;
        // Movement
        if (keys['ArrowLeft'] || keys['KeyA']) this.move(-1);
        if (keys['ArrowRight'] || keys['KeyD']) this.move(1);

        // Shooting Cooldown
        if (this.shootTimer > 0) this.shootTimer--;

        // Shooting (Triggered by Space in input handler)
    }

    move(direction) {
        this.x += direction * this.speed;
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;
    }

    shoot() {
        if (this.shootTimer <= 0 && this.alive) {
            const bulletAsset = assets[this.bulletSkinKey] || assets.bullet_default;
            const bulletWidth = (bulletAsset.img.width || 5) * scaleFactor;
            const bulletHeight = (bulletAsset.img.height || 10) * scaleFactor;
            const bulletX = this.x + this.width / 2 - bulletWidth / 2;
            const bulletY = this.y;
            playerBullets.push(new Bullet(bulletX, bulletY, bulletWidth, bulletHeight, this.bulletSkinKey, -1)); // -1: up
            this.shootTimer = this.shootCooldown; // Reset cooldown
            // Play sound
        }
    }

    die() {
        this.alive = false;
        createExplosion(this.x + this.width / 2, this.y + this.height / 2);
        gameState = 'gameOver';
        saveHighScore();
        setupUIForState('gameOver');
        // Play sound
    }
}

class Invader {
     constructor(x, y, type = 'basic') { // Thêm type để có nhiều loại
        this.type = type;
        this.skin = assets[`invader_${type}`] || assets.invader_basic;
        this.width = (this.skin.img.width || 30) * scaleFactor * 0.9;
        this.height = (this.skin.img.height || 25) * scaleFactor * 0.9;
        this.x = x;
        this.y = y;
        this.alive = true;
        // Thêm máu, điểm khác nhau tùy type
        this.points = (type === 'strong') ? 50 : 10;
    }

    draw() {
       if (!this.alive) return;
       ctx.drawImage(this.skin.img, this.x, this.y, this.width, this.height);
    }

     update(dx, dy) { // Nhận giá trị di chuyển từ bên ngoài
         if (!this.alive) return;
         this.x += dx;
         this.y += dy;
     }

    shoot() {
        if (this.alive && Math.random() < params.INVADER_FIRE_PROBABILITY) {
             // Kẻ địch có thể dùng skin đạn riêng hoặc chung
            const bulletSkinKey = 'bullet_default'; // Hoặc 'bullet_invader'
            const bulletAsset = assets[bulletSkinKey];
             const bulletWidth = (bulletAsset.img.width || 5) * scaleFactor;
            const bulletHeight = (bulletAsset.img.height || 10) * scaleFactor;
            const bulletX = this.x + this.width / 2 - bulletWidth / 2;
            const bulletY = this.y + this.height;
            invaderBullets.push(new Bullet(bulletX, bulletY, bulletWidth, bulletHeight, bulletSkinKey, 1)); // 1: down
        }
    }

     die() {
         if (!this.alive) return;
         this.alive = false;
         score += this.points;
         createExplosion(this.x + this.width / 2, this.y + this.height / 2);
         // Play sound
     }
}

class Bullet {
    constructor(x, y, width, height, skinKey, direction) {
        this.skin = assets[skinKey] || assets.bullet_default;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.direction = direction; // -1 up, 1 down
        this.speed = (direction === -1 ? params.BULLET_SPEED : params.INVADER_BULLET_SPEED);
        this.active = true;
         // Thêm thuộc tính đạn khác: damage, piercing,...
    }

    draw() {
         if (!this.active) return;
         ctx.drawImage(this.skin.img, this.x, this.y, this.width, this.height);
    }

    update() {
        if (!this.active) return;
        this.y += this.direction * this.speed;
        // Check bounds
        if (this.y + this.height < 0 || this.y > canvas.height) {
            this.active = false;
        }
    }
}

class Explosion {
    constructor(x, y) {
        this.asset = assets.explosion;
        this.width = this.asset.frameWidth * scaleFactor * 1.5; // Nổ to hơn chút
        this.height = this.asset.frameWidth * scaleFactor * 1.5;
        this.x = x - this.width / 2;
        this.y = y - this.height / 2;
        this.totalFrames = this.asset.frames;
        this.currentFrame = 0;
        this.frameTimer = 0;
        this.frameDuration = 4; // Số frame game loop cho mỗi frame ảnh nổ
        this.active = true;
    }

    draw() {
        if (!this.active || !this.asset.img.complete) return;
        ctx.drawImage(
            this.asset.img,
            this.currentFrame * this.asset.frameWidth, // Source X
            0, // Source Y
            this.asset.frameWidth, // Source Width
            this.asset.frameWidth, // Source Height (giả sử vuông)
            this.x, this.y, // Dest X, Y
            this.width, this.height // Dest Width, Height
        );
    }

    update() {
        if (!this.active) return;
        this.frameTimer++;
        if (this.frameTimer >= this.frameDuration) {
            this.currentFrame++;
            this.frameTimer = 0;
            if (this.currentFrame >= this.totalFrames) {
                this.active = false; // Animation kết thúc
            }
        }
    }
}

function createExplosion(x, y) {
    explosions.push(new Explosion(x, y));
}

// --- Game Initialization & State Management ---
let invaderGrid = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    direction: 1,
    speedX: 0,
    needsDrop: false
};

function initializeGame() {
    // Reset core variables
    score = 0;
    gameFrame = 0;
    playerBullets = [];
    invaderBullets = [];
    explosions = [];
    invaders = [];

    // Load difficulty parameters for the current setting
    loadDifficultyParameters();

    // Create Player
    player = new Player();

    // Create Invaders and calculate grid bounds
    const invaderAsset = assets.invader_basic; // Hoặc chọn type ngẫu nhiên
    const invaderWidth = (invaderAsset.img.width || 30) * scaleFactor * 0.9;
    const invaderHeight = (invaderAsset.img.height || 25) * scaleFactor * 0.9;
    const spacingX = 40 * scaleFactor;
    const spacingY = 30 * scaleFactor;
    const rows = 4;
    const cols = 8;
    const totalGridWidth = cols * invaderWidth + (cols - 1) * spacingX;
    const startX = (canvas.width - totalGridWidth) / 2;
    const startY = 60 * scaleFactor;

    invaderGrid.x = startX;
    invaderGrid.y = startY;
    invaderGrid.width = totalGridWidth;
    invaderGrid.height = rows * invaderHeight + (rows - 1) * spacingY; // Ước tính chiều cao
    invaderGrid.direction = 1;
    invaderGrid.speedX = params.INVADER_SPEED_X;
    invaderGrid.needsDrop = false;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const invaderX = startX + col * (invaderWidth + spacingX);
            const invaderY = startY + row * (invaderHeight + spacingY);
            invaders.push(new Invader(invaderX, invaderY)); // Thêm type nếu cần
        }
    }

    // Setup UI for playing state
    setupUIForState('playing');
}

// --- Update Functions ---
function updateGameObjects() {
    player.update();

    // Update bullets and remove inactive ones
    playerBullets = playerBullets.filter(b => b.active);
    playerBullets.forEach(b => b.update());
    invaderBullets = invaderBullets.filter(b => b.active);
    invaderBullets.forEach(b => b.update());

    // Update explosions and remove inactive ones
    explosions = explosions.filter(e => e.active);
    explosions.forEach(e => e.update());

    // Update Invaders (Movement logic is now grid-based)
    updateInvaderGridMovement();
    invaders.forEach(invader => invader.shoot()); // Invaders bắn độc lập
}

function updateInvaderGridMovement() {
    if (invaders.length === 0) return; // Không còn gì để di chuyển

    let currentGridLeft = Infinity;
    let currentGridRight = -Infinity;
    let currentGridBottom = -Infinity;
    let activeInvaderExists = false;

    invaders.forEach(invader => {
        if (invader.alive) {
            activeInvaderExists = true;
            currentGridLeft = Math.min(currentGridLeft, invader.x);
            currentGridRight = Math.max(currentGridRight, invader.x + invader.width);
             currentGridBottom = Math.max(currentGridBottom, invader.y + invader.height);
        }
    });

     if (!activeInvaderExists) return; // Không còn invader nào sống

     invaderGrid.needsDrop = false; // Reset trạng thái drop

    // Kiểm tra chạm biên ngang
     if (invaderGrid.direction === 1 && currentGridRight + invaderGrid.speedX > canvas.width) {
        invaderGrid.direction = -1;
        invaderGrid.needsDrop = true;
    } else if (invaderGrid.direction === -1 && currentGridLeft + invaderGrid.speedX * invaderGrid.direction < 0) {
        invaderGrid.direction = 1;
        invaderGrid.needsDrop = true;
    }

    // Tính toán delta X, Y cho mỗi invader
    let dx = invaderGrid.needsDrop ? 0 : invaderGrid.speedX * invaderGrid.direction;
    let dy = invaderGrid.needsDrop ? params.INVADER_DROP_Y : 0;

    // Áp dụng di chuyển
    invaders.forEach(invader => {
         if (invader.alive) {
             invader.update(dx, dy);
         }
    });

     // Kiểm tra nếu quân xâm lược chạm người chơi sau khi di chuyển
     if (currentGridBottom + dy >= player.y && player.alive) {
         player.die();
     }
}

// --- Collision Detection ---
function checkCollisions() {
    if (!player.alive) return; // Không cần kiểm tra nếu player đã chết

    // Player bullets vs Invaders
    playerBullets.forEach(bullet => {
        if (!bullet.active) return;
        invaders.forEach(invader => {
            if (invader.alive && isColliding(bullet, invader)) {
                invader.die(); // Xử lý chết, cộng điểm, tạo nổ bên trong die()
                bullet.active = false; // Đạn biến mất
                // Thêm logic thưởng nếu cần (ví dụ: đếm combo)
                // Break không cần thiết vì 1 đạn có thể trúng nhiều (nếu là piercing)
            }
        });
    });

    // Invader bullets vs Player
    invaderBullets.forEach(bullet => {
        if (bullet.active && isColliding(bullet, player)) {
            bullet.active = false;
            player.die(); // Xử lý người chơi chết
        }
    });

     // (Optional) Player vs Invader (nếu muốn va chạm trực tiếp)
    invaders.forEach(invader => {
        if (invader.alive && isColliding(player, invader)) {
            invader.die(); // Kẻ địch cũng chết
            player.die();
        }
    });
}

// AABB Collision Check
function isColliding(rect1, rect2) {
     // Kiểm tra xem đối tượng có active/alive không trước khi gọi hàm này
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}

// --- Win Condition ---
function checkWinCondition() {
    // Thắng khi không còn invader nào sống
    if (invaders.every(invader => !invader.alive)) {
         if (gameState === 'playing') { // Chỉ chuyển state nếu đang chơi
            console.log("Player Wins!");
            gameState = 'win'; // Cần tạo màn hình 'win' tương tự 'gameOver'
            saveHighScore();
            setupUIForState('win'); // Thiết lập UI cho màn hình thắng
         }
    }
}


// --- Draw Functions ---
function drawGame() {
    // 1. Vẽ nền
    if (assets.background.img.complete) {
        ctx.drawImage(assets.background.img, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#000010'; // Nền đen xanh đậm
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Vẽ đối tượng game
    if(player) player.draw(); // Check if player exists
    invaders.forEach(i => i.draw());
    playerBullets.forEach(b => b.draw());
    invaderBullets.forEach(b => b.draw());
    explosions.forEach(e => e.draw());

    // 3. Vẽ UI trong game (Score, Lives, etc.)
    drawUI(); // drawUI sẽ tự kiểm tra gameState để vẽ đúng
}

// --- Input Handling ---
function handleInput(event) {
    let inputX, inputY, inputType;

    if (event.type.startsWith('touch')) {
        event.preventDefault(); // Ngăn hành vi mặc định (scroll, zoom)
        const touch = event.changedTouches[0]; // Lấy touch đầu tiên
        const rect = canvas.getBoundingClientRect();
        inputX = touch.clientX - rect.left;
        inputY = touch.clientY - rect.top;
        inputType = event.type; // 'touchstart', 'touchmove', 'touchend'

         if (inputType === 'touchstart') {
            touchPos = { x: inputX, y: inputY };
            touchHandled = false; // Đánh dấu có touch mới chưa xử lý
        } else if (inputType === 'touchend') {
            touchPos = null; // Xóa vị trí touch khi nhấc ngón tay
        }

    } else if (event.type.startsWith('mouse')) {
        const rect = canvas.getBoundingClientRect();
        inputX = event.clientX - rect.left;
        inputY = event.clientY - rect.top;
        inputType = event.type; // 'mousedown', 'mouseup', 'mousemove'

        // Cập nhật trạng thái hover cho nút
         if (gameState === 'mainMenu' || gameState === 'gameOver') { // Chỉ xử lý hover ở menu/gameover
            for (const key in uiElements) {
                if (uiElements[key].type === 'button') {
                    uiElements[key].isHovering = isClickInsideRect(inputX, inputY, uiElements[key].rect);
                }
            }
         }

         if (inputType === 'mousedown') {
            touchPos = { x: inputX, y: inputY }; // Giả lập touch khi click chuột
            touchHandled = false;
        } else if (inputType === 'mouseup') {
            touchPos = null;
        }

    } else if (event.type.startsWith('key')) {
        // Xử lý keydown/keyup đã có listener riêng
        // Xử lý bắn bằng Space
         if (event.type === 'keydown' && event.code === 'Space' && player && player.alive && gameState === 'playing') {
             player.shoot();
         }
          // Xử lý nhấn Enter/Space ở các màn hình khác để bắt đầu/chơi lại
          else if (event.type === 'keydown' && (event.code === 'Space' || event.code === 'Enter')) {
             if (gameState === 'mainMenu') {
                 // Tìm nút Play và kích hoạt (hoặc bắt đầu trực tiếp)
                 if (uiElements.playButton) uiElements.playButton.onClick();
             } else if (gameState === 'gameOver' || gameState === 'win') {
                 // Tìm nút Chơi Lại và kích hoạt
                  if (uiElements.restartButton) uiElements.restartButton.onClick();
             }
         }
        return; // Không cần xử lý thêm cho phím ở đây
    }

     // --- Xử lý click/touch trên UI ---
    if (!touchHandled && touchPos && (inputType === 'touchstart' || inputType === 'mousedown')) {
        let uiClicked = false;
         if (gameState === 'mainMenu' || gameState === 'gameOver') { // Chỉ xử lý click nút ở các màn hình này
             for (const key in uiElements) {
                const el = uiElements[key];
                if (el.type === 'button' && isClickInsideRect(touchPos.x, touchPos.y, el.rect)) {
                    console.log(`Button clicked: ${el.text}`);
                    if (el.onClick) {
                        el.onClick(); // Gọi hàm xử lý của nút
                        uiClicked = true;
                        break; // Chỉ xử lý 1 nút mỗi lần click
                    }
                }
            }
         }
        touchHandled = true; // Đánh dấu đã xử lý touch/click này
    }
}

function isClickInsideRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

// --- Helper Functions ---
function lightenColor(hex, percent) {
    hex = hex.replace(/^\s*#|\s*$/g, '');
    if (hex.length == 3) {
        hex = hex.replace(/(.)/g, '$1$1');
    }
    var r = parseInt(hex.substr(0, 2), 16),
        g = parseInt(hex.substr(2, 2), 16),
        b = parseInt(hex.substr(4, 2), 16);

    percent = Math.min(100, Math.max(-100, percent)); // Clamp percent

    r = Math.round(Math.min(255, Math.max(0, r * (1 + percent / 100))));
    g = Math.round(Math.min(255, Math.max(0, g * (1 + percent / 100))));
    b = Math.round(Math.min(255, Math.max(0, b * (1 + percent / 100))));

    return '#' + (r).toString(16).padStart(2, '0') +
                 (g).toString(16).padStart(2, '0') +
                 (b).toString(16).padStart(2, '0');
}


// --- Game Loop ---
function gameLoop(timestamp) {
    gameFrame++;

    // Xử lý logic dựa trên trạng thái
    switch (gameState) {
        case 'playing':
            updateGameObjects();
            checkCollisions();
            checkWinCondition(); // Kiểm tra thắng/thua sau khi update và va chạm
            break;
        case 'mainMenu':
        case 'gameOver':
        case 'win':
             // Chỉ xử lý input UI (đã xử lý qua event listener và handleInput)
             // Có thể thêm animation cho background menu ở đây
            break;
        // Các trạng thái khác (paused, skinSelection...)
    }

    // Vẽ mọi thứ
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Xóa toàn bộ canvas trước khi vẽ lại
    drawGame(); // Vẽ nền, đối tượng game, và UI

    // Yêu cầu frame tiếp theo
    requestAnimationFrame(gameLoop);
}

// --- Initialization ---
window.addEventListener('resize', resizeCanvas); // Lắng nghe thay đổi kích thước cửa sổ

// Setup input listeners
window.addEventListener('keydown', (e) => { keys[e.code] = true; handleInput(e); });
window.addEventListener('keyup', (e) => { keys[e.code] = false; handleInput(e); });
canvas.addEventListener('mousedown', handleInput);
canvas.addEventListener('mouseup', handleInput);
canvas.addEventListener('mousemove', handleInput); // Để xử lý hover
canvas.addEventListener('touchstart', handleInput);
canvas.addEventListener('touchend', handleInput);
canvas.addEventListener('touchcancel', handleInput); // Xử lý khi touch bị hủy


// Start loading assets, game loop starts after loading finishes
loadAssets();
