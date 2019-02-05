import * as bodyPix from '@tensorflow-models/body-pix';

type PartSegmentation = {
  data: Int32Array,
  width: number,
  height: number
};

export type BoundingBox = [number, number, number, number, number, number];

export const top = 0;
export const right = 1;
export const bottom = 2;
export const left = 3;
export const width = 4;
export const height = 5;

export function getPartBoundingBoxes(partSementation: PartSegmentation):
    BoundingBox[] {
  const {height: segmentationHeight, width: segmentationWidth, data} =
      partSementation;
  const boundingBoxes: BoundingBox[] = [];

  for (let i = 0; i < segmentationHeight * segmentationWidth; ++i) {
    // invert mask.  Invert the segmentatino mask.
    const partId = Math.round(data[i]);
    const j = i * 4;

    if (partId === -1) {
      continue;
    } else {
      const x = i % segmentationWidth;
      const y = Math.floor(i / segmentationWidth);

      if (!boundingBoxes[partId]) {
        boundingBoxes[partId] = [y, x, y, x, 0, 0];
      } else {
        const boundingBox = boundingBoxes[partId];

        boundingBox[top] = Math.min(boundingBox[top], y);
        boundingBox[right] = Math.max(boundingBox[right], x);
        boundingBox[bottom] = Math.max(boundingBox[bottom], y);
        boundingBox[left] = Math.min(boundingBox[left], x);
        boundingBox[height] = boundingBox[bottom] - boundingBox[top];
        boundingBox[width] = boundingBox[right] - boundingBox[left];
      }
    }
  }

  // console.log(boundingBoxes);
  return boundingBoxes;
}

/**
 * Shuffles array in place. ES6 version
 * @param {Array} a items An array containing the items.
 */
export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createOffScreenCanvas(): HTMLCanvasElement {
  const offScreenCanvas = document.createElement('canvas');
  return offScreenCanvas;
}

const offScreenCanvases: {[name: string]: HTMLCanvasElement} = {};

export function ensureOffscreenCanvasCreated(id: string): HTMLCanvasElement {
  if (!offScreenCanvases[id]) {
    offScreenCanvases[id] = createOffScreenCanvas();
  }
  return offScreenCanvases[id];
}
