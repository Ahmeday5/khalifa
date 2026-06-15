import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  DueInstallmentDto,
  HomeSummaryDto,
  ProfitMonthDto,
  TopClientDto,
} from '../models/dashboard.model';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import {
  withCache,
  withCacheBypass,
} from '../../../core/http/http-context.tokens';
import { toList } from '../../../core/utils/api-list.util';

/** All three dashboard widgets share the same staleness profile — a minute is plenty. */
const HOME_WIDGET_TTL_MS = 60 * 1000;

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);
  // ──────────────── live widgets ────────────────

  profitsLast6Months(): Observable<ProfitMonthDto[]> {
    return this.api
      .get<ProfitMonthDto[]>(API_ENDPOINTS.charts.profitsLast6Months, {
        context: withCache({ ttlMs: HOME_WIDGET_TTL_MS }),
      })
      .pipe(toList<ProfitMonthDto>());
  }

  refreshProfitsLast6Months(): Observable<ProfitMonthDto[]> {
    return this.api
      .get<ProfitMonthDto[]>(API_ENDPOINTS.charts.profitsLast6Months, {
        context: withCacheBypass(withCache({ ttlMs: HOME_WIDGET_TTL_MS })),
      })
      .pipe(toList<ProfitMonthDto>());
  }

  topClientsThisMonth(): Observable<TopClientDto[]> {
    return this.api
      .get<TopClientDto[]>(API_ENDPOINTS.clients.topThisMonth, {
        context: withCache({ ttlMs: HOME_WIDGET_TTL_MS }),
      })
      .pipe(toList<TopClientDto>());
  }

  refreshTopClientsThisMonth(): Observable<TopClientDto[]> {
    return this.api
      .get<TopClientDto[]>(API_ENDPOINTS.clients.topThisMonth, {
        context: withCacheBypass(withCache({ ttlMs: HOME_WIDGET_TTL_MS })),
      })
      .pipe(toList<TopClientDto>());
  }

  installmentsDueThisWeek(): Observable<DueInstallmentDto[]> {
    return this.api
      .get<DueInstallmentDto[]>(API_ENDPOINTS.installments.dueThisWeek, {
        context: withCache({ ttlMs: HOME_WIDGET_TTL_MS }),
      })
      .pipe(toList<DueInstallmentDto>());
  }

  refreshInstallmentsDueThisWeek(): Observable<DueInstallmentDto[]> {
    return this.api
      .get<DueInstallmentDto[]>(API_ENDPOINTS.installments.dueThisWeek, {
        context: withCacheBypass(withCache({ ttlMs: HOME_WIDGET_TTL_MS })),
      })
      .pipe(toList<DueInstallmentDto>());
  }

  homeSummary(): Observable<HomeSummaryDto> {
    return this.api.get<HomeSummaryDto>(API_ENDPOINTS.dashboard.homeSummary, {
      context: withCache({ ttlMs: HOME_WIDGET_TTL_MS }),
    });
  }

  refreshHomeSummary(): Observable<HomeSummaryDto> {
    return this.api.get<HomeSummaryDto>(API_ENDPOINTS.dashboard.homeSummary, {
      context: withCacheBypass(withCache({ ttlMs: HOME_WIDGET_TTL_MS })),
    });
  }
}
