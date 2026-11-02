import { createSlice } from '@reduxjs/toolkit';

export const SESSION_EXPIRED_NOTICE = 'انتهت جلستك تلقائياً حفاظاً على أمان حسابك. سجّل الدخول من جديد للمتابعة.';

// Reads the expiry time (ms) from the JWT payload; null if it can't be read.
export const tokenExpiresAt = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

const storedUser = localStorage.getItem('user');
const storedToken = localStorage.getItem('token');

// A session that ran out while the app was closed ends right away.
const storedExpired = !!storedToken && (tokenExpiresAt(storedToken) ?? Infinity) <= Date.now();
if (storedExpired) {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
}

const initialState = {
  user: storedUser && !storedExpired ? JSON.parse(storedUser) : null,
  token: storedToken && !storedExpired ? storedToken : null,
  // Message for the login page explaining why the user was signed out
  notice: storedExpired ? SESSION_EXPIRED_NOTICE : null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { user, token } = action.payload;
      state.user = user;
      state.token = token;
      state.notice = null;
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
    },
    // Optional payload: the reason to show on the login page.
    logout: (state, action) => {
      state.user = null;
      state.token = null;
      state.notice = action.payload || null;
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;

export const selectCurrentUser = (state) => state.auth.user;
export const selectCurrentToken = (state) => state.auth.token;
export const selectAuthNotice = (state) => state.auth.notice;
export const selectSessionExpiresAt = (state) => (state.auth.token ? tokenExpiresAt(state.auth.token) : null);
