import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import { PagedQuery, PagedResponse } from '../../../core/models/api-response.model';
import {
  withCache,
  withCacheBypass,
  withCacheInvalidate,
  withInlineHandling,
} from '../../../core/http/http-context.tokens';
import { asPaged, fetchAllPages } from '../../../core/utils/api-list.util';
import { Area, CreateAreaPayload, UpdateAreaPayload } from '../models/area.model';

const AREAS_CACHE_KEY = 'areas';
const AREAS_TTL_MS = 10 * 60 * 1000; // 10 min — areas rarely change
/** Page size used by the client-form area picker — matches the "load 20 more on scroll" spec. */
export const AREAS_PICKER_PAGE_SIZE = 20;

/**
 * `/dashboard/areas` facade.
 *
 *   - reads use a longer TTL (10 min) since areas are slow-moving
 *   - mutations invalidate the `areas` cache key + the `clients` key, since
 *     cached client lists embed an `areaName` that may no longer be accurate
 *     after a rename
 */
@Injectable({ providedIn: 'root' })
export class AreasService {
  private readonly api = inject(ApiService);

  // ─────────── reads ───────────

  list(query: PagedQuery = {}): Observable<PagedResponse<Area>> {
    return this.api.get<PagedResponse<Area>>(API_ENDPOINTS.areas.base, {
      params: this.toParams(query),
      context: withCache({ ttlMs: AREAS_TTL_MS }),
    });
  }

  refreshList(query: PagedQuery = {}): Observable<PagedResponse<Area>> {
    return this.api.get<PagedResponse<Area>>(API_ENDPOINTS.areas.base, {
      params: this.toParams(query),
      context: withCacheBypass(withCache({ ttlMs: AREAS_TTL_MS })),
    });
  }

  /**
   * Drains *every* page matching `search` — used when the picker's search
   * box has a term, so results aren't capped to the first page/pageSize.
   * With no search term, callers should page normally (see `list`).
   */
  searchAll(search: string): Observable<Area[]> {
    return fetchAllPages<Area>((pageIndex, pageSize) =>
      this.list({ search, pageIndex, pageSize }).pipe(map((res) => asPaged<Area>(res))),
    );
  }

  getById(id: number): Observable<Area> {
    return this.api.get<Area>(API_ENDPOINTS.areas.byId(id), {
      context: withCache({ ttlMs: AREAS_TTL_MS }),
    });
  }

  // ─────────── writes ───────────

  create(payload: CreateAreaPayload): Observable<Area> {
    return this.api.post<Area>(API_ENDPOINTS.areas.base, this.normalize(payload), {
      context: withInlineHandling(withCacheInvalidate([AREAS_CACHE_KEY, 'client'])),
    });
  }

  update(id: number, payload: UpdateAreaPayload): Observable<Area> {
    return this.api.put<Area>(API_ENDPOINTS.areas.byId(id), this.normalize(payload), {
      context: withInlineHandling(withCacheInvalidate([AREAS_CACHE_KEY, 'client'])),
    });
  }

  delete(id: number): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(API_ENDPOINTS.areas.byId(id), {
      context: withInlineHandling(withCacheInvalidate([AREAS_CACHE_KEY, 'client'])),
    });
  }

  // ─────────── helpers ───────────

  private toParams(query: PagedQuery): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? AREAS_PICKER_PAGE_SIZE,
      search: query.search ?? '',
    };
  }

  private normalize(payload: CreateAreaPayload): CreateAreaPayload {
    return { name: payload.name.trim() };
  }
}
