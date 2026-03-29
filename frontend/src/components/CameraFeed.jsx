import React, { useState, useEffect, useRef } from "react";
import "./CameraFeed.css";

const CameraFeed = ({ 
  videoRef, 
  canvasRef, 
  isActive = true,
  showCanvas = false,
  width = 320,
  height = 240,
  onFrame = null 
}) => {
  const [error, setError] = useState(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null); // Store stream separately so cleanup can stop it even after DOM unmounts

  useEffect(() => {
    if (!isActive) return;

    const startCamera = async () => {
      try {
        setError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: width },
            height: { ideal: height },
          },
          audio: false,
        });

        // Keep the raw stream in a ref so cleanup can always stop it.
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              videoRef.current.play();
              if (canvasRef.current) {
                canvasRef.current.width = videoRef.current.videoWidth || width;
                canvasRef.current.height = videoRef.current.videoHeight || height;
              }
            }
          };
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError(
          err.name === "NotAllowedError"
            ? "Camera permission denied"
            : "Failed to access camera"
        );
      }
    };

    startCamera();

    return () => {
      // Stop via streamRef first — reliable even when videoRef.current is null.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [isActive, videoRef, canvasRef, width, height]);

  // Frame capture callback
  useEffect(() => {
    if (!isActive || !videoRef.current || !onFrame) return;

    let isProcessing = false;

    const captureFrame = async () => {
      // Check if video is actually playing/ready and we're not busy
      if (videoRef.current.readyState >= 2 && !isProcessing) {
        isProcessing = true;
        try {
          await onFrame(videoRef.current, canvasRef.current);
        } catch (err) {
          console.error("Frame processing error:", err);
        } finally {
          isProcessing = false;
        }
      }
      animationFrameRef.current = requestAnimationFrame(captureFrame);
    };

    animationFrameRef.current = requestAnimationFrame(captureFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, videoRef, canvasRef, onFrame]);

  return (
    <div className="camera-feed-container">
      <div className="camera-wrapper">
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          playsInline
          muted
          onContextMenu={(e) => e.preventDefault()}
        />
        {showCanvas && (
          <canvas
            ref={canvasRef}
            className="camera-canvas"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              display: "block",
            }}
          />
        )}
        {error && <div className="camera-error">{error}</div>}
      </div>
    </div>
  );
};

export default CameraFeed;
