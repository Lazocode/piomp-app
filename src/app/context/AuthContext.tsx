'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  failedAttempts: number;
  isLocked: boolean;
  lockoutRemaining: number;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, pass: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  demoLogin: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000; // 60 segundos de bloqueio

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Inicialização preguiçosa (lazy initializers) em conformidade estrita com o React 19
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('poimp_auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [loading] = useState(false);

  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      const stored = localStorage.getItem('poimp_failed_attempts');
      return stored ? parseInt(stored, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem('poimp_lockout_until');
      return stored ? parseInt(stored, 10) || null : null;
    } catch {
      return null;
    }
  });

  const [lockoutRemaining, setLockoutRemaining] = useState<number>(0);

  // Intervalo assíncrono para atualizar o contador de bloqueio
  useEffect(() => {
    if (!lockoutUntil) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((lockoutUntil - now) / 1000));
      setLockoutRemaining(remaining);

      if (remaining <= 0) {
        setLockoutUntil(null);
        setFailedAttempts(0);
        try {
          localStorage.removeItem('poimp_lockout_until');
          localStorage.removeItem('poimp_failed_attempts');
        } catch {
          // Ignora erro em localStorage
        }
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const isLocked = lockoutRemaining > 0;

  const login = useCallback(
    async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
      if (lockoutRemaining > 0) {
        return {
          success: false,
          error: `Acesso bloqueado por segurança. Aguarde ${lockoutRemaining} segundos.`,
        };
      }

      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'login', email, password: pass }),
        });
        const data = await res.json();

        if (!res.ok) {
          const nextAttempts = failedAttempts + 1;
          setFailedAttempts(nextAttempts);
          try {
            localStorage.setItem('poimp_failed_attempts', String(nextAttempts));
          } catch {
            // Ignora erro em localStorage
          }

          if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
            const now = Date.now();
            const until = now + LOCKOUT_DURATION_MS;
            setLockoutUntil(until);
            setLockoutRemaining(Math.ceil(LOCKOUT_DURATION_MS / 1000));
            try {
              localStorage.setItem('poimp_lockout_until', String(until));
            } catch {
              // Ignora erro em localStorage
            }
            return {
              success: false,
              error: 'Limite de tentativas excedido (5). Por segurança, login suspenso por 60 segundos.',
            };
          }

          const remainingTries = MAX_FAILED_ATTEMPTS - nextAttempts;
          return {
            success: false,
            error: `${data.error || 'Credenciais inválidas.'} (${remainingTries} tentativa${remainingTries > 1 ? 's' : ''} restante${remainingTries > 1 ? 's' : ''})`,
          };
        }

        // Sucesso: reseta tentativas e grava sessão
        setFailedAttempts(0);
        setLockoutUntil(null);
        setLockoutRemaining(0);
        try {
          localStorage.removeItem('poimp_failed_attempts');
          localStorage.removeItem('poimp_lockout_until');
          localStorage.setItem('poimp_auth_user', JSON.stringify(data.user));
        } catch {
          // Ignora erro em localStorage
        }
        setUser(data.user);

        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha na conexão';
        return { success: false, error: msg };
      }
    },
    [lockoutRemaining, failedAttempts]
  );

  const signup = useCallback(
    async (email: string, pass: string, name?: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'signup', email, password: pass, name }),
        });
        const data = await res.json();

        if (!res.ok) {
          return { success: false, error: data.error || 'Erro ao criar conta.' };
        }

        try {
          localStorage.setItem('poimp_auth_user', JSON.stringify(data.user));
        } catch {
          // Ignora erro em localStorage
        }
        setUser(data.user);
        return { success: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao registrar conta';
        return { success: false, error: msg };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch {
      // Ignora erro no logout
    } finally {
      setUser(null);
      try {
        localStorage.removeItem('poimp_auth_user');
      } catch {
        // Ignora erro em localStorage
      }
    }
  }, []);

  const demoLogin = useCallback(async () => {
    return login('estudante@poimp.com', 'Estudo@2026');
  }, [login]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        failedAttempts,
        isLocked,
        lockoutRemaining,
        login,
        signup,
        logout,
        demoLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um <AuthProvider />');
  }
  return context;
}
