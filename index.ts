/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
import * as bodyPix from '@tensorflow-models/body-pix';
import Stats from 'stats.js';

import * as partColorScales from './part_color_scales';
import {bottom, BoundingBox, ensureOffscreenCanvasCreated, getPartBoundingBoxes, height, left, right, shuffle, top, width} from './util';

const stats = new Stats();

type State = {
  video: HTMLVideoElement,
  net: bodyPix.BodyPix
}

const state: State = {
  video: null,
  net: null
};

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

function isiOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isMobile() {
  return isAndroid() || isiOS();
}

// async function getVideoInputs() {
//   if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
//     console.log('enumerateDevices() not supported.');
//     return [];
//   }

//   const devices = await navigator.mediaDevices.enumerateDevices();

//   const videoDevices = devices.filter(device => device.kind ===
//   'videoinput');

//   return videoDevices;
// }

// async function getDeviceIdForLabel(cameraLabel) {
//   const videoInputs = await getVideoInputs();

//   for (let i = 0; i < videoInputs.length; i++) {
//     const videoInput = videoInputs[i];
//     if (videoInput.label === cameraLabel) {
//       return videoInput.deviceId;
//     }
//   }

//   return null;
// }

// on mobile, facing mode is the preferred way to select a camera.
// Here we use the camera label to determine if its the environment or
// user facing camera
function getFacingMode(cameraLabel) {
  if (!cameraLabel) {
    return 'user';
  }
  if (cameraLabel.toLowerCase().includes('back')) {
    return 'environment';
  } else {
    return 'user';
  }
}

async function getConstraints(cameraLabel) {
  let deviceId;
  let facingMode;

  if (cameraLabel) {
    // deviceId = await getDeviceIdForLabel(cameraLabel);
    // on mobile, use the facing mode based on the camera.
    facingMode = isMobile() ? getFacingMode(cameraLabel) : null;
  };
  return {facingMode, width: 600};
}

/**
 * Loads a the camera to be used in the demo
 *
 */
async function setupCamera(cameraLabel?: string) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
        'Browser API navigator.mediaDevices.getUserMedia not available');
  }

  const videoElement = document.getElementById('video') as HTMLVideoElement;

  const videoConstraints = await getConstraints(cameraLabel);

  const stream = await navigator.mediaDevices.getUserMedia(
      {'audio': false, 'video': videoConstraints});
  videoElement.srcObject = stream;

  return new Promise<HTMLVideoElement>((resolve) => {
    videoElement.onloadedmetadata = () => {
      videoElement.width = videoElement.videoWidth;
      videoElement.height = videoElement.videoHeight;
      resolve(videoElement);
    };
  });
}


async function loadVideo(cameraLabel?: string) {
  try {
    state.video = await setupCamera(cameraLabel);
  } catch (e) {
    let info = document.getElementById('info');
    info.textContent = 'this browser does not support video capture,' +
        'or this device does not have a camera';
    info.style.display = 'block';
    throw e;
  }

  state.video.play();
}

function toCameraOptions(cameras) {
  const result = {default: null};

  cameras.forEach(camera => {
    result[camera.label] = camera.label;
  })

  return result;
}

/**
 * Sets up a frames per second panel on the top-left of the window
 */
function setupFPS() {
  stats.showPanel(0);  // 0: fps, 1: ms, 2: mb, 3+: custom
  document.body.appendChild(stats.dom);
}

function drawBoundingBox(box: BoundingBox, ctx: CanvasRenderingContext2D) {
  ctx.rect(
      box[left], box[bottom], box[right] - box[left], box[top] - box[bottom]);
  ctx.stroke();
}


const numParts = 24;

const randomPartOrder = shuffle(Array.from(Array(numParts).keys()));

function swapBox(
    a: BoundingBox, b: BoundingBox, ctx: CanvasRenderingContext2D) {
  // console.log(a[height], b[height], a[width], b[width]);

  if (a[height] * b[height] * a[width] * b[width] === 0) {
    return;
  }

  // console.log(a, b);

  const image = ctx.getImageData(a[left], a[top], a[width], a[height]);

  const swapImage = ctx.getImageData(b[left], b[top], b[width], b[height]);

  // console.log('swap');

  ctx.save();
  ctx.scale(b[width] / a[width], b[height] / a[height]);
  ctx.putImageData(swapImage, a[left], a[top]);
  ctx.restore();
  ctx.save();
  ctx.scale(a[width] / b[width], a[height] / b[height]);
  ctx.putImageData(image, b[left], b[top]);
  ctx.restore();
}

const rightHand = 21;
const leftHand = 23;
const leftFace = 0;
const rightFace = 1;

function swapBoundingBoxes(
    partBoundingBoxes: BoundingBox[], ctx: CanvasRenderingContext2D) {
  for (let i = 0; i < 2; i++) {
    const randomPart = i === 0 ? leftHand : rightHand;

    const boundingBox = partBoundingBoxes[i];
    // const nextBoundingBox = boundingBox === numParts - 1 ? 0 : i + 1;
    const randomBoundingBox = partBoundingBoxes[randomPart];
    // console.log(i, nextBoundingBox, boundingBox, randomBoundingBox);

    // console.log(i);

    if (boundingBox && randomBoundingBox) {
      swapBox(boundingBox, randomBoundingBox, ctx);
    }
  }
}

function flip(ctx: CanvasRenderingContext2D) {
  const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-ctx.canvas.width, 0);

  ctx.putImageData(image, 0, 0);
  ctx.restore();
}

/**
 * Feeds an image to BodyPix to estimate segmentation - this is where the
 * magic happens. This function loops with a requestAnimationFrame method.
 */
function segmentBodyInRealTime() {
  const canvas = document.getElementById('output') as HTMLCanvasElement;
  // since images are being fed from a webcam

  async function bodySegmentationFrame() {
    // if changing the model or the camera, wait a second for it to complete
    // then try again.

    // Begin monitoring code for frames per second
    stats.begin();

    // Scale an image down to a certain factor. Too large of an image will
    // slow down the GPU
    const outputStride = 8;

    const flipHorizontally = true;

    const segmentationThreshold = 0.5;

    const partSegmentation = await state.net.estimatePartSegmentation(
        state.video, outputStride, segmentationThreshold);

    const partBoundingBoxes: BoundingBox[] =
        getPartBoundingBoxes(partSegmentation);

    canvas.width = state.video.width;
    canvas.height = state.video.height;

    const ctx = canvas.getContext('2d');

    ctx.drawImage(state.video, 0, 0);

    partBoundingBoxes.forEach(
        box => {
            // draw bounding boxes
            // drawBoundingBox(box, ctx);
        });

    swapBoundingBoxes(partBoundingBoxes, ctx);
    // End monitoring code for frames per second
    stats.end();

    requestAnimationFrame(bodySegmentationFrame);
  }

  bodySegmentationFrame();
}

/**
 * Kicks off the demo.
 */
export async function bindPage() {
  // Load the BodyPix model weights with architecture 0.75
  state.net = await bodyPix.load(0.75);

  document.getElementById('loading').style.display = 'none';
  document.getElementById('main').style.display = 'inline-block';

  await loadVideo();

  setupFPS();

  segmentBodyInRealTime();
}


navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
// kick off the demo
bindPage();
