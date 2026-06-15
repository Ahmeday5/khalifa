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
import {
  Category,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from '../models/category.model';

const CATEGORIES_CACHE_KEY = 'categories';
const CATEGORIES_TTL_MS = 10 * 60 * 1000; // 10 min — categories rarely change

/**
 * `/dashboard/categories` facade.
 *
 *   - reads use a longer TTL (10 min) since categories are slow-moving
 *   - mutations invalidate the `categories` cache key + the `products`
 *     key, since cached product lists embed a `categoryName` that may
 *     no longer be accurate after a rename
 */
@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly api = inject(ApiService);

  // ─────────── reads ───────────

  list(query: PagedQuery = {}): Observable<PagedResponse<Category>> {
    return this.api.get<PagedResponse<Category>>(API_ENDPOINTS.categories.base, {
      params: this.toParams(query),
      context: withCache({ ttlMs: CATEGORIES_TTL_MS }),
    });
  }

  refreshList(query: PagedQuery = {}): Observable<PagedResponse<Category>> {
    return this.api.get<PagedResponse<Category>>(API_ENDPOINTS.categories.base, {
      params: this.toParams(query),
      context: withCacheBypass(withCache({ ttlMs: CATEGORIES_TTL_MS })),
    });
  }

  /** Flat list for dropdowns — drains every page. */
  listAll(): Observable<Category[]> {
    return fetchAllPages<Category>((pageIndex, pageSize) =>
      this.list({ pageIndex, pageSize }).pipe(
        map((res) => asPaged<Category>(res)),
      ),
    );
  }

  getById(id: number): Observable<Category> {
    return this.api.get<Category>(API_ENDPOINTS.categories.byId(id), {
      context: withCache({ ttlMs: CATEGORIES_TTL_MS }),
    });
  }

  // ─────────── writes ───────────

  create(payload: CreateCategoryPayload): Observable<Category> {
    return this.api.post<Category>(
      API_ENDPOINTS.categories.base,
      this.normalize(payload),
      {
        context: withInlineHandling(
          withCacheInvalidate([CATEGORIES_CACHE_KEY, 'product']),
        ),
      },
    );
  }

  update(id: number, payload: UpdateCategoryPayload): Observable<Category> {
    return this.api.put<Category>(
      API_ENDPOINTS.categories.byId(id),
      this.normalize(payload),
      {
        context: withInlineHandling(
          withCacheInvalidate([CATEGORIES_CACHE_KEY, 'product']),
        ),
      },
    );
  }

  delete(id: number): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(
      API_ENDPOINTS.categories.byId(id),
      {
        context: withInlineHandling(
          withCacheInvalidate([CATEGORIES_CACHE_KEY, 'product']),
        ),
      },
    );
  }

  // ─────────── helpers ───────────

  private toParams(query: PagedQuery): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      search: query.search ?? '',
    };
  }

  private normalize(payload: CreateCategoryPayload): CreateCategoryPayload {
    return { name: payload.name.trim() };
  }
}
