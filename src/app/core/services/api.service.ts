import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpContext,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

export interface RequestOptions {
  params?: Record<string, unknown>;
  headers?: HttpHeaders | Record<string, string>;
  context?: HttpContext;
  responseType?: 'json' | 'blob' | 'text';
}

/**
 * Thin, typed wrapper around `HttpClient`.
 *
 * Responsibilities:
 *   - prepend the API base URL
 *   - serialize query params (skipping null/undefined/empty)
 *   - unwrap the standard `ApiResponse<T>` envelope when the server uses one
 *
 * Cross-cutting concerns (auth header, global loader, error toasts) live in
 * interceptors and are toggled per-request via HttpContext tokens — see
 * `core/http/http-context.tokens.ts`.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = this.normalizeBase(environment.apiUrl);

  get<T>(endpoint: string, options: RequestOptions = {}): Observable<T> {
    return this.http
      .get<ApiResponse<T> | T>(this.url(endpoint), this.opts(options))
      .pipe(map((res) => this.unwrap<T>(res)));
  }

  post<T>(
    endpoint: string,
    body: unknown,
    options: RequestOptions = {},
  ): Observable<T> {
    return this.http
      .post<ApiResponse<T> | T>(this.url(endpoint), body, this.opts(options))
      .pipe(map((res) => this.unwrap<T>(res)));
  }

  put<T>(
    endpoint: string,
    body: unknown,
    options: RequestOptions = {},
  ): Observable<T> {
    return this.http
      .put<ApiResponse<T> | T>(this.url(endpoint), body, this.opts(options))
      .pipe(map((res) => this.unwrap<T>(res)));
  }

  patch<T>(
    endpoint: string,
    body: unknown,
    options: RequestOptions = {},
  ): Observable<T> {
    return this.http
      .patch<ApiResponse<T> | T>(this.url(endpoint), body, this.opts(options))
      .pipe(map((res) => this.unwrap<T>(res)));
  }

  delete<T>(endpoint: string, options: RequestOptions = {}): Observable<T> {
    return this.http
      .delete<ApiResponse<T> | T>(this.url(endpoint), this.opts(options))
      .pipe(map((res) => this.unwrap<T>(res)));
  }

  // ─────────── internals ───────────

  private url(endpoint: string): string {
    return `${this.baseUrl}/${endpoint.replace(/^\//, '')}`;
  }

  private opts(options: RequestOptions): {
    params?: HttpParams;
    headers?: HttpHeaders | Record<string, string>;
    context?: HttpContext;
  } {
    return {
      params: options.params ? this.toParams(options.params) : undefined,
      headers: options.headers,
      context: options.context,
    };
  }

  private toParams(input: Record<string, unknown>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(input)) {
      if (value === null || value === undefined || value === '') continue;
      if (Array.isArray(value)) {
        for (const v of value) params = params.append(key, String(v));
      } else {
        params = params.set(key, String(value));
      }
    }
    return params;
  }

  /** Normalize both `{ data, success, ... }` envelopes and raw `<T>` payloads. */
  private unwrap<T>(res: ApiResponse<T> | T): T {
    if (res && typeof res === 'object' && 'data' in (res as object)) {
      const env = res as ApiResponse<T>;
      return (env.data ?? (env as unknown as T)) as T;
    }
    return res as T;
  }

  private normalizeBase(raw: string): string {
    return raw.replace(/\/+$/, '');
  }
}
