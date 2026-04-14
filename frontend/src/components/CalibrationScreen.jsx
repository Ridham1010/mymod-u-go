import React, { useState, useEffect, useRef, useCallback } from "react";
import * as faceapi from "face-api.js";
import { examService } from "../services/examService";
import CameraFeed from "./CameraFeed";
import "./CalibrationScreen.css";

const CalibrationScreen = ({ onCalibrationComplete, onCalibrationFailed, token, sessionId }) => {
  const [status, setStatus] = useState("loading"); // loading, calibrating, complete, error
  const [timeRemaining, setTimeRemaining] = useState(10);
  const [faceDetectionStats, setFaceDetectionStats] = useState({
    framesAnalyzed: 0,
    facesDetected: 0,
    detectionRate: 0,
    faceDistances: [],
    lightingLevels: [],
  });
  const [calibrationData, setCalibrationData] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const modelsLoadedRef = useRef(false);
  const isCalibrationCompleteRef = useRef(false);
  const statsCollectorRef = useRef({
    framesAnalyzed: 0,
    facesDetected: 0,
    faceDistances: [],
    lightingLevels: [],
    detectionTimestamps: [],
  });

  // Load face-api models ONCE on component mount
  useEffect(() => {
    // Prevent multiple load attempts
    if (modelsLoadedRef.current) return;
    
    const loadModels = async () => {
      try {
        console.log("Starting model load...");
        // Load models from CDN
        const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.load(MODEL_URL),
          faceapi.nets.faceLandmark68Net.load(MODEL_URL),
          faceapi.nets.faceRecognitionNet.load(MODEL_URL),
        ]);
        
        console.log("Models loaded successfully");
        modelsLoadedRef.current = true;
        
        // Start calibration immediately
        setStatus("calibrating");
        setTimeRemaining(10);
      } catch (error) {
        console.error("Failed to load face detection models:", error);
        setStatus("error");
        onCalibrationFailed?.("Failed to load face detection models");
      }
    };

    loadModels();
  }, []); // Empty dependency - run only once on mount

  // Start 10-second calibration timer - ONLY when calibrating starts
  useEffect(() => {
    if (status !== "calibrating") return;

    console.log("Timer started - 10 seconds");
    
    // Ensure timer starts at 10
    setTimeRemaining(10);
    
    let secondsRemaining = 10;
    
    timerRef.current = setInterval(() => {
      secondsRemaining--;
      console.log("Time remaining:", secondsRemaining);
      setTimeRemaining(secondsRemaining);
      
      if (secondsRemaining <= 0) {
        clearInterval(timerRef.current);
        completeCalibration();
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [status]);

  // Calculate lighting level from canvas
  const calculateLightingLevel = (canvas) => {
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );
    const data = imageData.data;

    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return sum / (data.length / 4);
  };

  // Calculate face distance (relative face size)
  const calculateFaceDistance = (detection) => {
    if (!detection) return 0;
    const faceVolume =
      detection.box.width * detection.box.height;
    return Math.sqrt(faceVolume);
  };

  // Frame processing callback - memoized to prevent CameraFeed re-renders
  const handleFrame = useCallback(async (video, canvas) => {
    if (
      !video ||
      !canvas ||
      status !== "calibrating" ||
      isCalibrationCompleteRef.current
    ) {
      return;
    }

    try {
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();

      const stats = statsCollectorRef.current;
      stats.framesAnalyzed++;

      // Draw face detections
      const displaySize = {
        width: canvas.width,
        height: canvas.height,
      };

      faceapi.matchDimensions(canvas, displaySize);
      const resizedDetections = faceapi.resizeResults(
        detections,
        displaySize
      );

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Find the primary face (largest area)
      let largestFaceIndex = 0;
      let maxArea = 0;
      resizedDetections.forEach((detection, idx) => {
        const box = detection.detection.box;
        const area = box.width * box.height;
        if (area > maxArea) {
          maxArea = area;
          largestFaceIndex = idx;
        }
      });

      // Draw boxes and landmarks
      resizedDetections.forEach((detection, idx) => {
        const box = detection.detection.box;
        const isMainFace = idx === largestFaceIndex || resizedDetections.length === 1;
        const color = isMainFace ? "#00FF00" : "#FF0000";
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(
          box.x,
          box.y,
          box.width,
          box.height
        );

        // Draw landmarks
        if (detection.landmarks) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.5;
          detection.landmarks.positions.forEach((point) => {
            ctx.fillRect(point.x - 2, point.y - 2, 4, 4);
          });
          ctx.globalAlpha = 1;
        }
      });

      // Track maximum simultaneous faces
      stats.maxSimultaneousFaces = Math.max(stats.maxSimultaneousFaces || 0, detections.length);

      // Collect calibration data
      if (detections.length === 1) {
        const detection = detections[0];
        stats.facesDetected++;
        stats.detectionTimestamps.push(Date.now());

        const faceDistance = calculateFaceDistance(detection.detection);
        stats.faceDistances.push(faceDistance);

        const lightingLevel = calculateLightingLevel(canvas);
        stats.lightingLevels.push(lightingLevel);
      } else if (detections.length > 1) {
        // Multiple faces detected - not ideal for calibration
        ctx.fillStyle =
          "rgba(255, 0, 0, 0.3)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#FF0000";
        ctx.font = "16px Arial";
        ctx.fillText(
          `Multiple faces detected (${detections.length})`,
          10,
          30
        );
      }

      // Update stats UI periodically
      if (stats.framesAnalyzed % 10 === 0) {
        setFaceDetectionStats({
          framesAnalyzed: stats.framesAnalyzed,
          facesDetected: stats.facesDetected,
          detectionRate: Math.round(
            (stats.facesDetected / stats.framesAnalyzed) * 100
          ),
          faceDistances: stats.faceDistances,
          lightingLevels: stats.lightingLevels,
        });
      }
    } catch (error) {
      console.error("Error detecting faces:", error);
    }
  }, [status]);

  // Complete calibration and send data to backend
  const completeCalibration = async () => {
    if (isCalibrationCompleteRef.current) return;
    isCalibrationCompleteRef.current = true;
    clearInterval(timerRef.current);
    setStatus("complete");

    try {
      const stats = statsCollectorRef.current;
      
      // Calculate calibration thresholds
      const avgDistance =
        stats.faceDistances.length > 0
          ? stats.faceDistances.reduce((a, b) => a + b, 0) /
            stats.faceDistances.length
          : 0;

      const avgLighting =
        stats.lightingLevels.length > 0
          ? stats.lightingLevels.reduce((a, b) => a + b, 0) /
            stats.lightingLevels.length
          : 0;

      const detectionRate = stats.framesAnalyzed > 0
        ? Math.round((stats.facesDetected / stats.framesAnalyzed) * 100)
        : 0;

      const calibrationData = {
        status: "calibrated",
        timestamp: new Date(),
        duration: 10,
        framesAnalyzed: stats.framesAnalyzed,
        facesDetected: stats.maxSimultaneousFaces || 0,
        detectionRate,
        thresholds: {
          minFaceDistance: avgDistance * 0.8, 
          maxFaceDistance: avgDistance * 1.2, 
          minLighting: Math.max(0, avgLighting - 30),
          maxLighting: Math.min(255, avgLighting + 30), 
        },
        environment: {
          lighting: {
            average: Math.round(avgLighting),
            min: Math.round(
              Math.min(...stats.lightingLevels)
            ),
            max: Math.round(
              Math.max(...stats.lightingLevels)
            ),
          },
          distance: {
            average: Math.round(avgDistance),
            min: Math.round(
              Math.min(...stats.faceDistances)
            ),
            max: Math.round(
              Math.max(...stats.faceDistances)
            ),
          },
        },
      };

      setCalibrationData(calibrationData);

      // Send calibration data to backend
      try {
        const authToken = typeof token === 'function' ? await token() : token;
        const result = await examService.saveCalibration(
          authToken,
          sessionId,
          calibrationData
        );
        
        // Save session data so the "Continue to Exam" button can utilize it
        setCalibrationData(prev => ({
          ...prev,
          session: result.session
        }));
      } catch (error) {
        console.error("Error saving calibration data:", error);
        setStatus("error");
        onCalibrationFailed?.(error.message);
      }
    } catch (error) {
      console.error("Error completing calibration:", error);
      setStatus("error");
      onCalibrationFailed?.(error.message);
    }
  };

  return (
    <div className="calibration-screen">
      <div className="calibration-container">
        <div className="calibration-header">
          <h2>Camera Calibration</h2>
          <p>
            We're calibrating your camera for optimal face
            detection. Please position your face in the center
            and keep it steady.
          </p>
        </div>

        {status === "loading" && (
          <div className="calibration-status">
            <div className="loading-spinner"></div>
            <p>Loading face detection models...</p>
            <p style={{ fontSize: "12px", color: "#666", marginTop: "10px" }}>
              This will start automatically in a moment...
            </p>
          </div>
        )}

        {status === "calibrating" && (
          <div className="calibration-active">
            <div className="camera-section">
              <CameraFeed
                videoRef={videoRef}
                canvasRef={canvasRef}
                isActive={true}
                showCanvas={true}
                width={640}
                height={480}
                onFrame={handleFrame}
              />
            </div>

            <div className="calibration-info">
              <div className="timer">
                Time Remaining: {timeRemaining}s
              </div>

              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Frames</span>
                  <span className="stat-value">
                    {faceDetectionStats.framesAnalyzed}
                  </span>
                </div>
              </div>

              <div className="instructions">
                <ul>
                  <li>
                    Keep your face centered in
                    the frame
                  </li>
                  <li>Ensure adequate lighting</li>
                  <li>
                    Avoid wearing sunglasses or
                    hats
                  </li>
                  <li>
                    Keep a neutral facial
                    expression
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {status === "complete" && (
          <div className="calibration-complete">
            <h3>Calibration Complete!</h3>
            <p>Your camera has been calibrated successfully.</p>

            {calibrationData && (
              <>
                <div className="calibration-results">
                  <p>
                    Faces Detected: {calibrationData.facesDetected}
                  </p>
                  <p>
                    Detection Rate:{" "}
                    {calibrationData.detectionRate}%
                  </p>
                  <p>
                    Lighting: {
                      calibrationData.environment
                        .lighting.average
                    }{" "}
                    ({calibrationData.environment
                      .lighting.average < 100
                      ? "Low"
                      : calibrationData.environment
                          .lighting.average < 180
                      ? "Medium"
                      : "High"}
                    )
                  </p>
                </div>
                
                <button
                  className="calibration-btn-retry"
                  onClick={() => onCalibrationComplete?.(calibrationData.session)}
                  style={{ marginTop: '20px', backgroundColor: '#4CAF50', color: 'white', border: 'none' }}
                  disabled={!calibrationData.session}
                >
                  {calibrationData.session ? "Continue to Exam" : "Saving..."}
                </button>
              </>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="calibration-error">
            <p>
              Calibration failed. Please try again.
            </p>
            <button
              className="calibration-btn-retry"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CalibrationScreen;
