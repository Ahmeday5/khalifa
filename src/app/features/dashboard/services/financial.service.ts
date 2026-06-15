import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import {
  withCache,
  withCacheBypass,
} from '../../../core/http/http-context.tokens';
import { FinancialSeparation } from '../models/financial.model';

const FINANCIAL_TTL_MS = 60 * 1000; // 1 min — figures change with every payment/invoice

@Injectable({ providedIn: 'root' })
export class FinancialService {
  private readonly api = inject(ApiService);

  separation(): Observable<FinancialSeparation> {
    return this.api.get<FinancialSeparation>(
      API_ENDPOINTS.financial.separation,
      { context: withCache({ ttlMs: FINANCIAL_TTL_MS }) },
    );
  }

  refreshSeparation(): Observable<FinancialSeparation> {
    return this.api.get<FinancialSeparation>(
      API_ENDPOINTS.financial.separation,
      { context: withCacheBypass(withCache({ ttlMs: FINANCIAL_TTL_MS })) },
    );
  }
}
