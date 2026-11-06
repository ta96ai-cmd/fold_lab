// MP4 export: renders every frame offline (so it's perfectly smooth), encodes H.264 with WebCodecs.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { frameTimes } from './sizes.js';

const CODECS = ['avc1.640033', 'avc1.640032', 'avc1.4d0033', 'avc1.42003e', 'avc1.42001f'];

export function videoSupported() { return typeof window.VideoEncoder === 'function'; }

async function pickCodec(w, h, fps, bitrate) {
  for (const codec of CODECS) {
    const cfg = { codec, width: w, height: h, framerate: fps, bitrate, avc: { format: 'avc' } };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch { /* try next */ }
  }
  throw new Error('This browser can’t encode MP4 (H.264). Use the latest Chrome or Edge.');
}

/**
 * viewer: from createViewer. move: camera move name. setFrame(t): updates the box (e.g. lid) for progress t.
 * onProgress(0..1). signal: { cancelled } to stop early.
 */
export async function exportVideo(viewer, { move, w, h, fps = 60, seconds = 6.5, setFrame, onProgress, signal = {} }) {
  if (!videoSupported()) throw new Error('This browser can’t encode video. Use the latest Chrome or Edge.');
  const bitrate = Math.round(w * h * fps * 0.1);
  const cfg = await pickCodec(w, h, fps, bitrate);
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width: w, height: h, frameRate: fps }, fastStart: 'in-memory' });
  let failure = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => (failure = e) });
  encoder.configure(cfg);

  setFrame && setFrame(0.5);           // frame the shot with the lid fully open
  const R = viewer.moveRadius();
  const canvas = viewer.beginOffscreen(w, h);
  try {
    const frames = frameTimes(seconds, fps);
    for (const f of frames) {
      if (signal.cancelled) throw new Error('cancelled');
      if (failure) throw failure;
      setFrame && setFrame(f.t);
      viewer.placeCamera(move, f.t, R);
      viewer.renderNow();
      const frame = new VideoFrame(canvas, { timestamp: f.us, duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: f.i % (fps * 2) === 0 });
      frame.close();
      if (encoder.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 0));
      if (f.i % 5 === 0) { onProgress && onProgress(f.i / frames.length); await new Promise(r => setTimeout(r, 0)); }
    }
    await encoder.flush();
    if (failure) throw failure;
    muxer.finalize();
    onProgress && onProgress(1);
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    if (encoder.state !== 'closed') encoder.close();
    viewer.endOffscreen();
  }
}
