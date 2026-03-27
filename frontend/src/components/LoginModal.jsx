import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginModal({ isOpen, onClose, initialMode = 'login' }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const { login, register } = useAuth();

  // Reset modal state whenever it opens
  useEffect(() => {
    if (isOpen) {
      setIsRegistering(initialMode === 'register');
      setUsername('');
      setEmail('');
      setPassword('');
      setError('');
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (isRegistering) {
      if (!username || !email || !password) {
        setError("All fields are required");
        return;
      }
      const result = register(username, email, password);
      if (result.success) {
        setIsRegistering(false); 
        setError("Registration successful! Please login.");
      } else {
        setError(result.message);
      }
    } else {
      const result = login(username, password);
      if (result.success) {
        onClose();
      } else {
        setError("Incorrect username or password");
      }
    }
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <h2 style={{ color: '#fff', fontFamily: 'DM Serif Display', marginBottom: 20 }}>
          {isRegistering ? 'Create Account' : 'Terminal Access'}
        </h2>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={inputStyle}
          />
          
          {isRegistering && (
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          )}

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />

          {error && <div style={errorStyle}>⚠️ {error}</div>}

          <button type="submit" style={buttonStyle}>
            {isRegistering ? 'REGISTER' : 'INITIALIZE SESSION'}
          </button>
        </form>

        <p 
          onClick={() => { setIsRegistering(!isRegistering); setError(''); }} 
          style={toggleTextStyle}
        >
          {isRegistering ? 'Already have an account? Sign In' : 'Need access? Register Free'}
        </p>
      </div>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(1, 8, 16, 0.85)', backdropFilter: 'blur(12px)' };
const modalStyle = { background: 'rgba(8, 20, 36, 0.98)', border: '1px solid rgba(0, 180, 255, 0.3)', padding: 40, borderRadius: 20, width: 360, textAlign: 'center' };
const inputStyle = { width: '100%', padding: '12px', marginBottom: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0, 180, 255, 0.2)', borderRadius: 8, color: '#fff', outline: 'none' };
const buttonStyle = { width: '100%', padding: '14px', background: '#00d4ff', color: '#010810', borderRadius: 8, fontWeight: '700', cursor: 'pointer', border: 'none' };
const errorStyle = { color: '#ff4d4d', fontSize: '12px', marginBottom: 12, textAlign: 'left', fontFamily: 'JetBrains Mono' };
const toggleTextStyle = { marginTop: 20, color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' };