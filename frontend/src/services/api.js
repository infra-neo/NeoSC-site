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

// Admin - Stats
export const getAdminStats = () => api.get('/admin/stats');

// Admin - Users
export const getAdminUsers = () => api.get('/admin/users');
export const createAdminUser = (data) => api.post('/admin/users', data);
export const updateAdminUser = (userId, data) => api.put(`/admin/users/${userId}`, data);
export const deleteAdminUser = (userId) => api.delete(`/admin/users/${userId}`);

// Admin - Orders
export const getAdminOrders = () => api.get('/admin/orders');

// Admin - Groups
export const getAdminGroups = () => api.get('/admin/groups');
export const createAdminGroup = (data) => api.post('/admin/groups', data);
export const updateAdminGroup = (groupId, data) => api.put(`/admin/groups/${groupId}`, data);
export const deleteAdminGroup = (groupId) => api.delete(`/admin/groups/${groupId}`);
export const addGroupMember = (groupId, userId) => api.post(`/admin/groups/${groupId}/members?user_id=${userId}`);
export const removeGroupMember = (groupId, memberId) => api.delete(`/admin/groups/${groupId}/members/${memberId}`);

// Admin - Roles
export const getAdminRoles = () => api.get('/admin/roles');
export const createAdminRole = (data) => api.post('/admin/roles', data);
export const updateAdminRole = (roleId, data) => api.put(`/admin/roles/${roleId}`, data);
export const deleteAdminRole = (roleId) => api.delete(`/admin/roles/${roleId}`);

// Admin - ACLs
export const getAdminAcls = () => api.get('/admin/acls');
export const createAdminAcl = (data) => api.post('/admin/acls', data);
export const updateAdminAcl = (aclId, data) => api.put(`/admin/acls/${aclId}`, data);
export const deleteAdminAcl = (aclId) => api.delete(`/admin/acls/${aclId}`);

// Admin - Policies
export const getAdminPolicies = () => api.get('/admin/policies');
export const createAdminPolicy = (data) => api.post('/admin/policies', data);
export const updateAdminPolicy = (policyId, data) => api.put(`/admin/policies/${policyId}`, data);
export const deleteAdminPolicy = (policyId) => api.delete(`/admin/policies/${policyId}`);

// Admin - VMs
export const getAdminVMs = () => api.get('/admin/vms');
export const createAdminVM = (data) => api.post('/admin/vms', data);
export const updateAdminVM = (vmId, data) => api.put(`/admin/vms/${vmId}`, data);
export const deleteAdminVM = (vmId) => api.delete(`/admin/vms/${vmId}`);
export const assignVM = (vmId, userIds, groupIds) => api.post(`/admin/vms/${vmId}/assign`, { user_ids: userIds, group_ids: groupIds });

// Onboarding
export const getOnboardingStatus = () => api.get('/onboarding/status');
export const setupOrganization = (data) => api.post('/onboarding/organization', data);
export const setupAdmin = (data) => api.post('/onboarding/admin', data);
export const setupPlan = (data) => api.post('/onboarding/plan', data);
export const completeOnboarding = () => api.post('/onboarding/complete');
export const completeTour = () => api.post('/onboarding/complete-tour');
export const getOnboardingSummary = () => api.get('/onboarding/summary');

export default api;
