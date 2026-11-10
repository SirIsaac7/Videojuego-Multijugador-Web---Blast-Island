export const ARENAS = [
  { id: 'laguna', name: 'Laguna Prismatica', description: 'Un islote en forma de diamante sobre agua turquesa.', colors: { sky: [0x65bfc4, 0x12354d], floor: 0x4c8790, edge: 0x173c4b, shadow: 0x183e4c, accent: '#d5f4ee' }, floorPoints: [{ x: 38, y: 112 }, { x: 762, y: 112 }, { x: 700, y: 478 }, { x: 100, y: 478 }], music: ['/audio/Ost1.mp3'] },
  { id: 'volcan', name: 'Caldera Carmesi', description: 'Una caldera octogonal iluminada por lava.', colors: { sky: [0x913f42, 0x180f22], floor: 0x633239, edge: 0x2b1520, shadow: 0x351622, accent: '#ffd49a' }, floorPoints: [{ x: 150, y: 100 }, { x: 650, y: 100 }, { x: 770, y: 220 }, { x: 725, y: 430 }, { x: 600, y: 478 }, { x: 200, y: 478 }, { x: 75, y: 430 }, { x: 30, y: 220 }], music: ['/audio/Ost2.mp3'] },
  { id: 'neon', name: 'Azotea Neon', description: 'Una azotea con pasillos y esquinas recortadas.', colors: { sky: [0x34316d, 0x090d20], floor: 0x292b5a, edge: 0x0d1132, shadow: 0x121333, accent: '#8cf9ff' }, floorPoints: [{ x: 65, y: 150 }, { x: 285, y: 150 }, { x: 285, y: 100 }, { x: 515, y: 100 }, { x: 515, y: 150 }, { x: 735, y: 150 }, { x: 735, y: 425 }, { x: 570, y: 425 }, { x: 570, y: 478 }, { x: 230, y: 478 }, { x: 230, y: 425 }, { x: 65, y: 425 }], music: ['/audio/Ost3.mp3'] }
];

export const getArena = id => ARENAS.find(arena => arena.id === id) || ARENAS[0];
