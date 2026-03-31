import React, { useState, useRef } from 'react';
import './VideoPlayer.css';

const VideoPlayer = ({ src, poster }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const videoRef = useRef(null);

  const handleCanPlay = () => {
    setLoading(false);
  };

  const handleWaiting = () => {
    setLoading(true);
  };

  const handlePlaying = () => {
    setLoading(false);
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
  };

  return (
    <div className="video-player-wrapper">
      {loading && !error && (
        <div className="video-loader">
          <div className="spinner"></div>
          <p>Processing video. Please wait...</p>
        </div>
      )}
      
      {error && (
        <div className="video-error">
          <p>Video is not ready yet or unavailable.</p>
          <button 
            className="video-retry-btn" 
            onClick={() => {
              setError(false);
              setLoading(true);
              if (videoRef.current) {
                videoRef.current.load();
              }
            }}
          >
            Retry
          </button>
        </div>
      )}
      
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        controls
        preload="metadata"
        onCanPlay={handleCanPlay}
        onWaiting={handleWaiting}
        onPlaying={handlePlaying}
        onError={handleError}
        style={{ 
          display: error ? 'none' : 'block',
        }}
      />
    </div>
  );
};

export default VideoPlayer;
