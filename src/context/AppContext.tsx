import React, { createContext, useContext, useEffect, useState } from 'react';
import { pb } from '../lib/pocketbase';
import { initDatabase } from '../db/database';
import type { User } from '../types';

interface AppContextType {
  isInitialized: boolean;
  isAuthenticated: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  currentDate: string;
  pbConnected: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [currentDate, setCurrentDate] = useState('');
  const [pbConnected, setPbConnected] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        await initDatabase();
        if (!mounted) return;
        setPbConnected(true);
        if (pb.authStore.isValid && pb.authStore.model) {
          const m: any = pb.authStore.model;
          setUser({ id: m.id, email: m.email, name: m.name || m.username || m.email, role: m.role || 'Administrator' });
          setIsAuthenticated(true);
          // Refresh session
          try {
            await pb.collection('users').authRefresh();
            if (mounted && pb.authStore.model) {
              const rm: any = pb.authStore.model;
              setUser({ id: rm.id, email: rm.email, name: rm.name || rm.username || rm.email, role: rm.role || 'Administrator' });
            }
          } catch {
            if (mounted) {
              pb.authStore.clear();
              setIsAuthenticated(false);
              setUser(null);
            }
          }
        }
      } catch (e) {
        console.error('PocketBase init failed', e);
        if (mounted) setPbConnected(false);
      } finally {
        if (mounted) setIsInitialized(true);
      }
    }
    init();

    const updateDate = () => {
      const now = new Date();
      setCurrentDate(now.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' }));
    };
    updateDate();
    const interval = setInterval(updateDate, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const auth = await pb.collection('users').authWithPassword(email.trim(), password);
      const m: any = auth.record;
      setUser({ id: m.id, email: m.email, name: m.name || m.username || m.email, role: m.role || 'Administrator' });
      setIsAuthenticated(true);
      return true;
    } catch (e) {
      console.error('Login failed', e);
      return false;
    }
  };

  const logout = () => {
    pb.authStore.clear();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AppContext.Provider value={{ isInitialized, isAuthenticated, user, login, logout, currentDate, pbConnected }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
