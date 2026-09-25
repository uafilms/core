import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from '../api/axios.js';
import { syncWithCloud } from '../utils/sync.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('uafilms_auth_token'));
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const performSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await syncWithCloud();
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const fetchCurrentUser = useCallback(async (authToken) => {
    if (!authToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await axios.get('/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.data?.user) {
        setUser(res.data.user);
        // Automatically sync cloud data on active session restore
        performSync();
      } else {
        setUser(null);
        localStorage.removeItem('uafilms_auth_token');
        setToken(null);
      }
    } catch {
      setUser(null);
      localStorage.removeItem('uafilms_auth_token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, [performSync]);

  useEffect(() => {
    fetchCurrentUser(token);
  }, [token, fetchCurrentUser]);

  // Auto-sync on window focus, tab visibility or returning online
  useEffect(() => {
    let lastAutoSync = Date.now();
    const triggerAutoSync = () => {
      const curToken = localStorage.getItem('uafilms_auth_token');
      if (!curToken) return;
      const now = Date.now();
      // Auto-sync if at least 30s passed since last sync
      if (now - lastAutoSync > 30000) {
        lastAutoSync = now;
        performSync();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerAutoSync();
      }
    };

    window.addEventListener('focus', triggerAutoSync);
    window.addEventListener('online', triggerAutoSync);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', triggerAutoSync);
      window.removeEventListener('online', triggerAutoSync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [performSync]);

  const login = async (email, password) => {
    try {
      const res = await axios.post('/auth/login', { email, password });
      const newToken = res.data?.token;
      const newUser = res.data?.user;
      if (newToken && newUser) {
        localStorage.setItem('uafilms_auth_token', newToken);
        setToken(newToken);
        setUser(newUser);
        setIsAuthModalOpen(false);
        // Trigger initial bi-directional sync after login
        performSync();
        return { success: true };
      }
      return { success: false, error: 'Некоректна відповідь сервера' };
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Помилка авторизації';
      return { success: false, error: msg };
    }
  };

  const register = async (email, password) => {
    try {
      const res = await axios.post('/auth/register', { email, password });
      const newToken = res.data?.token;
      const newUser = res.data?.user;
      if (newToken && newUser) {
        localStorage.setItem('uafilms_auth_token', newToken);
        setToken(newToken);
        setUser(newUser);
        setIsAuthModalOpen(false);
        // Trigger initial sync after registration
        performSync();
        return { success: true };
      }
      return { success: false, error: 'Некоректна відповідь сервера' };
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Помилка реєстрації';
      return { success: false, error: msg };
    }
  };

  const logout = () => {
    localStorage.removeItem('uafilms_auth_token');
    setToken(null);
    setUser(null);
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const res = await axios.post('/auth/change-password', { currentPassword, newPassword });
      return { success: true, message: res.data?.message || 'Пароль успішно змінено' };
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Помилка зміни паролю';
      return { success: false, error: msg };
    }
  };

  const deleteAccount = async (password) => {
    try {
      const res = await axios.delete('/auth/account', { data: { password } });
      logout();
      return { success: true, message: res.data?.message || 'Акаунт видалено' };
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Помилка видалення акаунту';
      return { success: false, error: msg };
    }
  };

  const refreshUser = () => {
    return fetchCurrentUser(token);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isSyncing,
        syncNow: performSync,
        isAuthModalOpen,
        setIsAuthModalOpen,
        login,
        register,
        logout,
        changePassword,
        deleteAccount,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
