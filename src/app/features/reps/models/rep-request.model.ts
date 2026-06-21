import { PagedResponse } from '../../../core/models/api-response.model';

/** Single row from `GET /dashboard/representative-requests`. */
export interface RepRequest {
  id: number;
  representativeId: number;
  representativeName: string;
  description: string;
  createdAt: string;
}

export type RepRequestsPage = PagedResponse<RepRequest>;

export interface RepRequestsQuery {
  pageIndex?: number;
  pageSize?: number;
  search?: string;
}
