import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginModal({ isOpen, onClose }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  // Reset the form whenever the modal is opened or closed
  useEffect(() => {
    if (!isOpen) {
      setUsername('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    onClose();
  };

  const handleLogin = (e) => {
    if (e) e.preventDefault(); // Prevent page reload if used in a form

    // THE GUARD: Ensure username isn't empty or just whitespace
    if (!username.trim()) {
      setError('A valid Terminal ID is required');
      return;
    }

    // Success path
    login(username.trim());
    handleClose();
  };

  return (
    <div 
      onClick={handleClose} // Close when clicking the darkened backdrop
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(1, 8, 16, 0.85)', backdropFilter: 'blur(12px)',
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the box
        style={{
          background: 'rgba(8, 20, 36, 0.98)', 
          border: '1px solid rgba(0, 180, 255, 0.3)',
          padding: 40, borderRadius: 20, width: 360,
          boxShadow: '0 0 40px rgba(0, 212, 255, 0.15)',
          textAlign: 'center'
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: '32px', marginBottom: 8 }}>🔐</div>
          <h2 style={{ color: '#fff', fontSize: 24, fontFamily: 'DM Serif Display', margin: 0 }}>
            Terminal Access
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 8, fontFamily: 'JetBrains Mono' }}>
            SECURE_AUTH_REQUIRED
          </p>
        </div>
        
        <form onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Enter Username / ID"
            autoFocus
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (error) setError(''); // Clear error as user types
            }}
            style={{
              width: '100%', padding: '12px 16px', marginBottom: 8,
              background: 'rgba(0, 180, 255, 0.05)',
              border: `1px solid ${error ? '#ff4d4d' : 'rgba(0,180,255,0.2)'}`,
              borderRadius: 8, color: '#fff', outline: 'none',
              fontFamily: 'JetBrains Mono', fontSize: 14,
              transition: 'all 0.2s ease'
            }}
          />

          {error && (
            <div style={{ 
              color: '#ff4d4d', fontSize: '11px', marginBottom: 16, 
              textAlign: 'left', fontFamily: 'JetBrains Mono' 
            }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: '100%', padding: '14px', marginTop: 8,
              background: '#00d4ff', color: '#010810',
              borderRadius: 8, fontWeight: '700', cursor: 'pointer',
              border: 'none', fontSize: 14, letterSpacing: 1,
              transition: 'transform 0.1s active',
              boxShadow: '0 4px 15px rgba(0, 212, 255, 0.3)'
            }}
          >
            INITIALIZE SESSION
          </button>
        </form>

        <button 
          onClick={handleClose}
          style={{ 
            marginTop: 20, background: 'transparent', border: 'none', 
            color: 'rgba(255,255,255,0.3)', fontSize: '11px', 
            cursor: 'pointer', textDecoration: 'underline' 
          }}
        >
          Abort Connection
        </button>
      </div>
    </div>
  );
}