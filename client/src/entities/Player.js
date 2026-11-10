import Phaser from 'phaser';
const COLORS = { cyan: 0x56e3e0, coral: 0xff806e, lime: 0xb9e66b, violet: 0xb99aff };

export class Player {
  constructor(scene, id, name, skin, x, y, local = true) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.skin = skin || 'cyan';
    this.local = local;
    this.alive = true;
    this.lives = 3;
    this.invulnerable = false;
    this.vz = 0;
    this.z = 0;
    this.walkPhase = 0;
    this.facing = 1;
    this.shadow = scene.add.ellipse(x, y + 13, 34, 12, 0x102c35, .35);
    this.body = scene.add.container(x, y);
    this.shadow.setDepth(y - 1);
    const color = COLORS[this.skin] || COLORS.cyan;
    const graphic = scene.add.graphics();
    graphic.fillStyle(0x173447, 1);
    graphic.fillEllipse(0, 2, 32, 38);
    graphic.fillStyle(0xffffff, .12);
    graphic.fillEllipse(-5, -4, 10, 22);
    graphic.fillStyle(color, 1);
    graphic.fillRoundedRect(-13, -28, 26, 29, 10);
    graphic.fillStyle(Phaser.Display.Color.IntegerToColor(color).darken(22).color, 1);
    graphic.fillRoundedRect(-13, -8, 26, 8, 3);
    graphic.fillStyle(0x172d3c, 1);
    graphic.fillRoundedRect(-10, -5, 20, 7, 3);
    graphic.fillStyle(0xffffff, .75);
    graphic.fillCircle(-7, -21, 1.5);
    graphic.fillCircle(7, -21, 1.5);
    this.graphic = graphic;
    this.armLeft = scene.add.graphics();
    this.armLeft.fillStyle(0x173447, 1);
    this.armLeft.fillRoundedRect(-4, -2, 8, 21, 4);
    this.armLeft.fillStyle(color, 1);
    this.armLeft.fillCircle(0, 19, 4);
    this.armLeft.setPosition(-14, -17);
    this.armRight = scene.add.graphics();
    this.armRight.fillStyle(0x173447, 1);
    this.armRight.fillRoundedRect(-4, -2, 8, 21, 4);
    this.armRight.fillStyle(color, 1);
    this.armRight.fillCircle(0, 19, 4);
    this.armRight.setPosition(14, -17);
    this.legLeft = scene.add.graphics();
    this.legLeft.fillStyle(0x102c35, 1);
    this.legLeft.fillRoundedRect(-4, -1, 8, 14, 3);
    this.legLeft.fillStyle(0xf1d3a1, 1);
    this.legLeft.fillRoundedRect(-5, 8, 11, 5, 2);
    this.legLeft.setPosition(-7, 10);
    this.legRight = scene.add.graphics();
    this.legRight.fillStyle(0x102c35, 1);
    this.legRight.fillRoundedRect(-4, -1, 8, 14, 3);
    this.legRight.fillStyle(0xf1d3a1, 1);
    this.legRight.fillRoundedRect(-5, 8, 11, 5, 2);
    this.legRight.setPosition(7, 10);
    this.face = scene.add.graphics();
    this.drawExpression('normal');
    this.face.setPosition(0, -17);
    this.footLeft = scene.add.ellipse(-7, 16, 10, 5, 0x102c35, .9);
    this.footRight = scene.add.ellipse(7, 16, 10, 5, 0x102c35, .9);
    this.body.add([this.legLeft, this.legRight, this.footLeft, this.footRight, this.armLeft, this.armRight, graphic, this.face]);
    this.freezeRing = scene.add.circle(0, -11, 22, 0x76eaff, 0).setStrokeStyle(3, 0x9af2ff, .9).setVisible(false);
    this.body.add(this.freezeRing);
    this.shieldRing = scene.add.circle(0, -11, 29, 0x75eeff, .08)
      .setStrokeStyle(3, 0x9af2ff, .95)
      .setVisible(false);
    this.body.add(this.shieldRing);
    this.bombWarning = scene.add.text(0, -60, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#111a2be8',
      padding: { x: 6, y: 4 },
      stroke: '#111a2b',
      strokeThickness: 2
    }).setOrigin(.5).setVisible(false);
    this.body.add(this.bombWarning);
    this.mood = 'normal';
    this.label = scene.add.text(x, y - 42, name, {
      fontSize: '10px', fontStyle: 'bold', color: '#ffffff', stroke: '#173447', strokeThickness: 3
    }).setOrigin(.5);
    this.speed = 190;
    this.frozenUntil = 0;
    this.updateDepth();
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }

  move(dx, dy, delta) {
    const dt = delta / 1000;
    if (this.scene.time.now < this.frozenUntil) {
      dx = 0;
      dy = 0;
    } else {
      this.freezeRing.setVisible(false);
    }
    const nextX = Phaser.Math.Clamp(this.body.x + dx * this.speed * dt, 30, 770);
    const nextY = Phaser.Math.Clamp(this.body.y + dy * this.speed * .68 * dt, 90, 490);
    if (this.scene.canPlayerMove(this, nextX, nextY)) { this.body.x = nextX; this.body.y = nextY; }
    else if (this.scene.canPlayerMove(this, nextX, this.body.y)) this.body.x = nextX;
    else if (this.scene.canPlayerMove(this, this.body.x, nextY)) this.body.y = nextY;
    if (dx) this.facing = Math.sign(dx);
    this.z = Math.max(0, this.z + this.vz * dt);
    this.vz -= 520 * dt;
    if (this.z <= 0) { this.z = 0; this.vz = 0; }
    this.walkPhase += Math.hypot(dx, dy) > .04 ? dt * 15 : dt * 3;
    const moving = Math.hypot(dx, dy) > .04;
    const bob = this.z === 0 ? Math.sin(this.walkPhase) * (moving ? 1.5 : .7) : 0;
    const stride = moving ? Math.sin(this.walkPhase) * .5 : Math.sin(this.walkPhase) * .06;
    const lift = -this.z + bob;
    const jumpPose = Phaser.Math.Clamp(this.z / 32, 0, 1);
    this.graphic.setY(lift);
    this.graphic.setRotation(dx * .06);
    this.armLeft.setY(-17 + lift);
    this.armRight.setY(-17 + lift);
    this.armLeft.rotation = Phaser.Math.Linear(stride, -.9, jumpPose);
    this.armRight.rotation = Phaser.Math.Linear(-stride, .9, jumpPose);
    this.legLeft.setY(10 + lift);
    this.legRight.setY(10 + lift);
    this.legLeft.rotation = Phaser.Math.Linear(-stride * .8, -.38, jumpPose);
    this.legRight.rotation = Phaser.Math.Linear(stride * .8, .38, jumpPose);
    this.footLeft.setY(16 + lift);
    this.footRight.setY(16 + lift);
    this.footLeft.rotation = this.legLeft.rotation;
    this.footRight.rotation = this.legRight.rotation;
    this.face.setY(-17 + lift);
    this.bombWarning.setY(-60 + lift);
    this.updateDepth();
  }

  setBombWarning(type, telegraph = false) {
    const warnings = {
      normal: { symbol: '●', name: 'CLÁSICA', color: '#ffcf68' },
      sticky: { symbol: '✹', name: 'PEGAJOSA', color: '#b7ee76' },
      ice: { symbol: '❄', name: 'HIELO', color: '#76eaff' }
    };
    const warning = warnings[type];
    if (!warning) {
      this.clearBombWarning();
      return;
    }
    this.bombWarning.setText(`${telegraph ? '¡' : ''}${warning.symbol} ${warning.name}${telegraph ? '!' : ''}`);
    this.bombWarning.setColor(warning.color);
    this.bombWarning.setAlpha(1);
    this.bombWarning.setVisible(true);
    if (telegraph) this.bombWarning.setScale(1.12);
    else this.bombWarning.setScale(1);
  }

  clearBombWarning() {
    this.bombWarning.setVisible(false);
    this.bombWarning.setScale(1);
  }

  drawExpression(mood) {
    if (this.mood === mood && this.face?.length) return;
    if (!this.face) return;
    this.mood = mood;
    this.face.clear();
    if (mood === 'evil') {
      this.face.fillStyle(0xffffff, 1);
      this.face.fillTriangle(-10, -5, -2, -3, -9, 1);
      this.face.fillTriangle(10, -5, 2, -3, 9, 1);
      this.face.lineStyle(2, 0x47202b, 1);
      this.face.lineBetween(-11, -7, -3, -5);
      this.face.lineBetween(11, -7, 3, -5);
      this.face.lineStyle(2, 0x47202b, 1);
      this.face.beginPath();
      this.face.arc(0, 2, 6, 0, Math.PI, false);
      this.face.strokePath();
      this.face.fillStyle(0xffffff, 1);
      this.face.fillRect(-3, 2, 6, 2);
    } else if (mood === 'nervous') {
      this.face.fillStyle(0xffffff, 1);
      this.face.fillEllipse(-5, -3, 6, 9);
      this.face.fillEllipse(5, -3, 6, 9);
      this.face.fillStyle(0x173447, 1);
      this.face.fillCircle(-5, -2, 2);
      this.face.fillCircle(5, -2, 2);
      this.face.lineStyle(2, 0x173447, 1);
      this.face.strokeCircle(0, 5, 2.5);
    } else {
      this.face.fillStyle(0xffffff, 1);
      this.face.fillEllipse(-5, -3, 6, 8);
      this.face.fillEllipse(5, -3, 6, 8);
      this.face.fillStyle(0x173447, 1);
      this.face.fillCircle(-5, -2, 2);
      this.face.fillCircle(5, -2, 2);
      this.face.lineStyle(2, 0x173447, 1);
      this.face.beginPath();
      this.face.arc(0, 0, 5, .15, Math.PI - .15, false);
      this.face.strokePath();
      this.face.fillStyle(0xffa3a8, .75);
      this.face.fillCircle(-10, 2, 2);
      this.face.fillCircle(10, 2, 2);
    }
  }

  setMood(mood) {
    if (this.mood !== mood) this.drawExpression(mood);
  }

  jump() {
    if (this.z !== 0 || this.scene.time.now < this.frozenUntil) return;
    this.vz = 250;
    this.scene.tweens.add({ targets: this.body, scaleX: 1.15, scaleY: .84, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
  }

  knockback(x, y) {
    const angle = Math.atan2(this.y - y, this.x - x);
    this.body.x = Phaser.Math.Clamp(this.x + Math.cos(angle) * 65, 30, 770);
    this.body.y = Phaser.Math.Clamp(this.y + Math.sin(angle) * 45, 90, 490);
    this.updateDepth();
  }

  freeze(duration) {
    if (!this.alive) return;
    this.frozenUntil = Math.max(this.frozenUntil, this.scene.time.now + duration);
    this.freezeRing.setVisible(true);
  }

  setShieldActive(active) {
    this.shieldRing.setVisible(active);
    if (active) this.shieldRing.setAlpha(1);
  }

  updateDepth() {
    this.body.setDepth(this.y + this.z);
    this.shadow.setPosition(this.x, this.y + 13);
    this.shadow.setScale(1 - Math.min(this.z / 500, .35), 1 - Math.min(this.z / 700, .2));
    this.label.setPosition(this.x, this.y - 43 - this.z);
    this.shadow.setDepth(this.y - 2);
  }

  eliminate() {
    if (!this.alive) return;
    this.alive = false;
    this.body.setAlpha(.35);
    this.label.setText(`${this.name} ✕`);
  }

  takeHit(respawnPoint) {
    if (!this.alive || this.invulnerable) return false;
    this.lives -= 1;
    if (this.lives <= 0) { this.eliminate(); return true; }
    this.body.setPosition(respawnPoint.x, respawnPoint.y);
    this.invulnerable = true;
    this.body.setAlpha(.45);
    this.scene.time.delayedCall(1100, () => {
      if (!this.alive) return;
      this.invulnerable = false;
      this.body.setAlpha(1);
    });
    this.updateDepth();
    return true;
  }

  destroy() { this.body.destroy(); this.shadow.destroy(); this.label.destroy(); }
}
