import Phaser from 'phaser';
import { Player } from '../entities/Player.js';
import { BOMB_TYPE_POOL, BOMB_TYPES, Bomb } from '../entities/Bomb.js';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export class ArenaScene extends Phaser.Scene {
  constructor({ players, mode, arena, quality, sounds, onToast, onFinish, onReady, onPause }) {
    super('ArenaScene');
    this.initialPlayers = players; this.mode = mode; this.arena = arena; this.quality = quality; this.sounds = sounds;
    this.isSoloAIMatch = players.length === 2 &&
      players.some(player => player.inputType === 'ai') &&
      players.some(player => player.inputType !== 'ai');
    this.onToast = onToast; this.onFinish = onFinish; this.onReady = onReady; this.onPause = onPause;
    this.players = new Map(); this.bombs = new Map(); this.heldBombs = new Map(); this.heldBombTypes = new Map();
    this.elapsed = 0; this.finished = false; this.matchStarted = false; this.nextBombGrowthAt = 15000;
    this.nextShieldAt = 20000; this.shieldPickup = null; this.shieldPickupExpiresAt = 0;
    this.nextZoneWarningAt = 17000; this.nextZoneCycleAt = 20000; this.zoneScale = 1; this.zoneCycleActive = false;
    this.gamepadEdges = new Map(); this.pauseGamepadEdges = new Map(); this.aiActionTimes = new Map(); this.keyboardEdges = { jump: false, pick: false, throw: false };
  }

  create() {
    this.arenaPolygon = new Phaser.Geom.Polygon(this.arena.floorPoints);
    this.pendingBombSpawns = 0;
    this.drawArena();
    this.createObstacles();
    this.decorateArena();
    const spawnPoints = [{ x: 300, y: 250 }, { x: 500, y: 250 }, { x: 355, y: 350 }, { x: 445, y: 350 }];
    this.initialPlayers.forEach((data, index) => {
      const spawn = spawnPoints[index]; const player = new Player(this, data.id, data.name, data.skin, spawn.x, spawn.y, true);
      player.inputType = data.inputType; player.gamepadIndex = data.gamepadIndex; player.playerNumber = index + 1; this.players.set(player.id, player);
      if (player.inputType === 'ai') player.trajectoryGraphics = this.add.graphics().setDepth(1000).setVisible(false);
    });
    this.keyboard = this.input.keyboard; this.keys = this.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,E,Q');
    this.physics.world.setBounds(30, 90, 740, 400);
    this.input.keyboard.on('keydown-ESC', event => {
      event.preventDefault();
      if (this.matchStarted) this.onPause?.();
    });
    this.createAmbientEffects();
    this.onReady?.(this);
  }

  startMatch() {
    if (this.matchStarted || this.finished) return;
    this.matchStarted = true;
    this.ensureBombPopulation();
  }

  drawArena() {
    const g = this.add.graphics(); const c = this.arena.colors;
    g.fillGradientStyle(c.sky[0], c.sky[0], c.sky[1], c.sky[1], 1); g.fillRect(0, 0, 800, 520);
    this.drawBackdrop(g);
    const shadowPoints = this.arena.floorPoints.map(point => ({ x: point.x, y: point.y + 15 }));
    g.fillStyle(c.shadow, 1); g.fillPoints(shadowPoints, true);
    g.fillStyle(c.floor, 1); g.fillPoints(this.arena.floorPoints, true);
    const center = { x: 400, y: 300 };
    const accent = Phaser.Display.Color.HexStringToColor(c.accent).color;
    g.fillStyle(accent, .035); g.fillPoints(this.arena.floorPoints, true);
    this.drawFloorTexture(g);
    g.lineStyle(18, accent, .11); g.strokePoints(this.arena.floorPoints, true);
    g.lineStyle(8, c.edge, 1); g.strokePoints(this.arena.floorPoints, true);
    const insetPoints = this.arena.floorPoints.map(point => ({
      x: center.x + (point.x - center.x) * .95,
      y: center.y + (point.y - center.y) * .94
    }));
    g.lineStyle(2, accent, .24);
    g.strokePoints(insetPoints, true);
    this.zoneGraphics = this.add.graphics().setDepth(4);
    this.zoneCenter = { x: 400, y: 300 };
    this.updateZoneGeometry();
  }

  updateZoneGeometry() {
    const points = this.arena.floorPoints.map(point => ({
      x: this.zoneCenter.x + (point.x - this.zoneCenter.x) * this.zoneScale,
      y: this.zoneCenter.y + (point.y - this.zoneCenter.y) * this.zoneScale
    }));
    this.arenaPolygon.setTo(points);
    if (!this.zoneGraphics) return;
    const graphics = this.zoneGraphics;
    graphics.clear();
    if (this.zoneScale < .999) {
      graphics.fillStyle(0x11101b, .52);
      this.arena.floorPoints.forEach((point, index) => {
        const next = (index + 1) % points.length;
        graphics.fillPoints([point, this.arena.floorPoints[next], points[next], points[index]], true);
      });
    }
    graphics.lineStyle(16, 0xff523e, .18);
    graphics.strokePoints(points, true);
    graphics.lineStyle(4, 0xffb05c, .9);
    graphics.strokePoints(points, true);
    graphics.lineStyle(1, 0xffe6a8, .9);
    graphics.strokePoints(points, true);
  }

  keepPlayersInsideZone() {
    for (const player of this.players.values()) {
      if (!player.alive || this.isInsideArena(player.x, player.y)) continue;
      let destination = this.findNearestArenaPoint(player.x, player.y);
      if (!destination) destination = { ...this.zoneCenter };
      player.body.setPosition(destination.x, destination.y);
      player.vz = 0;
      player.z = 0;
      player.updateDepth();
    }
  }

  findNearestArenaPoint(originX, originY) {
    let destination = null;
    let nearestDistance = Infinity;
    for (let y = 100; y <= 490; y += 8) {
      for (let x = 35; x <= 765; x += 8) {
        if (!this.isInsideArena(x, y)) continue;
        const clearOfObstacle = this.obstacles.every(obstacle =>
          Phaser.Math.Distance.Between(x, y, obstacle.x, obstacle.y) > obstacle.radius + 16
        );
        if (!clearOfObstacle) continue;
        const distance = Phaser.Math.Distance.Between(x, y, originX, originY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          destination = { x, y };
        }
      }
    }
    return destination;
  }

  keepBombsInsideZone() {
    for (const [id, bomb] of this.bombs) {
      if (this.isInsideArena(bomb.x, bomb.y)) continue;
      const point = this.randomArenaPoint();
      if (!point) {
        bomb.destroy();
        this.bombs.delete(id);
      } else {
        bomb.setPosition(point.x, point.y);
        bomb.vx = 0;
        bomb.vy = 0;
      }
    }
    this.ensureBombPopulation();
  }

  startZoneCycle() {
    if (this.zoneCycleActive || this.finished) return;
    this.zoneCycleActive = true;
    this.nextZoneCycleAt += 20000;
    this.nextZoneWarningAt = this.nextZoneCycleAt - 3000;
    this.onToast('¡La zona se cierra! Los obstáculos cambiarán de lugar.');
    this.repositionObstacles();
    this.tweens.addCounter({
      from: this.zoneScale,
      to: .48,
      duration: 4800,
      ease: 'Sine.easeInOut',
      onUpdate: tween => {
        this.zoneScale = tween.getValue();
        this.updateZoneGeometry();
        this.keepPlayersInsideZone();
        this.keepBombsInsideZone();
      },
      onComplete: () => {
        this.onToast('¡Zona al mínimo! Prepárate para que vuelva a abrirse.');
        this.time.delayedCall(1000, () => {
        this.tweens.addCounter({
          from: this.zoneScale,
          to: 1,
          duration: 4800,
          ease: 'Sine.easeInOut',
          onUpdate: tween => {
            this.zoneScale = tween.getValue();
            this.updateZoneGeometry();
            this.keepPlayersInsideZone();
            this.keepBombsInsideZone();
          },
          onComplete: () => {
            this.zoneCycleActive = false;
            this.updateZoneGeometry();
            this.keepPlayersInsideZone();
            this.onToast('La zona volvió a su tamaño original.');
          }
        });
        });
      }
    });
  }

  drawBackdrop(g) {
    if (this.arena.id === 'laguna') {
      g.fillStyle(0x80f4e8, .14); g.fillCircle(680, 65, 96);
      g.fillStyle(0xb7fff2, .08); g.fillCircle(680, 65, 128);
      g.fillStyle(0x574b3e, .82); g.fillTriangle(0, 137, 125, 38, 250, 137); g.fillTriangle(548, 136, 687, 28, 800, 138);
      g.fillStyle(0x81705a, .72); g.fillTriangle(20, 138, 139, 62, 250, 138); g.fillTriangle(548, 137, 702, 48, 786, 137);
      g.fillStyle(0x3e5540, .9); g.fillTriangle(0, 153, 94, 92, 178, 153); g.fillTriangle(620, 153, 715, 86, 800, 153);
      this.drawTree(g, 9, 160, .78); this.drawTree(g, 34, 178, .6); this.drawTree(g, 768, 174, .72); this.drawTree(g, 790, 155, .88);
      for (let row = 0; row < 3; row++) {
        const y = 44 + row * 22;
        g.lineStyle(2, 0xaffff0, .13);
        g.strokePoints([{ x: 0, y }, { x: 75, y: y - 6 }, { x: 156, y: y + 2 }, { x: 235, y: y - 5 }], false);
        g.strokePoints([{ x: 570, y: y + 8 }, { x: 648, y: y + 1 }, { x: 729, y: y + 9 }, { x: 800, y: y + 3 }], false);
      }
    } else if (this.arena.id === 'volcan') {
      g.fillStyle(0xff592c, .1); g.fillCircle(400, 70, 165);
      g.fillStyle(0xffa247, .18); g.fillCircle(400, 70, 82);
      g.fillStyle(0x301b32, .82); g.fillTriangle(0, 148, 105, 37, 246, 148); g.fillTriangle(547, 148, 697, 22, 800, 148);
      g.fillStyle(0x542632, .88); g.fillTriangle(0, 178, 75, 103, 169, 178); g.fillTriangle(637, 178, 746, 88, 800, 178);
      g.fillStyle(0x211522, .95); g.fillTriangle(350, 139, 400, 54, 450, 139);
      g.fillStyle(0xff713b, .8); g.fillTriangle(386, 112, 400, 67, 414, 112);
      g.fillStyle(0xffa247, .5); g.fillEllipse(400, 114, 94, 13);
      g.fillStyle(0x211522, .9); g.fillRect(45, 154, 96, 38); g.fillRect(659, 151, 96, 40);
      g.fillStyle(0xff542f, .8); g.fillRect(76, 154, 9, 39); g.fillRect(712, 151, 9, 41);
      g.fillStyle(0x702c31, .75);
      g.fillTriangle(97, 150, 124, 114, 151, 150); g.fillTriangle(648, 150, 682, 110, 709, 150);
      g.lineStyle(3, 0xff713b, .65);
      g.strokeLineShape(new Phaser.Geom.Line(54, 194, 84, 166)).strokeLineShape(new Phaser.Geom.Line(84, 166, 94, 179));
      g.strokeLineShape(new Phaser.Geom.Line(717, 195, 744, 156)).strokeLineShape(new Phaser.Geom.Line(744, 156, 760, 169));
      g.lineStyle(2, 0xffa247, .48);
      g.strokePoints([{ x: 16, y: 205 }, { x: 37, y: 198 }, { x: 48, y: 208 }, { x: 67, y: 201 }], false);
      g.strokePoints([{ x: 740, y: 208 }, { x: 756, y: 201 }, { x: 772, y: 211 }, { x: 793, y: 203 }], false);
    } else {
      g.fillStyle(0x8795ff, .16); g.fillCircle(670, 46, 34);
      g.fillStyle(0xe4eeff, .32); g.fillCircle(670, 46, 22);
      g.fillStyle(0x11182f, .9);
      [[0, 54, 76, 95], [80, 32, 56, 117], [137, 67, 82, 82], [600, 47, 74, 105], [683, 25, 65, 128], [751, 63, 49, 90]].forEach(([x, y, width, height]) => {
        g.fillRect(x, y, width, height);
        g.lineStyle(1, 0x74f7ff, .22); g.strokeRect(x + 3, y + 3, width - 6, height - 6);
      });
      for (let row = 0; row < 4; row++) {
        for (const column of [12, 31, 51, 618, 640, 661, 699, 718, 770, 786]) {
          g.fillStyle((row + column) % 3 === 0 ? 0xf566ff : 0x71f8ff, .4);
          g.fillRect(column, 38 + row * 17, 4, 6);
        }
      }
      g.lineStyle(2, 0x78edff, .25);
      g.strokeLineShape(new Phaser.Geom.Line(0, 149, 800, 149));
    }
  }

  drawTree(g, x, y, scale) {
    const trunkWidth = 9 * scale;
    const trunkHeight = 38 * scale;
    g.fillStyle(0x4c3826, .95);
    g.fillRect(x - trunkWidth / 2, y - trunkHeight, trunkWidth, trunkHeight);
    g.fillStyle(0x3a7f45, .98);
    g.fillTriangle(x, y - 82 * scale, x - 24 * scale, y - 27 * scale, x + 24 * scale, y - 27 * scale);
    g.fillStyle(0x53a94e, .98);
    g.fillTriangle(x, y - 67 * scale, x - 21 * scale, y - 16 * scale, x + 21 * scale, y - 16 * scale);
    g.fillStyle(0x75bd55, .8);
    g.fillTriangle(x, y - 51 * scale, x - 16 * scale, y - 8 * scale, x + 16 * scale, y - 8 * scale);
  }

  drawFloorTexture(g) {
    const contains = (x, y) => Phaser.Geom.Polygon.Contains(this.arenaPolygon, x, y);
    if (this.arena.id === 'laguna') {
      for (let y = 130; y < 475; y += 27) {
        for (let x = 35; x < 765; x += 38) {
          if (!contains(x, y)) continue;
          g.fillStyle((x + y) % 4 === 0 ? 0xc3fff0 : 0x123d54, .08);
          g.fillEllipse(x, y, 22, 8);
        }
      }
      g.lineStyle(2, 0xc1fff0, .1);
      for (const [x, y] of [[145, 194], [635, 204], [176, 388], [605, 408], [388, 150]]) {
        if (contains(x, y)) {
          g.strokeCircle(x, y, 19); g.strokeCircle(x, y, 27);
        }
      }
      g.lineStyle(2, 0xd7fff7, .08);
      for (let x = 105; x < 740; x += 90) {
        if (contains(x, 245) && contains(x + 34, 245)) g.strokeLineShape(new Phaser.Geom.Line(x, 245, x + 34, 245));
      }
    } else if (this.arena.id === 'volcan') {
      for (let index = 0; index < 32; index++) {
        const x = 51 + ((index * 137) % 698);
        const y = 118 + ((index * 83) % 347);
        if (!contains(x, y)) continue;
        g.fillStyle(index % 3 === 0 ? 0x190f1d : 0x301924, .18);
        g.fillCircle(x, y, 4 + (index % 5));
      }
      const fissures = [[{ x: 126, y: 245 }, { x: 147, y: 258 }, { x: 161, y: 251 }], [{ x: 622, y: 273 }, { x: 640, y: 285 }, { x: 659, y: 278 }], [{ x: 300, y: 431 }, { x: 319, y: 418 }, { x: 335, y: 429 }], [{ x: 472, y: 175 }, { x: 489, y: 187 }, { x: 510, y: 177 }]];
      for (const points of fissures) {
        if (!points.every(point => contains(point.x, point.y))) continue;
        g.lineStyle(5, 0xff5d32, .18); g.strokePoints(points, false);
        g.lineStyle(2, 0xffc05c, .55); g.strokePoints(points, false);
      }
      g.lineStyle(1, 0xffd074, .1);
      for (const [x, y, radius] of [[122, 316, 17], [665, 352, 19], [312, 156, 13], [484, 439, 15]]) {
        if (contains(x, y)) g.strokeCircle(x, y, radius);
      }
    } else {
      for (let y = 112; y < 476; y += 32) {
        for (let x = 76; x < 738; x += 42) {
          if (!contains(x + 19, y + 14)) continue;
          g.fillStyle((Math.floor(x / 42) + Math.floor(y / 32)) % 2 ? 0x92fbff : 0xa57aff, .035);
          g.fillRoundedRect(x, y, 38, 27, 4);
        }
      }
      g.lineStyle(1, 0x82faff, .12);
      for (let x = 82; x < 730; x += 42) {
        const top = contains(x, 108); const bottom = contains(x, 474);
        if (top && bottom) g.lineBetween(x, 108, x, 474);
      }
      for (let y = 116; y < 470; y += 32) {
        const left = contains(68, y); const right = contains(732, y);
        if (left && right) g.lineBetween(68, y, 732, y);
      }
      g.lineStyle(2, 0xec7cff, .17);
      for (const [x, y] of [[158, 197], [644, 202], [160, 390], [642, 387]]) {
        if (contains(x, y)) {
          g.strokeCircle(x, y, 27); g.strokeCircle(x, y, 33);
        }
      }
    }
  }

  createObstacles() {
    const layouts = {
      laguna: [{ x: 400, y: 300, radius: 34 }, { x: 275, y: 350, radius: 23 }, { x: 560, y: 330, radius: 23 }, { x: 205, y: 260, radius: 25 }, { x: 638, y: 246, radius: 25 }, { x: 350, y: 185, radius: 22 }],
      volcan: [{ x: 400, y: 300, radius: 38 }, { x: 250, y: 270, radius: 24 }, { x: 550, y: 360, radius: 24 }, { x: 180, y: 350, radius: 26 }, { x: 620, y: 245, radius: 28 }, { x: 390, y: 410, radius: 24 }],
      neon: [{ x: 400, y: 290, radius: 35 }, { x: 245, y: 300, radius: 25 }, { x: 555, y: 300, radius: 25 }, { x: 165, y: 225, radius: 24 }, { x: 635, y: 225, radius: 24 }, { x: 400, y: 400, radius: 25 }]
    };
    const spawnPoints = [{ x: 300, y: 250 }, { x: 500, y: 250 }, { x: 355, y: 350 }, { x: 445, y: 350 }];
    const candidates = Phaser.Utils.Array.Shuffle([...layouts[this.arena.id]]);
    this.obstacles = [];
    for (const candidate of candidates) {
      const clearOfSpawns = spawnPoints.every(spawn => Phaser.Math.Distance.Between(candidate.x, candidate.y, spawn.x, spawn.y) > candidate.radius + 35);
      const clearOfObstacles = this.obstacles.every(obstacle => Phaser.Math.Distance.Between(candidate.x, candidate.y, obstacle.x, obstacle.y) > candidate.radius + obstacle.radius + 30);
      if (this.isInsideArena(candidate.x, candidate.y) && clearOfSpawns && clearOfObstacles) this.obstacles.push(candidate);
      if (this.obstacles.length === 3) break;
    }
    for (const obstacle of this.obstacles) {
      const prop = this.add.graphics().setPosition(obstacle.x, obstacle.y).setDepth(obstacle.y + 1);
      obstacle.visual = prop;
      const radius = obstacle.radius;
      if (this.arena.id === 'laguna') {
        prop.fillStyle(0x10363d, .55); prop.fillEllipse(0, 15, radius * 2.3, radius * .85);
        prop.lineStyle(Math.max(5, radius * .25), 0x795738, 1); prop.lineBetween(0, 14, 2, -radius * .55);
        prop.lineStyle(2, 0xc99a5c, .9); prop.lineBetween(1, 4, 2, -radius * .55);
        for (let leaf = 0; leaf < 5; leaf++) {
          const angle = -Math.PI * .92 + leaf * Math.PI * .23;
          const endX = Math.cos(angle) * radius * .95;
          const endY = -radius * .55 + Math.sin(angle) * radius * .58;
          prop.lineStyle(Math.max(3, radius * .16), leaf % 2 ? 0x3b9a64 : 0x60bd73, 1);
          prop.lineBetween(2, -radius * .55, endX, endY);
          prop.fillStyle(leaf % 2 ? 0x6fd47e : 0x45a867, 1);
          prop.fillEllipse(endX, endY, radius * .68, radius * .2);
        }
        prop.fillStyle(0xe5bd71, 1); prop.fillCircle(-3, -radius * .52, 2.5); prop.fillCircle(3, -radius * .52, 2.5);
      } else if (this.arena.id === 'volcan') {
        prop.fillStyle(0x25131d, .8); prop.fillEllipse(0, 12, radius * 2.3, radius * .9);
        prop.fillStyle(0x201923, 1);
        prop.fillPoints([
          { x: -radius, y: 8 }, { x: -radius * .82, y: -radius * .32 },
          { x: -radius * .42, y: -radius * .8 }, { x: -radius * .12, y: -radius * .52 },
          { x: radius * .3, y: -radius }, { x: radius * .48, y: -radius * .48 },
          { x: radius * .9, y: -radius * .62 }, { x: radius, y: 8 },
          { x: radius * .54, y: radius * .48 }, { x: -radius * .56, y: radius * .42 }
        ], true);
        prop.lineStyle(3, 0xff653c, .9);
        prop.lineBetween(-radius * .52, -radius * .27, -radius * .12, -radius * .02);
        prop.lineBetween(-radius * .12, -radius * .02, -radius * .28, radius * .38);
        prop.lineBetween(radius * .35, -radius * .43, radius * .08, -radius * .05);
        prop.lineStyle(1, 0xffd079, .85); prop.lineBetween(-radius * .48, -radius * .28, -radius * .16, -radius * .08);
      } else {
        prop.fillStyle(0x10162c, .72); prop.fillRoundedRect(-radius * 1.1 + 4, -radius + 9, radius * 2.2, radius * 1.9, 5);
        prop.fillStyle(0x252c52, 1); prop.fillRoundedRect(-radius * 1.1, -radius, radius * 2.2, radius * 1.75, 5);
        prop.fillStyle(0x3d4774, 1); prop.fillRoundedRect(-radius * .92, -radius * .76, radius * 1.84, 5, 2);
        prop.lineStyle(2, 0x76f6ff, .9); prop.strokeRoundedRect(-radius * 1.1, -radius, radius * 2.2, radius * 1.75, 5);
        prop.lineStyle(1, 0x91faff, .72);
        for (let vent = -1; vent <= 1; vent++) prop.lineBetween(vent * radius * .38, -radius * .55, vent * radius * .38, radius * .12);
        prop.fillStyle(0xff58c7, .85); prop.fillCircle(-radius * .72, -radius * .72, 2);
        prop.fillStyle(0x7dffba, .85); prop.fillCircle(radius * .72, -radius * .72, 2);
        prop.lineStyle(3, 0xf566ff, .8); prop.lineBetween(-radius * .78, radius * .42, radius * .78, radius * .42);
      }
    }
  }

  repositionObstacles() {
    const reserved = [];
    for (const obstacle of Phaser.Utils.Array.Shuffle([...this.obstacles])) {
      let destination = null;
      for (let attempt = 0; attempt < 180; attempt++) {
        const point = {
          x: Phaser.Math.Between(55, 745),
          y: Phaser.Math.Between(115, 460)
        };
        const insideWithMargin = this.isCircleInsideArena(point.x, point.y, obstacle.radius + 8);
        const clearOfPlayers = [...this.players.values()].every(player =>
          !player.alive || Phaser.Math.Distance.Between(point.x, point.y, player.x, player.y) > obstacle.radius + 48
        );
        const clearOfBombs = [...this.bombs.values()].every(bomb =>
          Phaser.Math.Distance.Between(point.x, point.y, bomb.x, bomb.y) > obstacle.radius + 28
        );
        const clearOfOthers = this.obstacles.filter(other => other !== obstacle).every(other =>
          Phaser.Math.Distance.Between(point.x, point.y, other.x, other.y) > obstacle.radius + other.radius + 22
        ) && reserved.every(other =>
          Phaser.Math.Distance.Between(point.x, point.y, other.x, other.y) > obstacle.radius + other.radius + 22
        );
        if (insideWithMargin && clearOfPlayers && clearOfBombs && clearOfOthers) {
          destination = point;
          break;
        }
      }
      if (!destination) {
        reserved.push(obstacle);
        continue;
      }
      obstacle.x = destination.x;
      obstacle.y = destination.y;
      obstacle.visual.setPosition(obstacle.x, obstacle.y).setDepth(obstacle.y + 1);
      reserved.push(obstacle);
    }
  }

  decorateArena() {
    const { id, colors } = this.arena;
    const density = this.quality === 'low' ? .5 : 1;
    const float = (object, values) => this.tweens.add({ targets: object, ...values, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (id === 'laguna') {
      for (let index = 0; index < Math.round(12 * density); index++) {
        const bubble = this.add.circle(Phaser.Math.Between(80, 720), Phaser.Math.Between(95, 460), Phaser.Math.Between(2, 6), 0xc3ffff, .18).setDepth(1);
        float(bubble, { y: bubble.y - Phaser.Math.Between(18, 55), alpha: .05, duration: Phaser.Math.Between(1700, 3600), delay: index * 120 });
      }
      for (const [x, y] of [[165, 220], [635, 335], [250, 390]]) {
        const coral = this.add.graphics().setDepth(y - 2); coral.fillStyle(0x7ee1c0, .65); coral.fillTriangle(x, y, x + 10, y - 38, x + 22, y); coral.fillStyle(0x2d8390, .8); coral.fillCircle(x + 11, y + 3, 13);
        float(coral, { angle: 3, duration: 1200 + x, delay: y });
      }
    } else if (id === 'volcan') {
      const glow = this.add.circle(400, 300, 145, 0xff542f, .14).setDepth(1); float(glow, { scale: 1.18, alpha: .28, duration: 1600 });
      for (let index = 0; index < Math.round(9 * density); index++) {
        const smoke = this.add.circle(Phaser.Math.Between(350, 450), Phaser.Math.Between(25, 115), Phaser.Math.Between(12, 27), 0x332332, .22).setDepth(2);
        float(smoke, { x: smoke.x + Phaser.Math.Between(-24, 24), y: smoke.y - 20, alpha: .04, scale: 1.25, duration: Phaser.Math.Between(2200, 4200), delay: index * 190 });
      }
      for (let index = 0; index < Math.round(18 * density); index++) {
        const ember = this.add.circle(Phaser.Math.Between(100, 700), Phaser.Math.Between(160, 440), Phaser.Math.Between(1, 4), 0xffbe55, .75).setDepth(2);
        float(ember, { y: ember.y - Phaser.Math.Between(24, 70), alpha: .08, duration: Phaser.Math.Between(900, 1900), delay: index * 90 });
      }
      const cracks = this.add.graphics().setDepth(3); cracks.lineStyle(2, 0xff8a4f, .55); [[250, 280], [520, 340], [385, 215]].forEach(([x, y]) => cracks.strokeLineShape(new Phaser.Geom.Line(x, y, x + 24, y + 10)).strokeLineShape(new Phaser.Geom.Line(x + 24, y + 10, x + 38, y + 2)));
    } else {
      const grid = this.add.graphics().setDepth(2); grid.lineStyle(1, 0x7cf9ff, .2);
      for (let x = 150; x < 680; x += 50) grid.lineBetween(x, 170, x - 35, 430);
      for (let y = 190; y < 430; y += 35) grid.lineBetween(125, y, 680, y);
      for (let index = 0; index < Math.round(22 * density); index++) {
        const star = this.add.circle(Phaser.Math.Between(40, 760), Phaser.Math.Between(55, 160), Phaser.Math.Between(1, 3), 0xc7ecff, .7).setDepth(1);
        float(star, { scale: 1.8, alpha: .12, duration: Phaser.Math.Between(700, 1800), delay: index * 70 });
      }
      [[180, 210], [620, 210], [205, 375], [590, 375]].forEach(([x, y]) => { const light = this.add.circle(x, y, 12, 0x79f8ff, .18).setDepth(y - 2); float(light, { scale: 1.5, alpha: .45, duration: 900 + x }); });
      for (let index = 0; index < Math.round(5 * density); index++) {
        const streak = this.add.rectangle(Phaser.Math.Between(80, 720), Phaser.Math.Between(74, 140), Phaser.Math.Between(24, 56), 2, index % 2 ? 0x84faff : 0xf566ff, .6).setDepth(3);
        this.tweens.add({ targets: streak, x: streak.x + Phaser.Math.Between(80, 170), alpha: 0, duration: Phaser.Math.Between(1000, 1900), repeat: -1, delay: index * 450, onRepeat: () => { streak.x = Phaser.Math.Between(50, 450); streak.alpha = .6; } });
      }
    }
    const accentGlow = this.add.rectangle(400, 492, 250, 2, Phaser.Display.Color.HexStringToColor(colors.accent).color, .45).setDepth(5);
    float(accentGlow, { scaleX: 1.3, alpha: .15, duration: 1500 });
  }

  createAmbientEffects() {
    if (this.arena.id === 'laguna') {
      const density = this.quality === 'low' ? 18 : 42;
      for (let index = 0; index < density; index++) {
        const x = Phaser.Math.Between(0, 800);
        const y = Phaser.Math.Between(-520, 520);
        const drop = this.add.graphics().setPosition(x, y).setDepth(900);
        drop.lineStyle(1, 0xc5eaff, .28);
        drop.lineBetween(0, 0, -7, 17);
        this.tweens.add({ targets: drop, y: y + 570, duration: Phaser.Math.Between(800, 1250), repeat: -1, delay: index * 28 });
      }
      const lightning = this.add.rectangle(0, 0, 800, 520, 0xe7f5ff, .0).setOrigin(0).setDepth(950);
      this.time.addEvent({
        delay: 6800,
        loop: true,
        callback: () => {
          this.tweens.add({ targets: lightning, alpha: .2, duration: 65, yoyo: true, repeat: 1 });
          this.time.delayedCall(380, () => this.sounds.effect('thunder'));
        }
      });
    } else if (this.arena.id === 'volcan') {
      for (let index = 0; index < (this.quality === 'low' ? 14 : 32); index++) {
        const ember = this.add.circle(Phaser.Math.Between(15, 785), Phaser.Math.Between(35, 510), Phaser.Math.Between(1, 3), 0xffa64d, .42).setDepth(850);
        this.tweens.add({ targets: ember, y: ember.y - Phaser.Math.Between(65, 160), x: ember.x + Phaser.Math.Between(-30, 30), alpha: .02, duration: Phaser.Math.Between(1800, 3400), repeat: -1, delay: index * 110 });
      }
    }
  }

  isInsideArena(x, y) { return Phaser.Geom.Polygon.Contains(this.arenaPolygon, x, y); }
  isCircleInsideArena(x, y, radius) {
    if (!this.isInsideArena(x, y)) return false;
    for (let index = 0; index < 8; index++) {
      const angle = index * Math.PI / 4;
      if (!this.isInsideArena(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)) return false;
    }
    return true;
  }

  canPlayerMove(player, x, y) {
    if (!this.isInsideArena(x, y)) return false;
    return this.obstacles.every(obstacle => player.z > 28 || Phaser.Math.Distance.Between(x, y, obstacle.x, obstacle.y) > obstacle.radius + 13);
  }

  randomArenaPoint() {
    for (let attempt = 0; attempt < 80; attempt++) {
      const point = { x: Phaser.Math.Between(45, 755), y: Phaser.Math.Between(110, 465) };
      const clearOfPlayer = [...this.players.values()].every(player => !player.alive || Phaser.Math.Distance.Between(point.x, point.y, player.x, player.y) > 70);
      const clearOfBomb = [...this.bombs.values()].every(bomb => Phaser.Math.Distance.Between(point.x, point.y, bomb.x, bomb.y) > 65);
      const clearOfObstacle = this.obstacles.every(obstacle => Phaser.Math.Distance.Between(point.x, point.y, obstacle.x, obstacle.y) > obstacle.radius + 25);
      if (this.isCircleInsideArena(point.x, point.y, 12) && clearOfPlayer && clearOfBomb && clearOfObstacle) return point;
    }
    for (let y = 110; y <= 465; y += 12) {
      for (let x = 45; x <= 755; x += 12) {
        const clearOfPlayer = [...this.players.values()].every(player => !player.alive || Phaser.Math.Distance.Between(x, y, player.x, player.y) > 55);
        const clearOfBomb = [...this.bombs.values()].every(bomb => Phaser.Math.Distance.Between(x, y, bomb.x, bomb.y) > 48);
        const clearOfObstacle = this.obstacles.every(obstacle => Phaser.Math.Distance.Between(x, y, obstacle.x, obstacle.y) > obstacle.radius + 18);
        if (this.isCircleInsideArena(x, y, 12) && clearOfPlayer && clearOfBomb && clearOfObstacle) return { x, y };
      }
    }
    return null;
  }
  ensureBombPopulation() {
    if (!this.matchStarted || this.finished) return;
    const target = Math.min(12, 4 + Math.floor(this.elapsed / 15000));
    const missing = target - (this.bombs.size + this.heldBombs.size + this.pendingBombSpawns);
    for (let index = 0; index < missing; index++) {
      this.pendingBombSpawns += 1;
      this.time.delayedCall(this.bombs.size ? 850 + index * 240 : index * 120, () => {
        this.pendingBombSpawns -= 1;
        if (this.finished || this.bombs.size + this.heldBombs.size >= target) return;
        const point = this.randomArenaPoint();
        if (!point) return;
        const id = `bomb-${Date.now()}-${Math.random()}`;
        const type = BOMB_TYPE_POOL[Phaser.Math.Between(0, BOMB_TYPE_POOL.length - 1)];
        this.bombs.set(id, new Bomb(this, id, point.x, point.y, 0, type));
      });
    }
  }
  readKeyboard() {
    const x = (this.keys.A.isDown || this.keys.LEFT.isDown ? -1 : 0) + (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0);
    const y = (this.keys.W.isDown || this.keys.UP.isDown ? -1 : 0) + (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0);
    const jumpDown = this.keys.SPACE.isDown; const pickDown = this.keys.E.isDown; const throwDown = this.keys.Q.isDown;
    const actions = { jump: jumpDown && !this.keyboardEdges.jump, pick: pickDown && !this.keyboardEdges.pick, throw: throwDown && !this.keyboardEdges.throw };
    this.keyboardEdges = { jump: jumpDown, pick: pickDown, throw: throwDown }; return { x, y, actions };
  }
  readGamepad(player) {
    const pad = Array.from(navigator.getGamepads?.() || []).find(gamepad => gamepad?.index === player.gamepadIndex);
    if (!pad) return { x: 0, y: 0, actions: { jump: false, pick: false, throw: false } };
    const deadzone = value => Math.abs(value) < .16 ? 0 : value; let x = deadzone(pad.axes[0] || 0); let y = deadzone(pad.axes[1] || 0);
    if (pad.buttons[14]?.pressed) x = -1; if (pad.buttons[15]?.pressed) x = 1; if (pad.buttons[12]?.pressed) y = -1; if (pad.buttons[13]?.pressed) y = 1;
    const edge = this.gamepadEdges.get(player.id) || {}; const jump = !!pad.buttons[0]?.pressed; const pick = !!pad.buttons[2]?.pressed; const throwPressed = !!pad.buttons[1]?.pressed;
    this.gamepadEdges.set(player.id, { jump, pick, throw: throwPressed }); return { x, y, actions: { jump: jump && !edge.jump, pick: pick && !edge.pick, throw: throwPressed && !edge.throw } };
  }
  readAI(player, delta) {
    const now = this.time.now;
    const heldBomb = this.heldBombs.has(player.id);
    const actionTimes = this.aiActionTimes.get(player.id) || {
      phase: 'seek', phaseUntil: 0, pick: 0, jump: 0, throwDirection: { x: player.facing, y: 0 }
    };
    const enemies = [...this.players.values()].filter(other => other.alive && other.id !== player.id);
    const targetEnemy = enemies.sort((a, b) =>
      Phaser.Math.Distance.Between(player.x, player.y, a.x, a.y) -
      Phaser.Math.Distance.Between(player.x, player.y, b.x, b.y)
    )[0];
    if (!heldBomb) {
      actionTimes.phase = 'seek';
      actionTimes.phaseUntil = 0;
    } else if (actionTimes.phase === 'seek') {
      actionTimes.phase = 'pursue';
      actionTimes.phaseUntil = now + 900;
    } else if (actionTimes.phase === 'pursue' && now >= actionTimes.phaseUntil) {
      actionTimes.phase = 'aim';
      actionTimes.phaseUntil = now + 650;
      const enemyX = targetEnemy?.x ?? player.x + player.facing;
      const enemyY = targetEnemy?.y ?? player.y;
      const dx = enemyX - player.x;
      const dy = enemyY - player.y;
      actionTimes.throwDirection = Math.abs(dx) >= Math.abs(dy)
        ? { x: Math.sign(dx) || player.facing, y: 0 }
        : { x: 0, y: Math.sign(dy) || 1 };
    }

    const nearestBomb = [...this.bombs.values()].filter(bomb =>
      bomb.type !== 'instant' &&
      bomb.thrownBy !== player.id &&
      (!this.isSoloAIMatch || bomb.thrownBy === null)
    ).sort((a, b) =>
      Phaser.Math.Distance.Between(player.x, player.y, a.x, a.y) -
      Phaser.Math.Distance.Between(player.x, player.y, b.x, b.y)
    )[0];
    const target = heldBomb && actionTimes.phase === 'pursue'
      ? targetEnemy
      : nearestBomb || targetEnemy;
    let targetX = target?.x ?? this.zoneCenter.x;
    let targetY = target?.y ?? this.zoneCenter.y;
    if (heldBomb && actionTimes.phase === 'aim') {
      targetX = player.x;
      targetY = player.y;
    }

    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const distance = Math.hypot(dx, dy);
    const desiredX = distance > 1 ? dx / distance : 0;
    const desiredY = distance > 1 ? dy / distance : 0;
    const step = Math.max(22, player.speed * Math.max(delta, 16) / 1000 * 8);
    const directions = [
      [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
      [.707, .707], [.707, -.707], [-.707, .707], [-.707, -.707]
    ];
    const hazards = [...this.bombs.values()].map(bomb => {
      let blastX = bomb.stuckTo?.alive ? bomb.stuckTo.x : bomb.x;
      let blastY = bomb.stuckTo?.alive ? bomb.stuckTo.y - 20 : bomb.y;
      if (!bomb.stuckTo?.alive) {
        let velocityX = bomb.vx;
        let velocityY = bomb.vy;
        let remaining = Math.max(0, bomb.life);
        const frameDuration = 1000 / 60;
        while (remaining > 0) {
          const stepMs = Math.min(frameDuration, remaining);
          const nextX = blastX + velocityX * stepMs / 1000;
          const nextY = blastY + velocityY * stepMs / 1000;
          if (!this.isCircleInsideArena(nextX, nextY, 10)) break;
          blastX = nextX;
          blastY = nextY;
          velocityX *= Math.pow(.985, stepMs / frameDuration);
          remaining -= stepMs;
        }
      }
      return {
        x: blastX,
        y: blastY,
        radius: BOMB_TYPES[bomb.type].radius,
        life: bomb.life
      };
    });
    const imminentThreats = hazards.filter(hazard =>
      hazard.life <= 1300 &&
      Phaser.Math.Distance.Between(player.x, player.y, hazard.x, hazard.y) < hazard.radius + 35
    );
    const escaping = imminentThreats.length > 0;
    let best = { x: 0, y: 0, score: -Infinity };
    for (const [moveX, moveY] of directions) {
      const candidateX = player.x + moveX * step;
      const candidateY = player.y + moveY * step;
      if (!this.isCircleInsideArena(candidateX, candidateY, 14) ||
        !this.canPlayerMove(player, candidateX, candidateY)) continue;
      const progress = (distance - Phaser.Math.Distance.Between(candidateX, candidateY, targetX, targetY)) * 1.6;
      let score = escaping ? 0 : progress + moveX * desiredX * 5 + moveY * desiredY * 5;

      for (const hazard of imminentThreats) {
        const currentDistance = Phaser.Math.Distance.Between(player.x, player.y, hazard.x, hazard.y);
        const blastDistance = Phaser.Math.Distance.Between(candidateX, candidateY, hazard.x, hazard.y);
        const danger = Math.max(0, hazard.radius + 12 - blastDistance);
        score -= danger * 10;
        score += (blastDistance - currentDistance) * 6;
      }

      if (!escaping && targetEnemy && !heldBomb) {
        const enemyDistance = Phaser.Math.Distance.Between(candidateX, candidateY, targetEnemy.x, targetEnemy.y);
        if (enemyDistance < 65) score -= (65 - enemyDistance) * 1.6;
      }
      if (score > best.score) best = { x: moveX, y: moveY, score };
    }

    const bombDistance = nearestBomb ? Phaser.Math.Distance.Between(player.x, player.y, nearestBomb.x, nearestBomb.y) : Infinity;
    const readyToPick = !escaping && !heldBomb && nearestBomb &&
      nearestBomb.life > 700 && bombDistance < 42 && now >= actionTimes.pick;
    const goalBlocked = actionTimes.phase !== 'aim' && target && distance > 30 && !this.canPlayerMove(
      player, player.x + desiredX * step, player.y + desiredY * step
    );
    const readyToJump = goalBlocked && now >= actionTimes.jump;

    if (readyToPick) actionTimes.pick = now + 420;
    if (readyToJump) actionTimes.jump = now + 900;
    if (heldBomb && actionTimes.phase === 'aim' && actionTimes.throwDirection.x) {
      player.facing = actionTimes.throwDirection.x;
    }
    else if (targetEnemy && Math.abs(targetEnemy.x - player.x) > 8) player.facing = Math.sign(targetEnemy.x - player.x);
    this.aiActionTimes.set(player.id, actionTimes);
    if (heldBomb) {
      const bombType = this.heldBombTypes.get(player.id);
      player.setBombWarning(bombType, actionTimes.phase === 'aim');
    } else {
      player.clearBombWarning();
    }
    return {
      x: actionTimes.phase === 'aim' && !escaping ? 0 : best.x,
      y: actionTimes.phase === 'aim' && !escaping ? 0 : best.y,
      actions: { jump: readyToJump, pick: readyToPick, throw: heldBomb && !escaping && actionTimes.phase === 'aim' && now >= actionTimes.phaseUntil }
    };
  }
  drawAIThrowPreview(player, type, direction) {
    const graphics = player.trajectoryGraphics;
    if (!graphics || (!direction.x && !direction.y)) return;
    const color = BOMB_TYPES[type]?.color ?? 0xffcf68;
    const points = [];
    let x = player.x + direction.x * 30;
    let y = player.y + direction.y * 30 - 15;
    let vx = direction.x * 145;
    let vy = direction.y * 145 || (direction.x ? -28 : 0);
    points.push({ x, y });
    const step = 1000 / 60;
    const stepsPerMark = 6;
    const totalSteps = Math.ceil(2400 / step);
    for (let frame = 1; frame <= totalSteps; frame++) {
      const previousX = x;
      const previousY = y;
      x += vx * step / 1000;
      y += vy * step / 1000;
      if (!this.isCircleInsideArena(x, y, 10)) {
        x = previousX;
        y = previousY;
        points.push({ x, y });
        break;
      }
      vx *= Math.pow(.985, step / (1000 / 60));
      if (frame % stepsPerMark === 0 || frame === totalSteps) points.push({ x, y });
    }

    graphics.clear().setVisible(true);
    graphics.lineStyle(2, color, .76);
    for (let index = 1; index < points.length; index++) {
      const from = points[index - 1];
      const to = points[index];
      graphics.lineBetween(from.x, from.y, to.x, to.y);
    }
    for (let index = 1; index < points.length - 1; index++) {
      const point = points[index];
      graphics.fillStyle(color, index % 2 ? .5 : .82);
      graphics.fillCircle(point.x, point.y, index % 2 ? 2 : 3);
    }
    const endpoint = points[points.length - 1];
    graphics.fillStyle(color, .95);
    graphics.fillCircle(endpoint.x, endpoint.y, 4);
    graphics.lineStyle(3, color, .95);
    const perpendicularX = -direction.y;
    const perpendicularY = direction.x;
    graphics.lineBetween(
      endpoint.x - direction.x * 12 + perpendicularX * 7,
      endpoint.y - direction.y * 12 + perpendicularY * 7,
      endpoint.x, endpoint.y
    );
    graphics.lineBetween(
      endpoint.x - direction.x * 12 - perpendicularX * 7,
      endpoint.y - direction.y * 12 - perpendicularY * 7,
      endpoint.x, endpoint.y
    );
  }
  clearAIThrowPreview(player) {
    if (!player.trajectoryGraphics) return;
    player.trajectoryGraphics.clear().setVisible(false);
  }
  update(time, delta) {
    if (this.finished || !this.matchStarted) return;
    this.elapsed += delta;
    const pausePads = Array.from(navigator.getGamepads?.() || []);
    let pausePressed = false;
    for (const pad of pausePads) {
      if (!pad) continue;
      const pressed = !!pad.buttons[8]?.pressed || !!pad.buttons[9]?.pressed;
      const previous = this.pauseGamepadEdges.get(pad.index) || false;
      this.pauseGamepadEdges.set(pad.index, pressed);
      if (pressed && !previous) pausePressed = true;
    }
    if (pausePressed) {
      this.onPause?.();
      return;
    }
    if (this.elapsed >= this.nextZoneWarningAt) {
      this.nextZoneWarningAt = Infinity;
      this.sounds.effect('ui');
      this.onToast('¡Atención! La zona comenzará a cerrarse en 3 segundos.');
    }
    if (this.elapsed >= this.nextZoneCycleAt) this.startZoneCycle();
    if (this.elapsed >= this.nextBombGrowthAt) {
      this.nextBombGrowthAt += 15000;
      this.ensureBombPopulation();
    }
    this.updateShieldPickup();
    this.updatePlayerShields();
    const touch = window.arenaTouch || {};
    this.keepPlayersInsideZone();
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const carryingBomb = this.heldBombs.has(player.id);
      const nearBomb = [...this.bombs.values()].some(bomb =>
        Phaser.Math.Distance.Between(bomb.x, bomb.y, player.x, player.y) < 105
      );
      player.setMood(carryingBomb ? 'evil' : nearBomb ? 'nervous' : 'normal');
      const input = player.inputType === 'keyboard' ? this.readKeyboard() : player.inputType === 'ai' ? this.readAI(player, delta) : this.readGamepad(player);
      const hasOnlyKeyboardAndAI = [...this.players.values()].every(other => other.inputType === 'keyboard' || other.inputType === 'ai');
      if (player.inputType === 'keyboard' && hasOnlyKeyboardAndAI) { input.x += touch.x || 0; input.y += touch.y || 0; input.actions.jump ||= !!touch.jump; input.actions.pick ||= !!touch.pick; input.actions.throw ||= !!touch.throw; touch.jump = touch.pick = touch.throw = false; }
      let { x, y } = input; const magnitude = Math.hypot(x, y); if (magnitude > 1) { x /= magnitude; y /= magnitude; }
      player.move(x, y, delta);
      if (player.inputType === 'ai') {
        const actionTimes = this.aiActionTimes.get(player.id);
        const heldType = this.heldBombTypes.get(player.id);
        if (heldType) {
          if (actionTimes?.phase === 'aim') {
            if (actionTimes.throwDirection.x) player.facing = actionTimes.throwDirection.x;
            this.drawAIThrowPreview(player, heldType, actionTimes.throwDirection);
          } else this.clearAIThrowPreview(player);
        } else {
          this.clearAIThrowPreview(player);
        }
      }
      if (input.actions.jump) player.jump();
      if (input.actions.pick) this.pickBomb(player);
      if (input.actions.throw) this.throwBomb(player, { x, y });
    }
    this.bombs.forEach(bomb => bomb.update(delta)); $('hudTimer').textContent = this.formatTime(this.elapsed); $('hudAlive').innerHTML = [...this.players.values()].map(player => `${escapeHtml(player.name)}: <span class="hearts">${Array.from({ length: 3 }, (_, index) => `<b class="${index < player.lives ? 'heart' : 'heart lost'}">♥</b>`).join('')}</span>${player.alive ? '' : ' ✕'}`).join(' · ');
  }
  pickBomb(player) {
    if (player.inputType !== 'ai' && this.shieldPickup &&
      Phaser.Math.Distance.Between(this.shieldPickup.x, this.shieldPickup.y, player.x, player.y) < 42 &&
      this.elapsed < this.shieldPickupExpiresAt && this.elapsed >= (player.shieldUntil || 0)) {
      this.activatePlayerShield(player);
      return;
    }
    if (this.heldBombs.has(player.id)) return;
    const availableBombs = [...this.bombs.values()].filter(item =>
      player.inputType !== 'ai' ||
      (['normal', 'sticky', 'ice'].includes(item.type) &&
        item.thrownBy !== player.id &&
        (!this.isSoloAIMatch || item.thrownBy === null))
    );
    const bomb = availableBombs.find(item => Phaser.Math.Distance.Between(item.x, item.y, player.x, player.y) < 48);
    if (!bomb) { this.onToast(`${player.name}: acércate a una bomba`); return; }
    this.heldBombs.set(player.id, bomb.id); this.heldBombTypes.set(player.id, bomb.type);
    if (player.inputType === 'ai') {
      const actionTimes = this.aiActionTimes.get(player.id) || {
        phase: 'seek', phaseUntil: 0, pick: 0, jump: 0, throwDirection: { x: player.facing, y: 0 }
      };
      actionTimes.phase = 'pursue';
      actionTimes.phaseUntil = this.time.now + 900;
      this.aiActionTimes.set(player.id, actionTimes);
    }
    this.bombs.delete(bomb.id); bomb.destroy(); this.sounds.effect('pick'); this.onToast(`${player.name} recogió ${BOMB_TYPES[this.heldBombTypes.get(player.id)].name.toLowerCase()}`);
  }
  throwBomb(player, inputDirection = { x: 0, y: 0 }) {
    const heldId = this.heldBombs.get(player.id); if (!heldId) { this.onToast(`${player.name}: primero recoge una bomba`); return; }
    const type = this.heldBombTypes.get(player.id) || 'normal';
    const id = `${heldId}-${player.id}-${Date.now()}`;
    const aiState = this.aiActionTimes.get(player.id);
    let direction;
    if (player.inputType === 'ai' && aiState?.phase === 'aim') {
      direction = aiState.throwDirection;
    } else if (Math.abs(inputDirection.x) > Math.abs(inputDirection.y) && inputDirection.x) {
      direction = { x: Math.sign(inputDirection.x), y: 0 };
    } else if (inputDirection.y) {
      direction = { x: 0, y: Math.sign(inputDirection.y) };
    } else {
      direction = { x: player.facing, y: 0 };
    }
    let x = player.x + direction.x * 30;
    let y = player.y + direction.y * 30 - 15;
    if (!this.isCircleInsideArena(x, y, 12)) {
      x = player.x;
      y = player.y;
    }
    this.bombs.set(id, new Bomb(this, id, x, y, direction, type, player.id));
    this.heldBombs.delete(player.id); this.heldBombTypes.delete(player.id); player.clearBombWarning(); this.clearAIThrowPreview(player);
    if (aiState) {
      aiState.phase = 'seek';
      aiState.phaseUntil = 0;
      aiState.pick = this.time.now + 250;
    }
    this.sounds.effect('throw');
  }
  updateShieldPickup() {
    if (this.shieldPickup && this.elapsed >= this.shieldPickupExpiresAt) {
      this.tweens.killTweensOf(this.shieldPickup);
      this.shieldPickup.destroy();
      this.shieldPickup = null;
      this.onToast('El escudo desapareció. Aparecerá otro más adelante.');
    }
    if (!this.shieldPickup && this.elapsed >= this.nextShieldAt) {
      this.nextShieldAt += 20000;
      const point = this.randomArenaPoint();
      if (!point) {
        this.nextShieldAt = this.elapsed + 1000;
        return;
      }
      const glow = this.add.circle(0, 0, 22, 0x68eaff, .2);
      const token = this.add.circle(0, 0, 15, 0x10283b, .96).setStrokeStyle(3, 0x8bf5ff, 1);
      const icon = this.add.text(0, -1, '🛡', {
        fontFamily: 'Arial, sans-serif', fontSize: '19px', color: '#b7fbff'
      }).setOrigin(.5);
      this.shieldPickup = this.add.container(point.x, point.y, [glow, token, icon]).setDepth(point.y + 20);
      this.shieldPickupExpiresAt = this.elapsed + 7000;
      this.tweens.add({
        targets: this.shieldPickup,
        y: point.y - 5,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.onToast('¡Escudo disponible! Presiona E / X para recogerlo. Desaparece en 7 segundos.');
    }
    if (this.shieldPickup) {
      const remaining = this.shieldPickupExpiresAt - this.elapsed;
      this.shieldPickup.setAlpha(remaining <= 2000 && Math.floor(this.elapsed / 150) % 2 === 0 ? .35 : 1);
    }
  }
  activatePlayerShield(player) {
    this.tweens.killTweensOf(this.shieldPickup);
    this.shieldPickup?.destroy();
    this.shieldPickup = null;
    player.shieldUntil = this.elapsed + 7000;
    player.shieldWarningShown = false;
    player.setShieldActive(true);
    this.sounds.effect('shield');
    this.onToast(`${player.name}: escudo activo por 7 segundos. Una explosión lo anulará.`);
  }
  updatePlayerShields() {
    for (const player of this.players.values()) {
      if (!player.alive || !player.shieldUntil) continue;
      const remaining = player.shieldUntil - this.elapsed;
      if (remaining <= 0) {
        player.shieldUntil = 0;
        player.setShieldActive(false);
        this.onToast(`El escudo de ${player.name} se agotó.`);
      } else if (remaining <= 2000 && !player.shieldWarningShown) {
        player.shieldWarningShown = true;
        this.onToast(`¡Atención, ${player.name}! El escudo se agotará en 2 segundos.`);
      }
    }
  }
  handleEvent(event) {
    if (event.type !== 'bomb:explode') return;
    const shieldedPlayers = new Set();
    for (const player of this.players.values()) {
      if (!player.shieldUntil || player.shieldUntil <= this.elapsed) continue;
      shieldedPlayers.add(player.id);
      player.shieldUntil = 0;
      player.setShieldActive(false);
    }
    if (shieldedPlayers.size) {
      this.sounds.effect('shield');
      this.onToast('¡Una explosión anuló los escudos activos!');
    }
    const color = BOMB_TYPES[event.bombType]?.color || 0xffd36a;
    const effect = this.add.circle(event.x, event.y, 12, color, .8);
    this.tweens.add({ targets: effect, radius: event.radius, alpha: 0, duration: 300, onComplete: () => effect.destroy() });
    this.cameras.main.shake(110, .003); this.sounds.effect('blast');
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const distance = Phaser.Math.Distance.Between(event.x, event.y, player.x, player.y);
      if (distance > event.radius) continue;
      if (shieldedPlayers.has(player.id)) {
        this.onToast(`${player.name} bloqueó la explosión con su escudo.`);
        continue;
      }
      player.knockback(event.x, event.y);
      if (event.bombType === 'ice') player.freeze(1700);
      const respawnPoint = this.randomArenaPoint() || this.findNearestArenaPoint(player.x, player.y) || { ...this.zoneCenter };
      if (!player.takeHit(respawnPoint)) continue;
      if (!player.alive) {
        this.heldBombs.delete(player.id);
        this.heldBombTypes.delete(player.id);
        player.clearBombWarning();
        this.clearAIThrowPreview(player);
        this.sounds.effect('lose');
        this.onToast(`${player.name} fue eliminado`);
        const skull = this.add.text(player.x, player.y - 36, '☠', {
          fontFamily: 'Arial', fontSize: '30px', color: '#ff5268',
          stroke: '#24111b', strokeThickness: 4
        }).setOrigin(.5).setDepth(1000);
        this.tweens.add({
          targets: skull,
          y: skull.y - 58,
          alpha: 0,
          scale: 1.5,
          duration: 950,
          ease: 'Cubic.easeOut',
          onComplete: () => skull.destroy()
        });
        this.tweens.add({
          targets: player.body,
          angle: 90,
          alpha: .2,
          scaleX: .65,
          scaleY: .65,
          duration: 650,
          ease: 'Back.easeIn'
        });
        player.label.setAlpha(.35);
      } else {
        this.sounds.effect('eliminate');
        this.onToast(`${player.name} pierde una vida (${player.lives} restante${player.lives === 1 ? '' : 's'})`);
      }
    }
    this.bombs.get(event.id)?.destroy(); this.bombs.delete(event.id); this.ensureBombPopulation(); this.checkForWinner();
  }
  checkForWinner() {
    if (this.finished || !this.players.size) return; const alive = [...this.players.values()].filter(player => player.alive); if (alive.length > 1) return;
    this.finished = true; const winner = alive[0]; this.sounds.effect(winner ? 'win' : 'eliminate');
    this.onToast(winner ? `${winner.name} gana la partida` : 'La partida terminó en empate');
    this.time.delayedCall(950, () => this.onFinish({ winnerId: winner?.id || null, durationMs: this.elapsed, players: [...this.players.values()] }));
  }
  formatTime(milliseconds) { const seconds = Math.floor(milliseconds / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
}
