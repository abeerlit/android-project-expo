export interface DirectoryContact {
  extId: number;
  name: string;
  tenantId: number;
  number: string;
  email: string;
  peerName: string;
  type: string;
  company: string;
  branchId: string;
  avatarPath: string | null;
  avatarThumbnailPath: string | null;
  coverPhoto: string;
  directDials: string[];
  userId: number;
  timezone: string | null;
  dnd: string;
}

export interface CompanyContact {
  extId: number;
  name: string;
  tenantId: number;
  number: string;
  email: string;
  peerName: string;
  type: string;
  company: string;
  branchId: string;
  avatarPath: string | null;
  avatarThumbnailPath: string | null;
  coverPhoto: string;
  directDials: string[];
  userId: number;
  timezone: string | null;
  dnd: string;
}

export interface PersonalContact {
  id: number;
  tenantId: number;
  userId: number;
  name: string;
  firstName: string;
  lastName: string;
  number: string;
  email: string;
  company: string;
  avatarPath: string | null;
  avatarThumbnailPath: string | null;
}

export interface PersonalContactCreate {
  firstName: string;
  lastName: string;
  number: string;
  email: string;
  company: string;
  favorite: number;
}

export type RecentContact = {
  name: string;
  number: string;
};

export interface PhoneContact {
  recordID: string;
  givenName: string;
  familyName: string;
  displayName: string;
  phoneNumbers: Array<{
    label: string;
    number: string;
  }>;
  emailAddresses?: Array<{
    label: string;
    email: string;
  }>;
  thumbnailPath?: string;
  hasThumbnail?: boolean;
}
