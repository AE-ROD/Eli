export interface PermissionSet {
  appointments: {
    view: boolean
    viewAll: boolean
    create: boolean
    edit: boolean
    cancel: boolean
    complete: boolean
  }
  patients: {
    view: boolean
    create: boolean
    edit: boolean
    delete: boolean
    viewNotes: boolean
    editNotes: boolean
  }
  analytics: {
    view: boolean
    viewRevenue: boolean
  }
  settings: {
    view: boolean
    editServices: boolean
    editSchedule: boolean
    editBusiness: boolean
  }
  team: {
    view: boolean
    invite: boolean
    editRoles: boolean
    remove: boolean
    manageRoles: boolean
  }
  billing: {
    view: boolean
    manage: boolean
  }
  chats: {
    view: boolean
    reply: boolean
  }
  shiftNotes: {
    view: boolean
    viewHistory: boolean
    create: boolean
    edit: boolean
    editAll: boolean
    resolve: boolean
    delete: boolean
  }
  shiftClose: {
    view: boolean
    viewAll: boolean
    create: boolean
    edit: boolean
    review: boolean
    delete: boolean
  }
  reports: {
    view: boolean
    viewRevenue: boolean
    viewStaff: boolean
    export: boolean
    schedule: boolean
  }
}

export type SystemRole = "owner" | "admin" | "manager" | "worker" | "viewer"

export const ROLE_DEFAULTS: Record<SystemRole, PermissionSet> = {
  owner: {
    appointments: { view: true, viewAll: true, create: true, edit: true, cancel: true, complete: true },
    patients: { view: true, create: true, edit: true, delete: true, viewNotes: true, editNotes: true },
    analytics: { view: true, viewRevenue: true },
    settings: { view: true, editServices: true, editSchedule: true, editBusiness: true },
    team: { view: true, invite: true, editRoles: true, remove: true, manageRoles: true },
    billing: { view: true, manage: true },
    chats: { view: true, reply: true },
    shiftNotes: { view: true, viewHistory: true, create: true, edit: true, editAll: true, resolve: true, delete: true },
    shiftClose: { view: true, viewAll: true, create: true, edit: true, review: true, delete: true },
    reports: { view: true, viewRevenue: true, viewStaff: true, export: true, schedule: true },
  },
  admin: {
    appointments: { view: true, viewAll: true, create: true, edit: true, cancel: true, complete: true },
    patients: { view: true, create: true, edit: true, delete: true, viewNotes: true, editNotes: true },
    analytics: { view: true, viewRevenue: true },
    settings: { view: true, editServices: true, editSchedule: true, editBusiness: true },
    team: { view: true, invite: true, editRoles: true, remove: true, manageRoles: false },
    billing: { view: true, manage: false },
    chats: { view: true, reply: true },
    shiftNotes: { view: true, viewHistory: true, create: true, edit: true, editAll: true, resolve: true, delete: true },
    shiftClose: { view: true, viewAll: true, create: true, edit: true, review: true, delete: false },
    reports: { view: true, viewRevenue: true, viewStaff: true, export: true, schedule: true },
  },
  manager: {
    appointments: { view: true, viewAll: true, create: true, edit: true, cancel: true, complete: true },
    patients: { view: true, create: true, edit: true, delete: false, viewNotes: true, editNotes: true },
    analytics: { view: true, viewRevenue: false },
    settings: { view: true, editServices: false, editSchedule: true, editBusiness: false },
    team: { view: true, invite: false, editRoles: false, remove: false, manageRoles: false },
    billing: { view: false, manage: false },
    chats: { view: true, reply: true },
    shiftNotes: { view: true, viewHistory: true, create: true, edit: true, editAll: false, resolve: true, delete: false },
    shiftClose: { view: true, viewAll: true, create: true, edit: true, review: false, delete: false },
    reports: { view: true, viewRevenue: false, viewStaff: true, export: true, schedule: false },
  },
  worker: {
    appointments: { view: true, viewAll: false, create: true, edit: true, cancel: false, complete: true },
    patients: { view: true, create: true, edit: false, delete: false, viewNotes: true, editNotes: false },
    analytics: { view: false, viewRevenue: false },
    settings: { view: false, editServices: false, editSchedule: false, editBusiness: false },
    team: { view: true, invite: false, editRoles: false, remove: false, manageRoles: false },
    billing: { view: false, manage: false },
    chats: { view: true, reply: true },
    shiftNotes: { view: true, viewHistory: false, create: true, edit: true, editAll: false, resolve: false, delete: false },
    shiftClose: { view: true, viewAll: false, create: true, edit: true, review: false, delete: false },
    reports: { view: false, viewRevenue: false, viewStaff: false, export: false, schedule: false },
  },
  viewer: {
    appointments: { view: true, viewAll: false, create: false, edit: false, cancel: false, complete: false },
    patients: { view: true, create: false, edit: false, delete: false, viewNotes: false, editNotes: false },
    analytics: { view: true, viewRevenue: false },
    settings: { view: true, editServices: false, editSchedule: false, editBusiness: false },
    team: { view: true, invite: false, editRoles: false, remove: false, manageRoles: false },
    billing: { view: false, manage: false },
    chats: { view: true, reply: false },
    shiftNotes: { view: true, viewHistory: false, create: false, edit: false, editAll: false, resolve: false, delete: false },
    shiftClose: { view: true, viewAll: false, create: false, edit: false, review: false, delete: false },
    reports: { view: true, viewRevenue: false, viewStaff: false, export: false, schedule: false },
  },
}
