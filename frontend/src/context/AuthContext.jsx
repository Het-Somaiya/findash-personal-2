import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // 1. Initialize user as null
  const [user, setUser] = useState(null);
  // 2. Loading state to prevent the UI from flickering 
  const [loading, setLoading] = useState(true);

  // 3. THE MEMORY CHECK: Runs once when the browser loads/refreshes
  useEffect(() => {
    const savedToken = localStorage.getItem('access_token');
    const savedUser = localStorage.getItem('user_data');

    if (savedToken && savedUser) {
      // Restore the session from local storage
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const login = (username) => {
    const userData = { username, tier: 'PRO' };
    
    // Save to browser memory (Persistence)
    localStorage.setItem('access_token', 'mock_jwt_123');
    localStorage.setItem('user_data', JSON.stringify(userData));
    
    // Update active state
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_data');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, logout, isAuthenticated: !!user, loading }}
    >
      {/* Don't render the app until we've checked for the token */}
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);