/**
 * StreamManager — Continuous 5-second segment capture with violation-triggered upload.
 *
 * Architecture:
 *   - MediaRecorder records the webcam stream in 5-second chunks using VP9.
 *   - A circular buffer retains only the PREVIOUS completed segment (one Blob).
 *     No compliant footage is ever transmitted.
 *   - On anomaly detection the caller invokes `triggerViolationCapture()`:
 *       1. The "pre" segment (last 5 s) is immediately frozen from the buffer.
 *       2. Recording continues for another 5 s to capture the "post" segment.
 *       3. Both blobs are concatenated and uploaded to Firebase Storage.
 *       4. The download URL is returned via a callback.
 *   - A 30-second cooldown prevents rapid-fire uploads from draining bandwidth.
 *
 * Codec / size budget:
 *   320 × 240 VP9 @ ~200 kbps ≈ 125 KB per 5-s segment ≈ 250 KB per 10-s clip.
 *   Firebase Spark free tier: 5 GB storage, 1 GB/day egress, 20K uploads/day.
 */

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../config/firebase";

const SEGMENT_DURATION_MS = 5000;
const UPLOAD_COOLDOWN_MS = 30000;

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

    // Circular buffer: holds the PREVIOUS completed segment
    this._previousSegment = null;
    // Chunks accumulating for the CURRENT segment being recorded
    this._currentChunks = [];

    this._recorder = null;
    this._segmentTimer = null;
    this._running = false;
    this._capturing = false; // true while a violation capture is in progress
    this._lastUploadAt = 0;

    // For violation capture
    this._violationEventType = null;
    this._preBlob = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Start continuous segment recording. */
  start() {
    if (this._running) return;
    this._running = true;
    this._startNewSegment();
  }

  /** Stop all recording and release resources. */
  stop() {
    this._running = false;
    this._capturing = false;

    if (this._segmentTimer) {
      clearTimeout(this._segmentTimer);
      this._segmentTimer = null;
    }

    if (this._recorder && this._recorder.state !== "inactive") {
      try {
        this._recorder.stop();
      } catch {
        // already stopped
      }
    }
    this._recorder = null;
    this._previousSegment = null;
    this._currentChunks = [];
  }

  /**
   * Trigger a violation capture.
   *
   * Freezes the previous 5-second segment as the "pre" portion, then records
   * 5 more seconds as the "post" portion, concatenates them, uploads to
   * Firebase Storage, and invokes onClipUploaded with the download URL.
   *
   * No-ops if a capture is already in progress or cooldown hasn't elapsed.
   *
   * @param {string} eventType — e.g. "face_not_detected", "multiple_faces", etc.
   */
  triggerViolationCapture(eventType) {
    if (this._capturing || !this._running) return;

    // Cooldown guard
    const now = Date.now();
    if (now - this._lastUploadAt < UPLOAD_COOLDOWN_MS) return;

    this._capturing = true;
    this._violationEventType = eventType;
    this._lastUploadAt = now;

    // 1. Freeze the pre-segment (may be null if exam just started — that's fine)
    this._preBlob = this._previousSegment;

    // 2. Stop the current segment immediately and start a fresh "post" segment
    this._stopCurrentRecorder();

    // Start a new recorder for the post-violation segment
    this._startPostCapture();
  }

  // ── Internal ────────────────────────────────────────────────────────────────

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
   * Start recording a new normal (non-violation) segment.
   * When it finishes (after SEGMENT_DURATION_MS), the Blob rotates into the
   * circular buffer and the next segment begins automatically.
   */
  _startNewSegment() {
    if (!this._running || this._capturing) return;

    this._currentChunks = [];
    this._recorder = this._createRecorder();

    this._recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this._currentChunks.push(e.data);
      }
    };

    this._recorder.onstop = () => {
      if (this._currentChunks.length > 0 && !this._capturing) {
        // Rotate: current → previous (old previous is garbage-collected)
        this._previousSegment = new Blob(this._currentChunks, {
          type: this._recorder?.mimeType || "video/webm",
        });
      }
      // If running and NOT in capture mode, start the next segment
      if (this._running && !this._capturing) {
        this._startNewSegment();
      }
    };

    this._recorder.start();

    // After SEGMENT_DURATION_MS, stop to finalize the segment
    this._segmentTimer = setTimeout(() => {
      this._stopCurrentRecorder();
    }, SEGMENT_DURATION_MS);
  }

  _stopCurrentRecorder() {
    if (this._segmentTimer) {
      clearTimeout(this._segmentTimer);
      this._segmentTimer = null;
    }
    if (this._recorder && this._recorder.state !== "inactive") {
      try {
        this._recorder.stop();
      } catch {
        // already stopped
      }
    }
  }

  /**
   * Record the 5-second "post" violation segment, then merge + upload.
   */
  _startPostCapture() {
    this._currentChunks = [];
    this._recorder = this._createRecorder();

    this._recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this._currentChunks.push(e.data);
      }
    };

    this._recorder.onstop = () => {
      const postBlob = new Blob(this._currentChunks, {
        type: this._recorder?.mimeType || "video/webm",
      });

      // Merge pre + post
      const parts = [];
      if (this._preBlob) parts.push(this._preBlob);
      parts.push(postBlob);

      const mergedBlob = new Blob(parts, { type: postBlob.type });

      // Upload asynchronously
      this._uploadClip(mergedBlob, this._violationEventType);

      // Reset state and resume normal segment recording
      this._capturing = false;
      this._preBlob = null;
      this._violationEventType = null;
      this._previousSegment = null; // clear stale pre-segment

      if (this._running) {
        this._startNewSegment();
      }
    };

    this._recorder.start();

    // Stop after SEGMENT_DURATION_MS to finalize post capture
    this._segmentTimer = setTimeout(() => {
      this._stopCurrentRecorder();
    }, SEGMENT_DURATION_MS);
  }

  /**
   * Upload the merged violation clip to Firebase Storage.
   * Path: violation-clips/{sessionId}/{timestamp}_{eventType}.webm
   */
  async _uploadClip(blob, eventType) {
    try {
      const timestamp = Date.now();
      const path = `violation-clips/${this._sessionId}/${timestamp}_${eventType}.webm`;
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, blob, {
        contentType: blob.type || "video/webm",
      });

      const downloadURL = await getDownloadURL(storageRef);
      this._onClipUploaded(downloadURL, eventType);
    } catch (err) {
      this._onError(err);
    }
  }
}

export default StreamManager;
