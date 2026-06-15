import { UserRole } from '../../../core/models/auth.model';

export interface AppUser {
  id: string;
  email: string;
  phoneNumber: string | null;
  role: UserRole;
}

export interface CreateAppUserPayload {
  email: string;
  phoneNumber: string;
  password: string;
  role: UserRole;
}
export interface UpdateAppUserPayload {
  email: string;
  phoneNumber: string;
  password?: string;
  role: UserRole;
}

export interface AppUserMutationResult {
  id: string;
  email: string;
  role: UserRole;
}

export interface RoleOption {
  id: UserRole;
  nameAr: string;
}
