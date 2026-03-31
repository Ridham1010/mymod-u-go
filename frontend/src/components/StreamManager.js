/**
 * StreamManager — Continuous rolling buffer capture with zero timestamp gaps.
 *
 * Architecture:
 *   - To capture the ~5s before a violation without corrupting WebM timelines via naive
 *     blob concatenation, we use "staggered recorders".
 *   - A new 10-second MediaRecorder starts every 3 seconds. 
 *   - At any given time, there are 3-4 recorders overlapping.
 *   - Upon violation, we pick the specific recorder that started roughly 4.5 seconds ago.
 *   - We tag it, let it naturally finish its 10-second lifetime, and upload it!
 *   - Result: A perfectly valid, singular 10s WebM file with ~4.5s pre-violation 
 *     and ~5.5s post-violation context, completely avoiding the built-in player 
 *     duration glitches.
 *
 * Codec / size budget:
 *   320 × 240 VP9 @ ~200 kbps ≈ 250 KB per 10-s clip.
 *   Firebase Spark free tier: 5 GB storage, 1 GB/day egress, 20K uploads/day.
 */

const CAPTURE_DURATION_MS = 10000; // 10 seconds capture total
const STAGGER_INTERVAL_MS = 3000;  // Start a new recorder every 3 seconds
const UPLOAD_COOLDOWN_MS = 15000;  // 15s cooldown to prevent spamming

class StreamManager {
  /**
   * @param {{
   *   stream: MediaStream,
   *   sessionId: string,
   *   onClipUploaded: (url: string, eventType: string) => void,
   *   onError?: (err: Error) => void,
   * }} opts
   */
  constructor({ stream, sessionId, onClipUploaded, onError }) {
    this._stream = stream;
    this._sessionId = sessionId;
    this._onClipUploaded = onClipUploaded;
    this._onError = onError || console.error;

    this._rollingRecorders = new Set();
    this._staggerInterval = null;
    
    this._running = false;
    this._lastUploadAt = 0;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Start ready state and interval for staggered segment recording. */
  start() {
    if (this._running) return;
    this._running = true;

    // Start first recorder immediately
    this._startRollingRecorder();
    
    // Start subsequent staggered recorders
    this._staggerInterval = setInterval(() => {
      this._startRollingRecorder();
    }, STAGGER_INTERVAL_MS);
  }

  /** Stop all recording and release resources. */
  stop() {
    this._running = false;

    if (this._staggerInterval) {
      clearInterval(this._staggerInterval);
      this._staggerInterval = null;
    }

    // Stop all active recorders
    for (const rObj of this._rollingRecorders) {
      if (rObj.recorder.state !== "inactive") {
        try {
          rObj.recorder.stop();
        } catch {
          // already stopped
        }
      }
    }
    this._rollingRecorders.clear();
  }

  /**
   * Trigger a violation capture.
   */
  triggerViolationCapture(eventType) {
    if (!this._running) return;

    // Cooldown guard
    const now = Date.now();
    if (now - this._lastUploadAt < UPLOAD_COOLDOWN_MS) return;

    // Pick the most ideal running recorder: we want one that has approx 4.5s of history
    // (so ~4.5s before violation, ~5.5s after).
    let bestRecorder = null;
    let closestToTarget = Infinity;
    const TARGET_AGE = 4500; // aim for 4.5s old

    for (const rObj of this._rollingRecorders) {
      if (rObj.isViolationTarget) continue; // Skip if already claimed
      
      const age = now - rObj.startTime;
      if (age > 0) {
        // Penalize ages over 5000ms significantly so we respect the
        // "don't do MORE than 5 seconds before" requirement!
        let penalty = 0;
        if (age > 5000) penalty = (age - 5000) * 2; 

        const diff = Math.abs(TARGET_AGE - age) + penalty;
        if (diff < closestToTarget) {
          closestToTarget = diff;
          bestRecorder = rObj;
        }
      }
    }

    if (!bestRecorder) return; // Should only happen if stream just started tightly or stopped

    bestRecorder.isViolationTarget = true;
    bestRecorder.eventType = eventType;
    this._lastUploadAt = now;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _startRollingRecorder() {
    if (!this._running) return;

    const recorder = this._createRecorder();
    const rObj = {
      recorder,
      startTime: Date.now(),
      chunks: [],
      isViolationTarget: false,
      eventType: null
    };

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        rObj.chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      // Remove from active list
      this._rollingRecorders.delete(rObj);
      
      // If this specific interval was flagged for upload, process it
      if (rObj.isViolationTarget && rObj.chunks.length > 0) {
        const mergedBlob = new Blob(rObj.chunks, { type: recorder.mimeType || "video/webm" });
        this._uploadClip(mergedBlob, rObj.eventType);
      }
    };

    recorder.start(1000);
    this._rollingRecorders.add(rObj);

    // Stop and discard (if no violation) after CAPTURE_DURATION_MS
    setTimeout(() => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }, CAPTURE_DURATION_MS);
  }

  _createRecorder() {
    // Prefer VP9; fall back to VP8 or default if unsupported
    const mimeTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    let mimeType = "";
    for (const mt of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mt)) {
        mimeType = mt;
        break;
      }
    }

    const recorder = new MediaRecorder(this._stream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 200_000, // ~200 kbps — keeps files small
    });

    return recorder;
  }

  /**
   * Upload the merged violation clip to Cloudinary.
   */
  async _uploadClip(blob, eventType) {
    try {
      const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
      const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

      if (!cloudName || !uploadPreset) {
        throw new Error("Cloudinary configuration missing in environment variables.");
      }

      const timestamp = Date.now();
      const fileName = `${timestamp}_${eventType}`;

      const formData = new FormData();
      formData.append("file", blob);
      formData.append("upload_preset", uploadPreset);
      formData.append("folder", `violation-clips/${this._sessionId}`);
      formData.append("public_id", fileName);
      formData.append("resource_type", "video");

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || "Cloudinary upload failed");
      }

      const data = await res.json();
      console.log("Cloudinary Upload SUCCESS:", data.secure_url);
      this._onClipUploaded(data.secure_url, eventType);
    } catch (err) {
      this._onError(err);
    }
  }
}

export default StreamManager;
