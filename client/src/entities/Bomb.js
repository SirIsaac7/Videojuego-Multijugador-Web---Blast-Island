import Phaser from 'phaser';

export const BOMB_TYPES = {
  normal: { name: 'Bomba clásica', radius: 82, color: 0xffcf68 },
  sticky: { name: 'Bomba pegajosa', radius: 82, color: 0x9de56c },
  ice: { name: 'Bomba de hielo', radius: 82, color: 0x76eaff },
  instant: { name: 'Bomba instantánea', radius: 96, color: 0xff5d68 }
};

export const BOMB_TYPE_POOL = ['normal', 'normal', 'normal', 'sticky', 'ice', 'instant'];
const SHELL_COLORS = { normal: 0x26384a, sticky: 0x38572d, ice: 0x19485b, instant: 0x5b202b };

export class Bomb extends Phaser.GameObjects.Container {
  constructor(scene, id, x, y, direction = 1, type = 'normal', thrownBy = null) {
    super(scene, x, y);
    this.id = id;
    this.type = BOMB_TYPES[type] ? type : 'normal';
    this.thrownBy = thrownBy;
    this.stuckTo = null;
    this.warningArea = scene.add.circle(x, y, BOMB_TYPES[this.type].radius, BOMB_TYPES[this.type].color, .12)
      .setStrokeStyle(3, BOMB_TYPES[this.type].color, .75)
      .setDepth(4.5)
      .setVisible(false);
    const vector = typeof direction === 'number' ? { x: direction, y: 0 } : direction;
    const magnitude = Math.hypot(vector.x, vector.y) || 1;
    const directionX = vector.x / magnitude;
    const directionY = vector.y / magnitude;
    this.vx = directionX * 145;
    this.vy = directionY ? directionY * 145 : directionX ? -28 : 0;
    this.life = this.type === 'instant' && (directionX || directionY) ? 90 : 2400;
    const shadow = scene.add.ellipse(0, 9, 24, 8, 0x102c35, .35);
    const color = BOMB_TYPES[this.type].color;
    const ball = scene.add.circle(0, 0, 11, SHELL_COLORS[this.type]).setStrokeStyle(3, color);
    this.shell = ball;
    this.shellColor = SHELL_COLORS[this.type];
    this.warningColor = color;
    this.add([shadow, ball]);
    if (this.type === 'sticky') {
      this.add([
        scene.add.circle(-8, -8, 3, color),
        scene.add.circle(8, -7, 3, color),
        scene.add.circle(0, -12, 3, color)
      ]);
    } else if (this.type === 'ice') {
      this.add(scene.add.text(0, 0, '❄', { fontFamily: 'Arial', fontSize: '13px', color: '#ffffff' }).setOrigin(.5));
    } else if (this.type === 'instant') {
      this.add(scene.add.text(0, 0, '☠', { fontFamily: 'Arial', fontSize: '13px', color: '#ffffff' }).setOrigin(.5));
    } else {
      this.add(scene.add.circle(0, -11, 3, 0xffa04d));
    }
    this.blinkParts = [...this.list];
    scene.add.existing(this);
    this.setDepth(y + 1);
  }

  update(delta) {
    this.life -= delta;
    if (this.stuckTo?.alive) {
      this.setPosition(this.stuckTo.x, this.stuckTo.y - 20);
    } else {
      const previousX = this.x;
      const previousY = this.y;
      this.x += this.vx * delta / 1000;
      this.y += this.vy * delta / 1000;
      if (!this.scene.isCircleInsideArena(this.x, this.y, 10)) {
        this.setPosition(previousX, previousY);
        this.vx = 0;
        this.vy = 0;
      }
      this.vx *= Math.pow(.985, delta / (1000 / 60));
      if (this.type === 'sticky' && this.thrownBy) {
        const target = [...this.scene.players.values()].find(player =>
          player.alive && player.id !== this.thrownBy &&
          Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y) < 28
        );
        if (target) {
          this.stuckTo = target;
          this.vx = 0;
          this.vy = 0;
        }
      }
    }
    this.warningArea.setPosition(this.x, this.y);
    const warningActive = this.life <= 1000 && this.life > 0;
    this.warningArea.setVisible(warningActive);
    if (warningActive) {
      const blinkRate = this.life < 350 ? 45 : 110;
      const visible = Math.floor(this.life / blinkRate) % 2 === 0;
      this.warningArea.setAlpha(visible ? .22 : .06);
      this.warningArea.setStrokeStyle(3, BOMB_TYPES[this.type].color, visible ? .95 : .35);
    }
    const thrower = this.thrownBy ? this.scene.players.get(this.thrownBy) : null;
    if (thrower?.inputType !== 'ai' && this.thrownBy && this.life <= 1000 && this.life > 0) {
      const blinkRate = this.life < 350 ? 42 : 85;
      const visible = Math.floor(this.life / blinkRate) % 2 === 0;
      for (const part of this.blinkParts) part.setAlpha(visible ? 1 : .16);
      this.shell.setFillStyle(visible ? this.warningColor : this.shellColor);
      this.shell.setStrokeStyle(3, this.warningColor, visible ? 1 : .35);
    } else {
      for (const part of this.blinkParts) part.setAlpha(1);
      this.shell.setFillStyle(this.shellColor);
      this.shell.setStrokeStyle(3, this.warningColor, 1);
    }
    if (this.life <= 0) {
      this.scene.handleEvent({
        type: 'bomb:explode',
        id: this.id,
        x: this.x,
        y: this.y,
        radius: BOMB_TYPES[this.type].radius,
        bombType: this.type
      });
    }
  }

  destroy(fromScene) {
    this.warningArea?.destroy();
    super.destroy(fromScene);
  }
}
