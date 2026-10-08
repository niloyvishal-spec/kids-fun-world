/** Tiny promise-based delay that respects scene lifetime. */
export function wait(scene: Phaser.Scene, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (!scene.scene.isActive()) {
      resolve();
      return;
    }
    scene.time.delayedCall(ms, () => resolve());
  });
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function choice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
