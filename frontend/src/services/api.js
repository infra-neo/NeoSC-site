import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Plans
export const getPlans = () => api.get('/plans');
export const getPlan = (planId) => api.get(`/plans/${planId}`);

// Orders
export const createOrder = (data) => api.post('/orders', data);
export const getOrders = () => api.get('/orders');
export const getOrder = (orderId) => api.get(`/orders/${orderId}`);

// Billing
export const simulatePayment = (orderId) => api.post('/billing/simulate', { order_id: orderId });

// VMs
export const getVMs = () => api.get('/vms');
export const getVM = (vmId) => api.get(`/vms/${vmId}`);
export const getVMMetrics = (vmId) => api.get(`/vms/${vmId}/metrics`);
export const restartVM = (vmId) => api.post(`/vms/${vmId}/restart`);
export const createSnapshot = (vmId) => api.post(`/vms/${vmId}/snapshot`);
export const getAccessUrl = (vmId) => api.get(`/vms/${vmId}/access-url`);

// Admin
export const getAdminStats = () => api.get('/admin/stats');
export const getAdminUsers = () => api.get('/admin/users');
export const getAdminOrders = () => api.get('/admin/orders');

export default api;
