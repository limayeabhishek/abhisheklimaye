import React, { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AuthContext, DISABLED_ACCOUNT_MESSAGE } from './useAuth';

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [disabledNotice, setDisabledNotice] = useState('');

  const clearDisabledNotice = useCallback(() => {
    setDisabledNotice('');
  }, []);

  const clearAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  const fetchAndValidateProfile = useCallback(
    async (activeSession) => {
      if (!supabase || !activeSession?.user) {
        clearAuthState();
        return null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, role, status, created_at')
        .eq('id', activeSession.user.id)
        .maybeSingle();

      if (error) {
        console.error('Failed to load profile:', error.message);
      }

      if (data?.status === 'disabled') {
        await supabase.auth.signOut();
        clearAuthState();
        setDisabledNotice(DISABLED_ACCOUNT_MESSAGE);
        return null;
      }

      setSession(activeSession);
      setUser(activeSession.user);
      setProfile(
        data || {
          id: activeSession.user.id,
          email: activeSession.user.email || '',
          display_name:
            activeSession.user.user_metadata?.display_name ||
            (activeSession.user.email ? activeSession.user.email.split('@')[0] : 'Operator'),
          role: 'user',
          status: 'active',
        }
      );
      return data;
    },
    [clearAuthState]
  );

  const refreshProfile = useCallback(async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      clearAuthState();
      return null;
    }
    return await fetchAndValidateProfile(data.session);
  }, [clearAuthState, fetchAndValidateProfile]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const initAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (data?.session) {
          await fetchAndValidateProfile(data.session);
        } else {
          clearAuthState();
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        if (isMounted) clearAuthState();
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      if (!nextSession) {
        clearAuthState();
        setLoading(false);
        return;
      }
      setLoading(true);
      fetchAndValidateProfile(nextSession).finally(() => {
        if (isMounted) setLoading(false);
      });
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, [clearAuthState, fetchAndValidateProfile]);

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearAuthState();
  }, [clearAuthState]);

  const isActiveUser = Boolean(user && profile && profile.status === 'active');
  const isAdmin = Boolean(isActiveUser && profile?.role === 'admin');

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        isActiveUser,
        isAdmin,
        disabledNotice,
        clearDisabledNotice,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
