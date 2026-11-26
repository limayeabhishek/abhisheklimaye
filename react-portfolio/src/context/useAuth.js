import { createContext, useContext } from 'react';

export const DISABLED_ACCOUNT_MESSAGE = 'Your account has been disabled by the administrator.';

export const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isActiveUser: false,
  isAdmin: false,
  disabledNotice: '',
  clearDisabledNotice: () => {},
  signOut: async () => {},
  refreshProfile: async () => null,
});

export const useAuth = () => useContext(AuthContext);
