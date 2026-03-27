import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('active_session');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  // 🟢 REGISTRATION LOGIC
  const register = (username, email, password) => {
    const users = JSON.parse(localStorage.getItem('users_db') || '[]');
    
    // Check if username already exists
    if (users.find(u => u.username === username)) {
      return { success: false, message: "Username already taken" };
    }

    const newUser = { username, email, password, tier: 'PRO' };
    users.push(newUser);
    localStorage.setItem('users_db', JSON.stringify(users));
    return { success: true };
  };

  // 🟢 LOGIN LOGIC
  const login = (username, password) => {
    const users = JSON.parse(localStorage.getItem('users_db') || '[]');
    const foundUser = users.find(u => u.username === username && u.password === password);

    if (foundUser) {
      const sessionData = { username: foundUser.username, tier: foundUser.tier };
      localStorage.setItem('active_session', JSON.stringify(sessionData));
      setUser(sessionData);
      return { success: true };
    } else {
      return { success: false, message: "Incorrect username or password" };
    }
  };

  const logout = () => {
    localStorage.removeItem('active_session');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);