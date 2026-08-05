import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import boardReducer from './boardSlice';
import dashboardReducer from './dashboardSlice';

export const store = configureStore({
  reducer: {
    auth:      authReducer,
    board:     boardReducer,
    dashboard: dashboardReducer,
  },
});