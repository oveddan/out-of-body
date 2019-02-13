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
import {bottom, BoundingBox, drawBoundingBoxes, drawOnFace, ensureOffscreenCanvasCreated, getPartBoundingBoxes, height, left, loadImage, right, shuffle, swapBox, top, width} from './util';

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

const numParts = 24;

const faceImageUrl = require('./assets/harvey.png');

/**
 * Feeds an image to BodyPix to estimate segmentation - this is where the
 * magic happens. This function loops with a requestAnimationFrame method.
 */
async function segmentBodyInRealTime() {
  const canvas = document.getElementById('output') as HTMLCanvasElement;
  // since images are being fed from a webcam

  const faceImage = await loadImage(faceImageUrl);

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

    // drawBoundingBoxes(partBoundingBoxes, ctx);
    // swapBoundingBoxes(partBoundingBoxes, ctx);
    drawOnFace(ctx, partBoundingBoxes, faceImage);

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

  // setupFPS();

  segmentBodyInRealTime();
}


navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
// kick off the demo
bindPage();
